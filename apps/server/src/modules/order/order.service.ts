import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ORDER_STATUS,
  canSplitShipping,
  defaultGroupTypes,
  expandPartRows,
  formatProductModel,
  hasSocket,
  normalizeProductTypes,
  normalizeVersion,
  splitParts,
  toPieces,
} from '@hb-oms/shared';
import { Order } from './entities/order.entity';
import { OrderProduct } from './entities/order-product.entity';
import { OrderPartGroup } from './entities/order-part-group.entity';
import { OrderPart } from './entities/order-part.entity';
import {
  CreateOrderDto,
  CreateOrderProductDto,
  QueryOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { NumberGeneratorService } from '../../common/services/number-generator.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderProduct) private readonly productRepo: Repository<OrderProduct>,
    @InjectRepository(OrderPartGroup) private readonly groupRepo: Repository<OrderPartGroup>,
    @InjectRepository(OrderPart) private readonly partRepo: Repository<OrderPart>,
    private readonly dataSource: DataSource,
    private readonly numberGenerator: NumberGeneratorService,
  ) {}

  /* ==================== 查询 ==================== */

  async findList(query: QueryOrderDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.orderRepo.createQueryBuilder('o');
    if (query.status != null) qb.andWhere('o.status = :st', { st: query.status });
    if (query.dateFrom) qb.andWhere('o.orderDate >= :df', { df: query.dateFrom });
    if (query.dateTo) qb.andWhere('o.orderDate <= :dt', { dt: query.dateTo });
    if (query.keyword) {
      // 生产单号已上移订单级，直接查 o；货号仍在产品行，用子查询命中后回联订单
      qb.andWhere(
        `(o.orderNo LIKE :kw OR o.poNo LIKE :kw OR o.productionNo LIKE :kw OR o.customerName LIKE :kw
          OR o.id IN (SELECT p.order_id FROM t_order_product p WHERE p.item_no LIKE :kw OR p.customer_drawing_no LIKE :kw))`,
        { kw: `%${query.keyword}%` },
      );
    }
    qb.orderBy('o.id', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [orders, total] = await qb.getManyAndCount();

    // 批量装配产品行与部件组（列表折叠展示用；部件行仅详情加载）
    const orderIds = orders.map((o) => o.id);
    const products = orderIds.length
      ? await this.productRepo.find({ where: { orderId: In(orderIds) }, order: { sort: 'ASC', id: 'ASC' } })
      : [];
    const groups = orderIds.length
      ? await this.groupRepo.find({ where: { orderId: In(orderIds) }, order: { sort: 'ASC', id: 'ASC' } })
      : [];
    const groupsByProduct = new Map<number, OrderPartGroup[]>();
    groups.forEach((g) => {
      const arr = groupsByProduct.get(g.orderProductId) ?? [];
      arr.push(g);
      groupsByProduct.set(g.orderProductId, arr);
    });
    const productsByOrder = new Map<number, Array<OrderProduct & { partGroups: OrderPartGroup[] }>>();
    products.forEach((p) => {
      const arr = productsByOrder.get(p.orderId) ?? [];
      arr.push(Object.assign(p, { partGroups: groupsByProduct.get(p.id) ?? [] }));
      productsByOrder.set(p.orderId, arr);
    });

    return {
      list: orders.map((o) => Object.assign(o, { products: productsByOrder.get(o.id) ?? [] })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: number) {
    // otherReq 实体上标了 select:false（列表不拉富文本正文），详情须显式补选
    const order = await this.orderRepo
      .createQueryBuilder('o')
      .addSelect('o.otherReq')
      .where('o.id = :id', { id })
      .getOne();
    if (!order) throw new NotFoundException('订单不存在');
    const products = await this.productRepo.find({ where: { orderId: id }, order: { sort: 'ASC', id: 'ASC' } });
    const groups = await this.groupRepo.find({ where: { orderId: id }, order: { sort: 'ASC', id: 'ASC' } });
    const parts = await this.partRepo.find({ where: { orderId: id }, order: { sort: 'ASC', id: 'ASC' } });
    const partsByGroup = new Map<number, OrderPart[]>();
    parts.forEach((pt) => {
      const arr = partsByGroup.get(pt.partGroupId) ?? [];
      arr.push(pt);
      partsByGroup.set(pt.partGroupId, arr);
    });
    const groupsByProduct = new Map<number, Array<OrderPartGroup & { parts: OrderPart[] }>>();
    groups.forEach((g) => {
      const arr = groupsByProduct.get(g.orderProductId) ?? [];
      arr.push(Object.assign(g, { parts: partsByGroup.get(g.id) ?? [] }));
      groupsByProduct.set(g.orderProductId, arr);
    });
    return Object.assign(order, {
      products: products.map((p) => Object.assign(p, { partGroups: groupsByProduct.get(p.id) ?? [] })),
    });
  }

  /* ==================== 创建 / 更新 ==================== */

  async create(dto: CreateOrderDto, user: CurrentUserPayload) {
    this.assertProductRows(dto);
    return this.dataSource.transaction(async (mgr) => {
      const orderNo = await this.numberGenerator.generate('ORD', mgr);
      const order = await mgr.getRepository(Order).save(
        mgr.getRepository(Order).create({
          orderNo,
          poNo: dto.poNo ?? null,
          productionNo: dto.productionNo ?? null,
          customerId: dto.customerId ?? null,
          customerName: dto.customerName,
          orderDate: dto.orderDate,
          salesman: dto.salesman ?? null,
          merchandiser: dto.merchandiser ?? null,
          orderSource: dto.orderSource ?? null,
          attachmentIds: dto.attachmentIds ?? null,
          isOpening: dto.isOpening ?? 0,
          remark: dto.remark ?? null,
          otherReq: dto.otherReq ?? null,
          status: ORDER_STATUS.ACTIVE,
          ...auditOnCreate(user),
        }),
      );
      await this.writeChildren(mgr, order.id, dto.products, auditOnCreate(user));
      return { id: order.id, orderNo };
    });
  }

  /**
   * 更新：同结构整体重建（删除旧产品/组/部件行后重写）。
   * 部件组被下游单据（外发/装配/出入库，M3+ 落地）引用后禁止更新，
   * 需先冲销/作废下游单据（设计文档 §7.4，正式变更流程列入 V2）。
   */
  async update(id: number, dto: UpdateOrderDto, user: CurrentUserPayload) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === ORDER_STATUS.CANCELLED) throw new BadRequestException('订单已作废，不能编辑');
    this.assertProductRows(dto);
    await this.assertNoDownstreamRefs(id, '编辑');

    return this.dataSource.transaction(async (mgr) => {
      await mgr.getRepository(Order).update(id, {
        poNo: dto.poNo ?? null,
        productionNo: dto.productionNo ?? null,
        customerId: dto.customerId ?? null,
        customerName: dto.customerName,
        orderDate: dto.orderDate,
        salesman: dto.salesman ?? null,
        merchandiser: dto.merchandiser ?? null,
        orderSource: dto.orderSource ?? null,
        attachmentIds: dto.attachmentIds ?? null,
        isOpening: dto.isOpening ?? order.isOpening,
        remark: dto.remark ?? null,
        otherReq: dto.otherReq ?? null,
        ...auditOnUpdate(user),
      });
      await mgr.getRepository(OrderPart).delete({ orderId: id });
      await mgr.getRepository(OrderPartGroup).delete({ orderId: id });
      await mgr.getRepository(OrderProduct).delete({ orderId: id });
      // 编辑是"整体重建"：子行被删后重写，创建人无从保留，故**沿用订单头的创建人**
      // （谁录的这张单），更新人记本次操作者。否则每次编辑都会把子行创建人改写成编辑者。
      await this.writeChildren(mgr, id, dto.products, {
        creatorId: order.creatorId,
        creatorName: order.creatorName,
        ...auditOnUpdate(user),
      });
      return { id };
    });
  }

  /** 产品行/部件组入库（创建与更新共用；qty_pcs/型号快照/部件行蓝图展开在此统一计算） */
  private async writeChildren(
    mgr: EntityManager,
    orderId: number,
    products: CreateOrderProductDto[],
    audit: {
      creatorId: number | null;
      creatorName: string | null;
      updaterId: number;
      updaterName: string | null;
    },
  ) {
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const productType = normalizeProductTypes(p.productType ?? '');
      const socket = hasSocket(productType);
      const qtyPcs = toPieces(p.orderQty, p.unit);
      const isSplit = p.isSplit ?? 0;

      const product = await mgr.getRepository(OrderProduct).save(
        mgr.getRepository(OrderProduct).create({
          ...audit,
          orderId,
          orderType: p.orderType ?? 1,
          isNewOrder: p.isNewOrder ?? 0,
          isExport: p.isExport ?? 0,
          exportCountry: p.isExport ? (p.exportCountry ?? null) : null,
          materialId: p.materialId ?? null,
          materialCode: p.materialCode ?? null,
          itemNo: p.itemNo ?? null,
          customerDrawingNo: p.customerDrawingNo ?? null,
          productName: p.productName ?? null,
          productType: productType || null,
          railSection: p.railSection ?? null,
          productRequirement: p.productRequirement ?? null,
          isSplit,
          dimensionMm: p.dimensionMm ?? null,
          dimensionRaw: p.dimensionRaw ?? null,
          dimensionUnit: p.dimensionUnit ?? null,
          surfaceType: p.surfaceType || 'none',
          color: p.color ?? null,
          sheetMaterial: p.sheetMaterial ?? null,
          orderQty: p.orderQty,
          unit: p.unit,
          qtyPcs,
          deliveryDate: p.deliveryDate ?? null,
          deliveryAddress: p.deliveryAddress ?? null,
          remark: p.remark ?? null,
          sort: p.sort ?? i,
        }),
      );

      // 部件组：缺省 = 按节数逐部件铺开（三节轨 外/中/内、二节轨 外/内），
      // 与订单表单默认值共用共享包 defaultGroupTypes，避免两端分叉；组类型同产品行内唯一
      const groupDtos = p.partGroups?.length
        ? p.partGroups
        : defaultGroupTypes(p.railSection).map((groupType) => ({ groupType }) as any);

      // 分体出货：组构成就是出货形态的事实源。并集若已覆盖当前节数的全部部件，
      // 那就是整品——「标着分体、实为整品」的矛盾数据会让下游型号/闸门口径失真，直接拒绝
      if (isSplit) {
        // 仅三节轨可分体（业务口径，共享包 canSplitShipping）；前端已禁用开关，
        // 这里兜住 API 直调与切换节数后的残留值
        if (!canSplitShipping(p.railSection)) {
          throw new BadRequestException(
            `第 ${i + 1} 行产品：只有三节轨可以「分体出货」，请关闭该开关`,
          );
        }
        const parts = splitParts(groupDtos.map((g: any) => g.groupType), p.railSection);
        const fullCount = p.railSection === 'two_section' ? 2 : 3;
        if (parts.length >= fullCount) {
          throw new BadRequestException(
            `第 ${i + 1} 行产品：勾选了「分体出货」但部件组已覆盖全部部件（即整品）。请删除不出货的部件组，或关闭分体开关`,
          );
        }
      }
      const seenTypes = new Set<string>();
      for (let gi = 0; gi < groupDtos.length; gi++) {
        const g = groupDtos[gi];
        if (seenTypes.has(g.groupType)) {
          throw new BadRequestException(`第 ${i + 1} 行产品：部件组类型「${g.groupType}」重复`);
        }
        seenTypes.add(g.groupType);
        const groupQty = g.qtyPcs ?? qtyPcs;
        const group = await mgr.getRepository(OrderPartGroup).save(
          mgr.getRepository(OrderPartGroup).create({
            ...audit,
            orderId,
            orderProductId: product.id,
            groupType: g.groupType,
            drawingNo: g.drawingNo ?? null,
            drawingVersion: normalizeVersion(g.drawingVersion) ?? null,
            materialThickness: g.materialThickness ?? null,
            qtyPcs: groupQty,
            productModel: formatProductModel(p.itemNo ?? '', productType, g.groupType),
            remark: g.remark ?? null,
            sort: g.sort ?? gi,
          }),
        );

        // 部件行：蓝图展开（二节轨无中轨；卡口左右分列），客户端仅微调追溯码/备注
        const blueprint = expandPartRows(g.groupType, p.railSection, socket, groupQty);
        if (!blueprint.length) {
          throw new BadRequestException(`第 ${i + 1} 行产品：部件组「${g.groupType}」在当前节数下无可展开部件`);
        }
        const tweaks = new Map(
          (g.parts ?? []).map((t: any) => [`${t.partType}|${t.side ?? ''}`, t]),
        );
        const rows = blueprint.map((b, bi) => {
          const tweak: any = tweaks.get(`${b.partType}|${b.side}`);
          return mgr.getRepository(OrderPart).create({
            orderId,
            productId: product.id,
            partGroupId: group.id,
            partType: b.partType,
            side: b.side,
            qty: b.qty,
            cycleCode: tweak?.cycleCode ?? null,
            remark: tweak?.remark ?? null,
            sort: bi,
          });
        });
        await mgr.getRepository(OrderPart).save(rows);
      }
    }
  }

  private assertProductRows(dto: CreateOrderDto) {
    dto.products.forEach((p, i) => {
      if (p.isExport && !p.exportCountry) {
        throw new BadRequestException(`第 ${i + 1} 行产品：出口订单需填写出口国家`);
      }
    });
  }

  /* ==================== 状态机 ==================== */

  /** 完结（台账口径不锁单据，§3.1） */
  async finish(id: number, user: CurrentUserPayload) {
    const order = await this.mustGet(id);
    if (order.status !== ORDER_STATUS.ACTIVE) throw new BadRequestException('仅进行中的订单可完结');
    await this.orderRepo.update(id, { status: ORDER_STATUS.FINISHED, ...auditOnUpdate(user) });
    return { id };
  }

  async reopen(id: number, user: CurrentUserPayload) {
    const order = await this.mustGet(id);
    if (order.status !== ORDER_STATUS.FINISHED) throw new BadRequestException('仅已完结的订单可重开');
    await this.orderRepo.update(id, { status: ORDER_STATUS.ACTIVE, ...auditOnUpdate(user) });
    return { id };
  }

  /**
   * 删除（2026-08-07 取代「作废」）：连带删除产品行/部件组/部件行四级数据。
   *
   * 为什么是物理删除而不是置作废状态：作废的限制条件与删除**完全一致**——一旦被外发/
   * 装配/出入库引用就都禁止，所以作废从来只能作用于"还没走下游流程"的单据；这种单据
   * 留一条 status=9 的废记录对账没有价值，只会让订单列表越积越脏。
   *
   * 库中已有的 status=9 历史订单原样保留（ORDER_STATUS.CANCELLED 枚举因此不删），
   * 只是不再产生新的作废记录。
   *
   * 不收 user 参数：行已物理删除，写不了审计列；操作人由 @OperationLog 拦截器
   * 从请求上下文记入 t_operation_log（含 biz_id），追溯到人靠那条日志。
   */
  async remove(id: number) {
    const order = await this.mustGet(id);
    await this.assertNoDownstreamRefs(id, '删除');

    await this.dataSource.transaction(async (mgr) => {
      // 自下而上删，避免中途失败留下悬挂子行
      await mgr.getRepository(OrderPart).delete({ orderId: id });
      await mgr.getRepository(OrderPartGroup).delete({ orderId: id });
      await mgr.getRepository(OrderProduct).delete({ orderId: id });
      await mgr.getRepository(Order).delete({ id });
    });
    // 返回单号供界面提示与操作日志定位（订单行已不存在，事后查不到）
    return { id, orderNo: order.orderNo };
  }

  private async mustGet(id: number): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  /**
   * 下游引用探测：外发明细/装配批次/成品出入库明细锚定部件组（设计文档 §4.2 锚点约定）。
   * 相关表在 M3/M3.5/M4 里程碑落地，未建表时视为无引用（try/catch 兜底，建表后自动生效）。
   */
  private async assertNoDownstreamRefs(orderId: number, action: string) {
    const probes: Array<{ table: string; label: string }> = [
      { table: 't_outsource_part', label: '外发回厂记录' },
      { table: 't_assembly_batch', label: '装配批次' },
      { table: 't_finished_item', label: '成品出入库单' },
    ];
    for (const probe of probes) {
      let cnt = 0;
      try {
        const rows: Array<{ cnt: string }> = await this.dataSource.query(
          `SELECT COUNT(*) AS cnt FROM ${probe.table} WHERE order_id = ?`,
          [orderId],
        );
        cnt = Number(rows?.[0]?.cnt ?? 0);
      } catch {
        cnt = 0; // 表未建（后续里程碑）
      }
      if (cnt > 0) {
        throw new BadRequestException(
          `订单已被 ${cnt} 条${probe.label}引用，禁止${action}；请先删除或冲销对应的下游记录`,
        );
      }
    }
  }
}
