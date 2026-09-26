import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ORDER_STATUS,
  canSplitShipping,
  defaultGroupTypes,
  expandPartRows,
  formatDimension,
  formatProductModel,
  formatProductTypes,
  hasSocket,
  needsOutsource,
  normalizeProductTypes,
  normalizeVersion,
  partGroupLabel,
  splitParts,
  toPieces,
} from '@hb-oms/shared';
import { Order } from './entities/order.entity';
import { OrderProduct } from './entities/order-product.entity';
import { OrderPartGroup } from './entities/order-part-group.entity';
import { OrderPart } from './entities/order-part.entity';
import {
  CreateOrderDto,
  CreateOrderPartGroupDto,
  CreateOrderProductDto,
  QueryOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { NumberGeneratorService } from '../../common/services/number-generator.service';
import { ProductSnapshotService } from '../../common/services/product-snapshot.service';
import { PartGroupSnapshotService } from '../../common/services/part-group-snapshot.service';
import { OperationLogWriterService } from '../../common/services/operation-log-writer.service';
import { syncOrderFinishState } from './order-owed.util';

/** 下游引用条数：外发回厂记录 / 装配批次 / 成品出入库明细 */
export interface RefCounts {
  outsource: number;
  assembly: number;
  finished: number;
}

/** 订单的下游引用：订单级合计 + 按产品行 / 部件组分桶（结构守卫与前端锁字段共用） */
interface OrderRefs {
  counts: RefCounts;
  byProduct: Map<number, RefCounts>;
  /** 部件组 → 外发回厂记录条数（外发是唯一锚部件组的环节） */
  byGroup: Map<number, number>;
}

/** 编辑前库里的四级数据，原地更新按 ID 对行 */
interface ExistingChildren {
  products: Map<number, OrderProduct>;
  groups: Map<number, OrderPartGroup>;
  partsByGroup: Map<number, OrderPart[]>;
}

const refTotal = (c: RefCounts | undefined) => (c ? c.outsource + c.assembly + c.finished : 0);

function describeRefs(c: RefCounts): string {
  const parts: string[] = [];
  if (c.outsource) parts.push(`${c.outsource} 条外发回厂记录`);
  if (c.assembly) parts.push(`${c.assembly} 条装配批次`);
  if (c.finished) parts.push(`${c.finished} 条成品出入库明细`);
  return parts.join('、');
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderProduct) private readonly productRepo: Repository<OrderProduct>,
    @InjectRepository(OrderPartGroup) private readonly groupRepo: Repository<OrderPartGroup>,
    @InjectRepository(OrderPart) private readonly partRepo: Repository<OrderPart>,
    private readonly dataSource: DataSource,
    private readonly numberGenerator: NumberGeneratorService,
    private readonly productSnapshot: ProductSnapshotService,
    private readonly groupSnapshot: PartGroupSnapshotService,
    private readonly logWriter: OperationLogWriterService,
  ) {}

  /* ==================== 查询 ==================== */

  /** 订单里实际出现过的业务员 / 跟单员姓名（去重、去空、按拼音排序），给列表查询区下拉用 */
  async staffOptions(): Promise<{ salesmen: string[]; merchandisers: string[] }> {
    const distinct = async (col: 'salesman' | 'merchandiser') => {
      // 去重放子查询、外层再按拼音（gbk）排序：MySQL 8 的 DISTINCT 不允许按结果列之外的表达式排序
      const rows: Array<{ name: string }> = await this.dataSource.query(
        `SELECT name FROM (
           SELECT DISTINCT TRIM(${col}) AS name FROM t_order
            WHERE ${col} IS NOT NULL AND TRIM(${col}) <> ''
         ) t
         ORDER BY CONVERT(name USING gbk)`,
      );
      return rows.map((r) => r.name);
    };
    const [salesmen, merchandisers] = await Promise.all([distinct('salesman'), distinct('merchandiser')]);
    return { salesmen, merchandisers };
  }

  async findList(query: QueryOrderDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.orderRepo.createQueryBuilder('o');
    if (query.status != null) qb.andWhere('o.status = :st', { st: query.status });
    if (query.poNo) qb.andWhere('o.poNo = :poNo', { poNo: query.poNo });
    if (query.dateFrom) qb.andWhere('o.orderDate >= :df', { df: query.dateFrom });
    if (query.dateTo) qb.andWhere('o.orderDate <= :dt', { dt: query.dateTo });
    if (query.salesman) qb.andWhere('o.salesman = :salesman', { salesman: query.salesman });
    if (query.merchandiser) qb.andWhere('o.merchandiser = :merchandiser', { merchandiser: query.merchandiser });
    if (query.keyword) {
      // 生产单号已上移订单级，直接查 o；货号仍在产品行，用子查询命中后回联订单
      qb.andWhere(
        `(o.orderNo LIKE :kw OR o.poNo LIKE :kw OR o.productionNo LIKE :kw OR o.customerName LIKE :kw
          OR o.id IN (SELECT p.order_id FROM t_order_product p WHERE p.item_no LIKE :kw OR p.customer_drawing_no LIKE :kw))`,
        { kw: `%${query.keyword}%` },
      );
    }
    // 「更多」里的产品级条件：同一产品行同时满足才算（放进一个 EXISTS，不拆成多个）
    const pConds: string[] = [];
    const pParams: Record<string, string> = {};
    if (query.customerDrawingNo) {
      pConds.push('p2.customer_drawing_no LIKE :cdn');
      pParams.cdn = `%${query.customerDrawingNo}%`;
    }
    if (query.drawingNo) {
      pConds.push(
        'EXISTS (SELECT 1 FROM t_order_part_group g2 WHERE g2.order_product_id = p2.id AND g2.drawing_no LIKE :dwn)',
      );
      pParams.dwn = `%${query.drawingNo}%`;
    }
    if (query.productType) {
      // 产品类型是字典序逗号组合串，单值包含匹配（同台账）
      pConds.push('FIND_IN_SET(:ptype, p2.product_type)');
      pParams.ptype = query.productType;
    }
    if (query.railSection) {
      pConds.push('p2.rail_section = :rsec');
      pParams.rsec = query.railSection;
    }
    if (query.surfaceType) {
      pConds.push('p2.surface_type = :sft');
      pParams.sft = query.surfaceType;
    }
    if (query.deliveryFrom) {
      pConds.push('p2.delivery_date >= :dlf');
      pParams.dlf = query.deliveryFrom;
    }
    if (query.deliveryTo) {
      pConds.push('p2.delivery_date <= :dlt');
      pParams.dlt = query.deliveryTo;
    }
    if (pConds.length) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM t_order_product p2 WHERE p2.order_id = o.id AND ${pConds.join(' AND ')})`,
        pParams,
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

  /**
   * 详情。传入 user 时附带 `editGuard`（编辑页据此锁字段、决定能否保存）：
   * 订单被下游引用后只能「更正」，且限原创建人 / 同角色用户 / 管理员。
   */
  async findOne(id: number, user?: CurrentUserPayload) {
    const detail = await this.loadDetail(id);
    const refs = await this.loadRefs(this.dataSource, id);
    const referenced = refTotal(refs.counts) > 0;
    const zero: RefCounts = { outsource: 0, assembly: 0, finished: 0 };
    detail.products.forEach((p: any) => {
      p.refCounts = refs.byProduct.get(p.id) ?? zero;
      p.partGroups.forEach((g: any) => (g.outsourceCount = refs.byGroup.get(g.id) ?? 0));
    });
    return Object.assign(detail, {
      editGuard: {
        referenced,
        refCounts: refs.counts,
        canEdit: !referenced || (user ? await this.canCorrect(detail, user) : false),
      },
    });
  }

  private async loadDetail(id: number) {
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
          // PO# 选填：空白统一存 NULL，避免 '' 与 NULL 两种「空」并存（按有无 PO# 筛选时会漏）
          poNo: dto.poNo?.trim() || null,
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
   * 更新：按产品行 / 部件组 ID **原地更新**（2026-09-26 由「删了重建」改）。
   *
   * 为什么不再重建：装配批次、成品明细/余额锚在产品行 ID 上，外发回厂记录锚在部件组 ID 上，
   * 重建会换掉 ID、让下游全部悬空——所以过去订单一被引用就只能一刀切禁改，录错的生产单号
   * 再也改不回来。原地更新保住 ID 后，被引用的订单也能「更正」：
   *   - 权限：原创建人 / 与其同角色的用户 / 管理员（canCorrect）；
   *   - 结构不许动：被引用的产品行/部件组不能删，卡口/节数/分体不能改（assertReferencedStructure）；
   *   - 同一事务把新值回写到下游快照、按新订单数重算完结状态；另记一条带改动明细的操作日志。
   * 部件行没有下游引用，照旧按蓝图重新展开（追溯码/备注按「部件+边别」带回）。
   */
  async update(id: number, dto: UpdateOrderDto, user: CurrentUserPayload, ip?: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === ORDER_STATUS.CANCELLED) throw new BadRequestException('订单已作废，不能编辑');
    this.assertProductRows(dto);

    const result = await this.dataSource.transaction(async (mgr) => {
      // 锁订单头：两人同时保存同一张单时串行化，免得各按旧行 ID 比对、互删对方新增的行
      await mgr.query('SELECT id FROM t_order WHERE id = ? FOR UPDATE', [id]);
      const refs = await this.loadRefs(mgr, id);
      const referenced = refTotal(refs.counts) > 0;
      if (referenced && !(await this.canCorrect(order, user))) {
        throw new ForbiddenException(
          `订单已被${describeRefs(refs.counts)}引用，只有订单创建人（${order.creatorName || '未知'}）、与其同角色的用户或管理员可以更正`,
        );
      }

      const existing = await this.loadExisting(mgr, id);
      this.assertIdsBelong(dto, existing);
      if (referenced) this.assertReferencedStructure(dto, existing, refs);
      const changes = referenced ? this.diffChanges(order, dto, existing) : [];

      await mgr.getRepository(Order).update(id, {
        poNo: dto.poNo?.trim() || null,
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

      // 本次提交里不再出现的部件组 / 产品行删掉（被引用的已在结构守卫里拦下）
      const keptGroupIds = new Set(
        dto.products.flatMap((p) => (p.partGroups ?? []).map((g) => g.id ?? 0)),
      );
      const keptProductIds = new Set(dto.products.map((p) => p.id ?? 0));
      const dropGroups = [...existing.groups.keys()].filter((gid) => !keptGroupIds.has(gid));
      const dropProducts = [...existing.products.keys()].filter((pid) => !keptProductIds.has(pid));
      if (dropGroups.length) {
        await mgr.getRepository(OrderPart).delete({ partGroupId: In(dropGroups) });
        await mgr.getRepository(OrderPartGroup).delete({ id: In(dropGroups) });
      }
      if (dropProducts.length) {
        await mgr.getRepository(OrderProduct).delete({ id: In(dropProducts) });
      }

      // 新增的子行沿用订单头创建人（谁录的这张单）；原地更新的行保留各自创建人，只记更新人
      await this.writeChildren(
        mgr,
        id,
        dto.products,
        { creatorId: order.creatorId, creatorName: order.creatorName, ...auditOnUpdate(user) },
        existing,
      );

      if (!referenced) {
        return { id, corrected: false, changes, synced: null as RefCounts | null, finished: [] as string[], reopened: [] as string[] };
      }
      await this.syncDownstreamSnapshots(mgr, id);
      // 改了订单数量会让发货欠数变化：该完结的完结、该重开的重开（与出入库确认同一口径）
      const finishSync = await syncOrderFinishState(mgr, [id], user);
      return { id, corrected: true, changes, synced: refs.counts as RefCounts | null, ...finishSync };
    });

    // 请求级的「编辑订单」日志只截得下请求体前 1000 字，看不出改了什么；
    // 被引用订单的更正另记一条带逐项改动的日志，事后能查清谁把什么从 A 改成了 B
    if (result.corrected && result.changes.length) {
      const summary = `更正已引用订单 ${order.orderNo}：${result.changes.join('；')}`;
      this.logWriter.write({
        userId: user.id,
        userName: user.realName || user.username,
        module: '订单管理',
        action: '更正已引用订单',
        description: summary.length > 250 ? `${summary.slice(0, 247)}...` : summary,
        method: 'PUT',
        url: `/api/order/${id}`,
        ip: ip || null,
        params: JSON.stringify({ orderNo: order.orderNo, changes: result.changes, synced: result.synced }),
        bizType: 'order',
        bizId: id,
        result: 1,
      });
    }
    return result;
  }

  /**
   * 产品行/部件组写库（创建与更新共用；qty_pcs/型号快照/部件行蓝图展开在此统一计算）。
   * 传入 existing（更新）时，带 ID 且属于本订单的行原地 UPDATE，其余 INSERT。
   */
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
    existing?: ExistingChildren,
  ) {
    const updater = { updaterId: audit.updaterId, updaterName: audit.updaterName };
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const productType = normalizeProductTypes(p.productType ?? '');
      const socket = hasSocket(productType);
      const qtyPcs = toPieces(p.orderQty, p.unit);
      const isSplit = p.isSplit ?? 0;

      const fields = {
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
      };
      let productId: number;
      if (existing && p.id != null && existing.products.has(p.id)) {
        await mgr.getRepository(OrderProduct).update(p.id, { ...fields, ...updater });
        productId = p.id;
      } else {
        const saved = await mgr
          .getRepository(OrderProduct)
          .save(mgr.getRepository(OrderProduct).create({ ...audit, orderId, ...fields }));
        productId = saved.id;
      }

      // 部件组：缺省 = 按节数逐部件铺开（三节轨 外/中/内、二节轨 外/内），
      // 与订单表单默认值共用共享包 defaultGroupTypes，避免两端分叉；组类型同产品行内唯一
      const groupDtos: CreateOrderPartGroupDto[] = p.partGroups?.length
        ? p.partGroups
        : defaultGroupTypes(p.railSection).map((groupType) => ({ groupType }) as CreateOrderPartGroupDto);

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
        const parts = splitParts(groupDtos.map((g) => g.groupType), p.railSection);
        const fullCount = p.railSection === 'two_section' ? 2 : 3;
        if (parts.length >= fullCount) {
          throw new BadRequestException(
            `第 ${i + 1} 行产品：勾选了「分体出货」但部件组已覆盖全部部件（即整品）。请删除不出货的部件组，或关闭分体开关`,
          );
        }
      }
      const seenTypes = new Set<string>();
      groupDtos.forEach((g) => {
        if (seenTypes.has(g.groupType)) {
          throw new BadRequestException(`第 ${i + 1} 行产品：部件组类型「${g.groupType}」重复`);
        }
        seenTypes.add(g.groupType);
      });

      const keptGroup = (g: CreateOrderPartGroupDto) =>
        existing && g.id != null ? existing.groups.get(g.id) : undefined;
      // 组类型对调（外↔内）时先挪到临时值，否则逐条 UPDATE 中途会撞 uk_product_group
      for (const g of groupDtos) {
        const old = keptGroup(g);
        if (old && old.groupType !== g.groupType) {
          await mgr.getRepository(OrderPartGroup).update(old.id, { groupType: `~${old.id}` });
        }
      }

      for (let gi = 0; gi < groupDtos.length; gi++) {
        const g = groupDtos[gi];
        const groupQty = g.qtyPcs ?? qtyPcs;
        const groupFields = {
          groupType: g.groupType,
          drawingNo: g.drawingNo ?? null,
          drawingVersion: normalizeVersion(g.drawingVersion) ?? null,
          materialThickness: g.materialThickness ?? null,
          qtyPcs: groupQty,
          productModel: formatProductModel(p.itemNo ?? '', productType, g.groupType),
          remark: g.remark ?? null,
          sort: g.sort ?? gi,
        };
        const old = keptGroup(g);
        let groupId: number;
        if (old) {
          await mgr.getRepository(OrderPartGroup).update(old.id, { ...groupFields, ...updater });
          await mgr.getRepository(OrderPart).delete({ partGroupId: old.id });
          groupId = old.id;
        } else {
          const saved = await mgr.getRepository(OrderPartGroup).save(
            mgr.getRepository(OrderPartGroup).create({ ...audit, orderId, orderProductId: productId, ...groupFields }),
          );
          groupId = saved.id;
        }

        // 部件行：蓝图展开（二节轨无中轨；卡口左右分列），客户端仅微调追溯码/备注。
        // 客户端没传微调时沿用该组原有部件行的追溯码/备注——编辑页从不回传它们，重展开不能把周期码洗掉
        const blueprint = expandPartRows(g.groupType, p.railSection, socket, groupQty);
        if (!blueprint.length) {
          throw new BadRequestException(`第 ${i + 1} 行产品：部件组「${g.groupType}」在当前节数下无可展开部件`);
        }
        const tweakSrc: Array<{ partType: string; side?: string | null; cycleCode?: string | null; remark?: string | null }> =
          g.parts?.length ? g.parts : old ? (existing!.partsByGroup.get(old.id) ?? []) : [];
        const tweaks = new Map(tweakSrc.map((t) => [`${t.partType}|${t.side ?? ''}`, t]));
        const rows = blueprint.map((b, bi) => {
          const tweak = tweaks.get(`${b.partType}|${b.side}`);
          return mgr.getRepository(OrderPart).create({
            orderId,
            productId,
            partGroupId: groupId,
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

  /* ==================== 被引用订单的更正 ==================== */

  /**
   * 下游引用：外发回厂记录（锚部件组）、装配批次与成品出入库明细（锚产品行）。
   * 成品明细不分单据状态一律计入（含草稿、已作废单）——草稿随时会被确认，照样锚着这一行。
   */
  private async loadRefs(runner: EntityManager | DataSource, orderId: number): Promise<OrderRefs> {
    const counts: RefCounts = { outsource: 0, assembly: 0, finished: 0 };
    const byProduct = new Map<number, RefCounts>();
    const byGroup = new Map<number, number>();
    const bucket = (pid: number) => {
      let c = byProduct.get(pid);
      if (!c) byProduct.set(pid, (c = { outsource: 0, assembly: 0, finished: 0 }));
      return c;
    };

    const out: Array<{ pid: number; gid: number; cnt: string }> = await runner.query(
      `SELECT order_product_id AS pid, order_part_group_id AS gid, COUNT(*) AS cnt
         FROM t_outsource_part WHERE order_id = ? GROUP BY order_product_id, order_part_group_id`,
      [orderId],
    );
    out.forEach((r) => {
      const n = Number(r.cnt);
      counts.outsource += n;
      bucket(Number(r.pid)).outsource += n;
      byGroup.set(Number(r.gid), (byGroup.get(Number(r.gid)) ?? 0) + n);
    });
    const perProduct = async (table: string, key: 'assembly' | 'finished') => {
      const rows: Array<{ pid: number; cnt: string }> = await runner.query(
        `SELECT order_product_id AS pid, COUNT(*) AS cnt FROM ${table} WHERE order_id = ? GROUP BY order_product_id`,
        [orderId],
      );
      rows.forEach((r) => {
        const n = Number(r.cnt);
        counts[key] += n;
        bucket(Number(r.pid))[key] += n;
      });
    };
    await perProduct('t_assembly_batch', 'assembly');
    await perProduct('t_finished_item', 'finished');
    return { counts, byProduct, byGroup };
  }

  /** 被引用订单谁能更正：原创建人、与创建人有共同角色的用户、管理员 */
  private async canCorrect(order: Order, user: CurrentUserPayload): Promise<boolean> {
    if (user.roleCodes?.includes('admin')) return true;
    if (order.creatorId == null) return false;
    if (order.creatorId === user.id) return true;
    const roleIds = (user.roleIds ?? []).filter((v) => Number.isInteger(v));
    if (!roleIds.length) return false;
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM t_user_role WHERE user_id = ? AND role_id IN (${roleIds.map(() => '?').join(',')}) LIMIT 1`,
      [order.creatorId, ...roleIds],
    );
    return rows.length > 0;
  }

  private async loadExisting(mgr: EntityManager, orderId: number): Promise<ExistingChildren> {
    const products = await mgr.getRepository(OrderProduct).find({ where: { orderId }, order: { sort: 'ASC', id: 'ASC' } });
    const groups = await mgr.getRepository(OrderPartGroup).find({ where: { orderId }, order: { sort: 'ASC', id: 'ASC' } });
    const parts = await mgr.getRepository(OrderPart).find({ where: { orderId } });
    const partsByGroup = new Map<number, OrderPart[]>();
    parts.forEach((pt) => {
      const arr = partsByGroup.get(pt.partGroupId) ?? [];
      arr.push(pt);
      partsByGroup.set(pt.partGroupId, arr);
    });
    return {
      products: new Map(products.map((p) => [p.id, p])),
      groups: new Map(groups.map((g) => [g.id, g])),
      partsByGroup,
    };
  }

  /** 回传的行 ID 必须属于本订单（部件组还须属于它所在的产品行），防 API 直调把别的订单的行改走 */
  private assertIdsBelong(dto: UpdateOrderDto, existing: ExistingChildren) {
    const seenProducts = new Set<number>();
    const seenGroups = new Set<number>();
    dto.products.forEach((p, i) => {
      if (p.id != null) {
        if (!existing.products.has(p.id) || seenProducts.has(p.id)) {
          throw new BadRequestException(`第 ${i + 1} 行产品：产品行标识无效（不属于本订单或重复），请刷新页面后重试`);
        }
        seenProducts.add(p.id);
      }
      (p.partGroups ?? []).forEach((g) => {
        if (g.id == null) return;
        const old = existing.groups.get(g.id);
        if (!old || p.id == null || old.orderProductId !== p.id || seenGroups.has(g.id)) {
          throw new BadRequestException(`第 ${i + 1} 行产品：部件组标识无效（不属于该产品行或重复），请刷新页面后重试`);
        }
        seenGroups.add(g.id);
      });
    });
  }

  /**
   * 被引用订单的结构守卫：信息可以更正，结构不能动。
   * - 被引用的产品行不能删；卡口有无（决定左右分边记账）、轨道节数（决定部件组构成）、分体出货不能改；
   * - 有外发回厂记录的产品，表面处理不能改成「无」（否则台账外发欠数失去口径）；
   * - 有外发回厂记录的部件组不能删、不能改组类型（改了就等于说回厂的是另一个部件）。
   */
  private assertReferencedStructure(dto: UpdateOrderDto, existing: ExistingChildren, refs: OrderRefs) {
    const dtoById = new Map(dto.products.filter((p) => p.id != null).map((p) => [p.id as number, p]));
    for (const old of existing.products.values()) {
      const pr = refs.byProduct.get(old.id);
      if (!pr || !refTotal(pr)) continue;
      const head = `产品「${this.productLabel(old)}」已被${describeRefs(pr)}引用`;
      const cur = dtoById.get(old.id);
      if (!cur) throw new BadRequestException(`${head}，不能删除`);
      const oldSocket = hasSocket(old.productType);
      if (oldSocket !== hasSocket(normalizeProductTypes(cur.productType ?? ''))) {
        throw new BadRequestException(
          `${head}，不能${oldSocket ? '去掉' : '加上'}「卡口」——卡口决定装配与出入库按左右分边记账`,
        );
      }
      if (old.railSection && old.railSection !== (cur.railSection ?? null)) {
        throw new BadRequestException(`${head}，不能修改轨道节数——节数决定部件组构成`);
      }
      if ((old.isSplit ?? 0) !== (cur.isSplit ?? 0)) {
        throw new BadRequestException(`${head}，不能切换「分体出货」`);
      }
      if (pr.outsource && !needsOutsource(cur.surfaceType || 'none')) {
        throw new BadRequestException(`${head}，已有外发回厂记录，表面处理不能改为「无」`);
      }
    }
    for (const g of existing.groups.values()) {
      const n = refs.byGroup.get(g.id) ?? 0;
      if (!n) continue;
      const head = `部件组「${g.productModel || partGroupLabel(g.groupType)}」已被 ${n} 条外发回厂记录引用`;
      const cur = dtoById.get(g.orderProductId)?.partGroups?.find((x) => x.id === g.id);
      if (!cur) throw new BadRequestException(`${head}，不能删除`);
      if (cur.groupType !== g.groupType) throw new BadRequestException(`${head}，不能修改组类型`);
    }
  }

  private productLabel(p: OrderProduct): string {
    return p.itemNo ? formatProductModel(p.itemNo, p.productType ?? '', 'whole') : p.productName || `#${p.id}`;
  }

  /** 逐项改动明细（写进更正日志，也随接口返回），只列真的变了的字段 */
  private diffChanges(order: Order, dto: UpdateOrderDto, existing: ExistingChildren): string[] {
    const out: string[] = [];
    const s = (v: unknown) => (v == null ? '' : String(v).trim());
    const day = (v: unknown) => s(v).slice(0, 10);
    const cmp = (label: string, a: string, b: string) => {
      if (a !== b) out.push(`${label}：${a || '（空）'} → ${b || '（空）'}`);
    };
    const qtyText = (qty: number, unit: string | null | undefined) => `${qty}${unit === 'set' ? '套' : '支'}`;
    const attach = (v: unknown) => (s(v) === '[]' ? '' : s(v));

    cmp('生产单号', s(order.productionNo), s(dto.productionNo));
    cmp('PO#', s(order.poNo), s(dto.poNo));
    cmp('客户', s(order.customerName), s(dto.customerName));
    cmp('订单日期', day(order.orderDate), day(dto.orderDate));
    cmp('业务员', s(order.salesman), s(dto.salesman));
    cmp('跟单员', s(order.merchandiser), s(dto.merchandiser));
    cmp('订单来源', s(order.orderSource), s(dto.orderSource));
    cmp('备注', s(order.remark), s(dto.remark));
    if (attach(order.attachmentIds) !== attach(dto.attachmentIds)) out.push('附件有变动');

    const keptProducts = new Set<number>();
    const keptGroups = new Set<number>();
    dto.products.forEach((p, i) => {
      const tag = `产品${i + 1}`;
      const old = p.id != null ? existing.products.get(p.id) : undefined;
      if (!old) {
        out.push(`${tag}：新增（${s(p.itemNo) || s(p.productName) || '未填产品代码'}）`);
        return;
      }
      keptProducts.add(old.id);
      const c = (label: string, a: string, b: string) => cmp(`${tag} ${label}`, a, b);
      c('产品代码', s(old.itemNo), s(p.itemNo));
      c('产品名称', s(old.productName), s(p.productName));
      c('客户图号', s(old.customerDrawingNo), s(p.customerDrawingNo));
      c('物料编码', s(old.materialCode), s(p.materialCode));
      c('产品类型', formatProductTypes(old.productType), formatProductTypes(p.productType ?? ''));
      c(
        '规格',
        formatDimension(old.dimensionRaw, old.dimensionUnit, old.dimensionMm),
        formatDimension(p.dimensionRaw, p.dimensionUnit, p.dimensionMm),
      );
      c('表面处理', s(old.surfaceType) || 'none', s(p.surfaceType) || 'none');
      c('颜色', s(old.color), s(p.color));
      c('材质', s(old.sheetMaterial), s(p.sheetMaterial));
      c('数量', qtyText(old.orderQty, old.unit), qtyText(p.orderQty, p.unit));
      c('交货日期', day(old.deliveryDate), day(p.deliveryDate));
      c('交货地址', s(old.deliveryAddress), s(p.deliveryAddress));
      c('产品要求描述', s(old.productRequirement), s(p.productRequirement));
      c('出口国家', old.isExport ? s(old.exportCountry) : '', p.isExport ? s(p.exportCountry) : '');
      c('备注', s(old.remark), s(p.remark));

      const pcs = toPieces(p.orderQty, p.unit);
      (p.partGroups ?? []).forEach((g) => {
        const og = g.id != null ? existing.groups.get(g.id) : undefined;
        const gtag = `${tag} ${partGroupLabel(g.groupType)}组`;
        if (!og) {
          out.push(`${gtag}：新增`);
          return;
        }
        keptGroups.add(og.id);
        const gc = (label: string, a: string, b: string) => cmp(`${gtag} ${label}`, a, b);
        gc('组类型', partGroupLabel(og.groupType), partGroupLabel(g.groupType));
        gc('生产图号', s(og.drawingNo), s(g.drawingNo));
        gc('版本', s(og.drawingVersion), s(normalizeVersion(g.drawingVersion)));
        gc('料厚', s(og.materialThickness), s(g.materialThickness));
        gc('组支数', s(og.qtyPcs), s(g.qtyPcs ?? pcs));
      });
    });
    for (const old of existing.products.values()) {
      if (!keptProducts.has(old.id)) out.push(`删除产品「${this.productLabel(old)}」`);
    }
    for (const og of existing.groups.values()) {
      if (keptProducts.has(og.orderProductId) && !keptGroups.has(og.id)) {
        out.push(`删除部件组「${og.productModel || partGroupLabel(og.groupType)}」`);
      }
    }
    return out;
  }

  /**
   * 把订单侧新值回写到下游快照（装配批次 / 成品明细 / 成品余额 / 外发回厂记录）。
   *
   * §5.5「基础数据变更不回写历史单据」管的是客户资料这类主数据；这里是更正订单本身的录入错误，
   * 不回写的话入库单、送货单会继续印着错的生产单号。取值走两个快照服务——与下游建单同一口径。
   * 外发回厂记录的表面处理/颜色是回厂时按实际做的录的（可与订单不同），**不回写**。
   */
  private async syncDownstreamSnapshots(mgr: EntityManager, orderId: number) {
    const productIds: Array<{ id: number }> = await mgr.query('SELECT id FROM t_order_product WHERE order_id = ?', [orderId]);
    const snaps = await this.productSnapshot.load(mgr, productIds.map((r) => Number(r.id)), { includeCancelledOrder: true });
    for (const snap of snaps.values()) {
      await mgr.query(
        `UPDATE t_assembly_batch
            SET order_no = ?, customer_name = ?, production_no = ?, product_model = ?, dimension_text = ?
          WHERE order_product_id = ?`,
        [snap.orderNo, snap.customerName, snap.productionNo, snap.productModel, snap.dimensionText, snap.orderProductId],
      );
      await mgr.query(
        `UPDATE t_finished_item
            SET order_no = ?, customer_name = ?, production_no = ?, item_no = ?, product_model = ?,
                product_type = ?, rail_section = ?, dimension_text = ?, dimension_mm = ?, surface_type = ?, color = ?
          WHERE order_product_id = ?`,
        [
          snap.orderNo, snap.customerName, snap.productionNo, snap.itemNo, snap.productModel,
          snap.productType, snap.railSection, snap.dimensionText, snap.dimensionMm, snap.surfaceType, snap.color,
          snap.orderProductId,
        ],
      );
      // 余额行的属性列是 NOT NULL DEFAULT ''/0，空值按建行时的口径落空串/0
      await mgr.query(
        `UPDATE t_finished_balance
            SET item_no = ?, product_model = ?, product_type = ?, rail_section = ?,
                dimension_mm = ?, dimension_text = ?, surface_type = ?, color = ?
          WHERE order_product_id = ?`,
        [
          snap.itemNo ?? '', snap.productModel ?? '', snap.productType ?? '', snap.railSection ?? '',
          snap.dimensionMm ?? 0, snap.dimensionText ?? '', snap.surfaceType ?? '', snap.color ?? '',
          snap.orderProductId,
        ],
      );
    }

    const groupIds: Array<{ id: number }> = await mgr.query('SELECT id FROM t_order_part_group WHERE order_id = ?', [orderId]);
    const groupSnaps = await this.groupSnapshot.load(mgr, groupIds.map((r) => Number(r.id)), { includeCancelledOrder: true });
    for (const g of groupSnaps.values()) {
      await mgr.query(
        `UPDATE t_outsource_part
            SET order_no = ?, customer_name = ?, production_no = ?, product_model = ?, dimension_text = ?,
                cycle_code = ?, order_qty = ?, unit = ?, drawing_no = ?, material_thickness = ?
          WHERE order_part_group_id = ?`,
        [
          g.orderNo, g.customerName, g.productionNo, g.productModel, g.dimensionText,
          g.cycleCode, g.orderQty, g.unit, g.drawingNo, g.materialThickness,
          g.orderPartGroupId,
        ],
      );
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
    const refs = await this.loadRefs(this.dataSource, id);
    if (refTotal(refs.counts) > 0) {
      throw new BadRequestException(
        `订单已被${describeRefs(refs.counts)}引用，禁止删除；请先删除或冲销对应的下游记录`,
      );
    }

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
}
