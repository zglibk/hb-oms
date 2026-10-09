import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ORDER_STATUS,
  SURFACE_NONE,
  formatDimension,
  needsOutsource,
  partGroupParts,
} from '@hb-oms/shared';
import { OutsourcePart } from './entities/outsource-part.entity';
import {
  CreateOutsourcePartDto,
  QueryOutsourcePartDto,
  QueryPartGroupOptionDto,
  QueryReturnProgressDto,
  UpdateOutsourcePartDto,
} from './dto/outsource.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { PartGroupSnapshotService } from '../../common/services/part-group-snapshot.service';
import { RecordOwnershipService } from '../../common/services/record-ownership.service';

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
    private readonly ownership: RecordOwnershipService,
  ) {}

  /* ==================== 查询 ==================== */

  async findList(query: QueryOutsourcePartDto, user?: CurrentUserPayload) {
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
    if (query.onlyUnreturned) {
      // 按所属部件组累计判定（同 part-group-options 的 hideReturned 口径），不看单条记录
      qb.andWhere(
        `(SELECT COALESCE(SUM(x.return_qty), 0) FROM t_outsource_part x
           WHERE x.order_part_group_id = r.order_part_group_id)
         < (SELECT g.qty_pcs FROM t_order_part_group g WHERE g.id = r.order_part_group_id)`,
      );
    }
    // 回厂日期倒序：最近回来的排最前，符合「看今天回了什么」的使用习惯
    qb.orderBy('r.backDate', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    // 每行带 canModify：前端据此禁用编辑 / 删除（服务端 update / remove 另有硬校验）
    const modifiable = user ? await this.ownership.canModifyMany('outsource', rows, user) : rows.map(() => false);
    const list = rows.map((r, i) => Object.assign(r, { canModify: modifiable[i] }));
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
   *
   * `hideReturned`（2026-09-26）：隐藏已回齐的组（累计回厂 ≥ 组支数）。使用方反馈「回完了的外轨
   * 还能再登记一次」——实测 29 组被重复登记或多打一个 0，根源就是回齐的组照样列在选择器里。
   * 这只是**录入引导**，不是闸门：返工、补货等合理超量仍可勾「只看已回齐」（`onlyReturned`）找回来，
   * 保存前的超量提醒见 findReturnProgress。
   */
  async findPartGroupOptions(query: QueryPartGroupOptionDto): Promise<PartGroupOption[]> {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
    const params: any[] = [ORDER_STATUS.CANCELLED, SURFACE_NONE];
    let where = ' WHERE o.status <> ? AND p.surface_type <> ?';
    if (query.surfaceType) {
      where += ' AND p.surface_type = ?';
      params.push(query.surfaceType);
    }
    const returnedSql = `COALESCE((SELECT SUM(op2.return_qty) FROM t_outsource_part op2
                               WHERE op2.order_part_group_id = g.id), 0)`;
    if (query.onlyReturned) {
      where += ` AND g.qty_pcs > 0 AND ${returnedSql} >= g.qty_pcs`;
    } else if (query.hideReturned) {
      where += ` AND ${returnedSql} < g.qty_pcs`;
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
              g.group_type         AS groupType,
              p.item_no            AS itemNo,
              m.unit_weight        AS productUnitWeight,
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

    const partWeight = await this.loadPartUnitWeights(rows);

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
      // 优先按「组对应的部件」取单重，取不到再回落产品级——回厂过的是部件，
      // 外轨和内轨的单重本就不同，拿产品级一个值折算数量会系统性偏差
      unitWeight:
        partWeight.get(`${r.itemNo ?? ''}|${partGroupParts(r.groupType)[0] ?? ''}`) ??
        (Number(r.productUnitWeight) || 0),
    }));
  }

  /**
   * 批量取「货号 + 部件」对应的单重，键为 `${itemNo}|${partType}`。
   *
   * 部件信息（t_material）是**按部件建档**的：同一货号下外轨/中轨/内轨各一条，
   * 单重不同。部件组拆到部件粒度后（2026-08-10 起订单默认按节数铺开外/中/内轨），
   * 必须按组对应的部件取单重，否则三个组都拿产品行 material_id 那一条的值。
   *
   * 组 → 部件用共享包 `partGroupParts(组类型)[0]`（首部件），与订单表单按图号
   * 带工艺版本的取法一致：外中轨组取外轨、整品组取外轨。这两种组本就混着多个
   * 部件，单重只能给个默认值，录入时按实际过磅手改。
   *
   * 同货号同部件建了多条（不同规格/料厚）时取 id 最小的一条：单重只是折算默认值，
   * 允许人工修改，没必要为选哪条再引入一套匹配规则。
   */
  private async loadPartUnitWeights(rows: any[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const itemNos = [...new Set(rows.map((r) => r.itemNo).filter((v) => v))];
    if (!itemNos.length) return map;
    const parts = [
      ...new Set(rows.map((r) => partGroupParts(r.groupType)[0]).filter((v) => v)),
    ];
    if (!parts.length) return map;
    const found: any[] = await this.dataSource.query(
      `SELECT item_no, part_type, unit_weight
         FROM t_material
        WHERE status = 1
          AND item_no IN (${itemNos.map(() => '?').join(',')})
          AND part_type IN (${parts.map(() => '?').join(',')})
          AND unit_weight IS NOT NULL
        ORDER BY id ASC`,
      [...itemNos, ...parts],
    );
    for (const f of found) {
      const key = `${f.item_no}|${f.part_type}`;
      // ORDER BY id ASC + 只认首次出现 = 取最早建档的一条
      if (!map.has(key)) {
        const w = Number(f.unit_weight);
        if (w > 0) map.set(key, w);
      }
    }
    return map;
  }

  /* ==================== 录入 ==================== */

  /**
   * 登记回厂：一次可录多行（勾选多个部件组，共用加工商与回厂日期）。
   * 展示快照一律服务端从订单侧读取，不采信客户端传值。
   */
  /**
   * 部件组回厂进度：组支数 + 累计已回厂（可排除正在编辑的那条）。
   *
   * 供前端保存前做**超量提醒**（累计将超过组支数时弹框确认，可继续）——
   * 刻意不在 create/update 里硬拦：返工回厂、客户加量先做后补单都会合理地超出，
   * 硬拦会逼人先去改订单或者干脆不录；拦住「重复登记 / 多打一个 0」靠当场确认就够了。
   */
  async findReturnProgress(query: QueryReturnProgressDto) {
    const ids = [
      ...new Set(
        String(query.groupIds ?? '')
          .split(',')
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v > 0),
      ),
    ].slice(0, 500);
    if (!ids.length) return [];
    const rows: any[] = await this.dataSource.query(
      `SELECT g.id AS orderPartGroupId, g.qty_pcs AS qtyPcs,
              COALESCE((SELECT SUM(op.return_qty) FROM t_outsource_part op
                         WHERE op.order_part_group_id = g.id AND op.id <> ?), 0) AS returnedQty
         FROM t_order_part_group g
        WHERE g.id IN (?)`,
      [query.excludeId ?? 0, ids],
    );
    return rows.map((r) => ({
      orderPartGroupId: Number(r.orderPartGroupId),
      qtyPcs: Number(r.qtyPcs) || 0,
      returnedQty: Number(r.returnedQty) || 0,
    }));
  }

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

  /**
   * 编辑单条：锚点与订单侧快照不可改，只改加工商/日期/表面处理/颜色/数量口径/备注。
   * 只许创建人与外发主管角色（受数据范围约束，管理员与超级管理员均不例外）——RecordOwnershipService。
   */
  async update(id: number, dto: UpdateOutsourcePartDto, user: CurrentUserPayload) {
    const row = await this.findOne(id);
    await this.ownership.assertCanModify('outsource', row, user, '修改');
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
   * 与修改同权：只许创建人与外发主管角色。
   */
  async remove(id: number, user: CurrentUserPayload) {
    const row = await this.findOne(id);
    await this.ownership.assertCanModify('outsource', row, user, '删除');
    await this.partRepo.delete(id);
    return { id };
  }
}
