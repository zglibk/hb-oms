import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ORDER_STATUS, SURFACE_NONE, formatDimension, needsOutsource } from '@hb-oms/shared';
import { OutsourcePart } from './entities/outsource-part.entity';
import {
  CreateOutsourcePartDto,
  QueryOutsourcePartDto,
  QueryPartGroupOptionDto,
  UpdateOutsourcePartDto,
} from './dto/outsource.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { PartGroupSnapshotService } from '../../common/services/part-group-snapshot.service';

/** 可外发部件组行（供录入表单的选择器） */
export interface PartGroupOption {
  orderPartGroupId: number;
  orderId: number;
  orderProductId: number;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  cycleCode: string | null;
  surfaceType: string;
  color: string | null;
  /** 组需求支数（订单口径，参考用——回厂数不与它做校验） */
  qtyPcs: number;
  /** 该组累计已回厂支数（全部回厂记录合计） */
  returnedQty: number;
  /** 订单数量与单位（展示用） */
  orderQty: number;
  unit: string | null;
  /** 生产图号 / 材料厚度（自部件组） */
  drawingNo: string | null;
  materialThickness: string | null;
  /** 单重（kg/支）：自部件信息带出，回厂折算默认值 */
  unitWeight: number;
}

/**
 * ===== 外发件回厂记录（设计文档 §4.3）=====
 *
 * 2026-08-10 起本模块只做一件事：**记录外发件什么时候回厂、回了多少**。
 * 没有发坯单、没有单据号、没有状态机——货回来了录一条流水，就这么简单。
 *
 * 台账「外发已回货」直接聚合本表 return_qty；订单是否被外发引用也按本表探测。
 */
@Injectable()
export class OutsourceService {
  constructor(
    @InjectRepository(OutsourcePart)
    private readonly partRepo: Repository<OutsourcePart>,
    private readonly dataSource: DataSource,
    private readonly partGroupSnapshot: PartGroupSnapshotService,
  ) {}

  /* ==================== 查询 ==================== */

  async findList(query: QueryOutsourcePartDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.partRepo.createQueryBuilder('r');
    if (query.processorName) {
      qb.andWhere('r.processorName = :pn', { pn: query.processorName });
    }
    if (query.surfaceType) qb.andWhere('r.surfaceType = :sf', { sf: query.surfaceType });
    if (query.dateFrom) qb.andWhere('r.backDate >= :df', { df: query.dateFrom });
    if (query.dateTo) qb.andWhere('r.backDate <= :dt', { dt: query.dateTo });
    if (query.keyword) {
      qb.andWhere(
        `(r.processorName LIKE :kw OR r.orderNo LIKE :kw OR r.productionNo LIKE :kw
          OR r.productModel LIKE :kw OR r.drawingNo LIKE :kw)`,
        { kw: `%${query.keyword}%` },
      );
    }
    // 回厂日期倒序：最近回来的排最前，符合「看今天回了什么」的使用习惯
    qb.orderBy('r.backDate', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const row = await this.partRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('外发回厂记录不存在');
    return row;
  }

  /**
   * 可外发部件组：表面处理非 none 的订单产品行下的部件组。
   *
   * 不再有「已安排 / 剩余可发」的额度概念（应回数量已随发坯单一并取消），
   * 改附**组需求支数**与**该组累计已回厂**供录入时参照；同一组可反复选，
   * 分批回厂本来就要录多条。
   */
  async findPartGroupOptions(query: QueryPartGroupOptionDto): Promise<PartGroupOption[]> {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
    const params: any[] = [ORDER_STATUS.CANCELLED, SURFACE_NONE];
    let where = ' WHERE o.status <> ? AND p.surface_type <> ?';
    if (query.surfaceType) {
      where += ' AND p.surface_type = ?';
      params.push(query.surfaceType);
    }
    if (query.keyword) {
      where += ` AND (o.order_no LIKE ? OR o.customer_name LIKE ? OR o.production_no LIKE ?
                      OR g.product_model LIKE ? OR g.drawing_no LIKE ?)`;
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw, kw, kw);
    }
    params.push(limit);

    const rows: any[] = await this.dataSource.query(
      `SELECT g.id                 AS orderPartGroupId,
              g.order_id           AS orderId,
              g.order_product_id   AS orderProductId,
              o.order_no           AS orderNo,
              o.customer_name      AS customerName,
              o.production_no      AS productionNo,
              g.product_model      AS productModel,
              g.drawing_no         AS drawingNo,
              g.material_thickness AS materialThickness,
              p.dimension_raw      AS dimensionRaw,
              p.dimension_unit     AS dimensionUnit,
              p.dimension_mm       AS dimensionMm,
              p.surface_type       AS surfaceType,
              p.color              AS color,
              p.order_qty          AS orderQty,
              p.unit               AS unit,
              g.qty_pcs            AS qtyPcs,
              m.unit_weight        AS unitWeight,
              (SELECT MIN(pt.cycle_code) FROM t_order_part pt
                WHERE pt.part_group_id = g.id AND pt.cycle_code IS NOT NULL AND pt.cycle_code <> '')
                                   AS cycleCode,
              COALESCE((SELECT SUM(op.return_qty) FROM t_outsource_part op
                         WHERE op.order_part_group_id = g.id), 0)
                                   AS returnedQty
         FROM t_order_part_group g
         JOIN t_order_product p ON p.id = g.order_product_id
         JOIN t_order o         ON o.id = g.order_id
         LEFT JOIN t_material m ON m.id = p.material_id
         ${where}
        ORDER BY g.id DESC
        LIMIT ?`,
      params,
    );

    return rows.map((r) => ({
      orderPartGroupId: Number(r.orderPartGroupId),
      orderId: Number(r.orderId),
      orderProductId: Number(r.orderProductId),
      orderNo: r.orderNo ?? null,
      customerName: r.customerName ?? null,
      productionNo: r.productionNo ?? null,
      productModel: r.productModel ?? null,
      dimensionText: formatDimension(r.dimensionRaw, r.dimensionUnit, r.dimensionMm),
      cycleCode: r.cycleCode ?? null,
      surfaceType: r.surfaceType ?? SURFACE_NONE,
      color: r.color ?? null,
      qtyPcs: Number(r.qtyPcs) || 0,
      returnedQty: Number(r.returnedQty) || 0,
      orderQty: Number(r.orderQty) || 0,
      unit: r.unit ?? null,
      drawingNo: r.drawingNo ?? null,
      materialThickness: r.materialThickness ?? null,
      unitWeight: Number(r.unitWeight) || 0,
    }));
  }

  /* ==================== 录入 ==================== */

  /**
   * 登记回厂：一次可录多行（勾选多个部件组，共用加工商与回厂日期）。
   * 展示快照一律服务端从订单侧读取，不采信客户端传值。
   */
  async create(dto: CreateOutsourcePartDto, user: CurrentUserPayload) {
    const groupIds = dto.items.map((it) => it.orderPartGroupId);
    const snapshots = await this.partGroupSnapshot.load(null, groupIds);
    const audit = auditOnCreate(user);

    const rows = dto.items.map((it, i) => {
      const snap = snapshots.get(it.orderPartGroupId);
      if (!snap) {
        throw new BadRequestException(`第 ${i + 1} 行：订单部件组不存在或订单已作废`);
      }
      // 表面处理为空/none 均视为不外发（共享包 needsOutsource 唯一口径）；
      // 允许行内覆盖表面处理，但覆盖值同样不能是「无」
      const surfaceType = it.surfaceType || snap.surfaceType;
      if (!needsOutsource(surfaceType)) {
        throw new BadRequestException(
          `第 ${i + 1} 行：产品「${snap.productModel ?? ''}」表面处理为「无」，不需要外发`,
        );
      }
      return this.partRepo.create({
        ...audit,
        orderId: snap.orderId,
        orderProductId: snap.orderProductId,
        orderPartGroupId: it.orderPartGroupId,
        orderNo: snap.orderNo,
        customerName: snap.customerName,
        productionNo: snap.productionNo,
        productModel: snap.productModel,
        dimensionText: snap.dimensionText,
        cycleCode: snap.cycleCode,
        orderQty: snap.orderQty,
        unit: snap.unit,
        drawingNo: snap.drawingNo,
        materialThickness: snap.materialThickness,
        processorName: dto.processorName,
        surfaceType,
        color: it.color ?? snap.color,
        backDate: dto.backDate,
        returnWeight: String(it.returnWeight ?? 0),
        unitWeight: String(it.unitWeight ?? 0),
        returnQty: it.returnQty,
        remark: it.remark ?? null,
      });
    });

    const saved = await this.partRepo.save(rows);
    return { count: saved.length, ids: saved.map((r) => r.id) };
  }

  /** 编辑单条：锚点与订单侧快照不可改，只改加工商/日期/表面处理/颜色/数量口径/备注 */
  async update(id: number, dto: UpdateOutsourcePartDto, user: CurrentUserPayload) {
    const row = await this.findOne(id);
    const surfaceType = dto.surfaceType || row.surfaceType;
    if (!needsOutsource(surfaceType)) {
      throw new BadRequestException('表面处理不能为「无」——不外发的产品不该有回厂记录');
    }
    await this.partRepo.update(id, {
      ...auditOnUpdate(user),
      processorName: dto.processorName,
      backDate: dto.backDate,
      surfaceType,
      color: dto.color ?? row.color,
      returnWeight: String(dto.returnWeight ?? 0),
      unitWeight: String(dto.unitWeight ?? 0),
      returnQty: dto.returnQty,
      remark: dto.remark ?? null,
    });
    return { id };
  }

  /**
   * 删除：录错了直接删（本表是流水记账行，无下游引用——台账每次实时聚合，
   * 删掉即刻反映）。删除动作靠 @OperationLog 留痕，行已物理删除写不了审计列。
   */
  async remove(id: number) {
    await this.findOne(id);
    await this.partRepo.delete(id);
    return { id };
  }
}
