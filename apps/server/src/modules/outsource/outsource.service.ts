import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ORDER_STATUS,
  SURFACE_NONE,
  formatDimension,
  hasSocket,
  needsOutsource,
  partGroupParts,
  partGroupSideQtyRows,
} from '@hb-oms/shared';
import { OutsourcePart } from './entities/outsource-part.entity';
import {
  CreateOutsourcePartDto,
  QueryOutsourcePartDto,
  QueryPartGroupOptionDto,
  QueryPartGroupVisibilityDto,
  QueryReturnProgressDto,
  UpdateOutsourcePartDto,
} from './dto/outsource.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { PartGroupSnapshotService } from '../../common/services/part-group-snapshot.service';
import { RecordOwnershipService } from '../../common/services/record-ownership.service';
import { dictLabeler, loadDictLabels } from '../../common/utils/dict-label.util';

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
  /** 当前部件/边别需求支数（订单口径，参考用——回厂数不与它做硬校验） */
  qtyPcs: number;
  /** 当前部件/边别累计已回厂支数 */
  returnedQty: number;
  /** 归属部件组的总需求支数与累计已回厂支数（供历史未分边提示和筛选使用） */
  groupQtyPcs: number;
  groupReturnedQty: number;
  /** 卡口外轨/内轨下无法归属左右的历史回厂数量；仅边别行返回。 */
  legacyReturnedQty: number;
  /** 卡口外轨/内轨为 left / right，中轨及非卡口部件组为空串。 */
  side: string;
  /** 订单数量与单位（展示用） */
  orderQty: number;
  unit: string | null;
  /** 生产图号 / 材料厚度（自部件组） */
  drawingNo: string | null;
  materialThickness: string | null;
  /** 单重（kg/支）：自部件信息带出，回厂折算默认值 */
  unitWeight: number;
  /** 选择器本地全局搜索索引；不写入回厂记录。 */
  searchText?: string;
}

/** 部件组选择器的去重下拉项 */
export interface PartGroupFilterOptions {
  customerNames: string[];
  productModels: string[];
  surfaceTypes: string[];
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

  private returnSideKey(orderPartGroupId: number, side: string) {
    return `${orderPartGroupId}|${side}`;
  }

  /** 按部件组 + 边别汇总回厂数量；空边别保留历史未分边流水。 */
  private async loadReturnedBySide(
    groupIds: number[],
    excludeId?: number,
  ): Promise<Map<string, number>> {
    const ids = [...new Set(groupIds.filter((id) => Number.isInteger(id) && id > 0))];
    const result = new Map<string, number>();
    if (!ids.length) return result;
    const excludeSql = excludeId ? ' AND id <> ?' : '';
    const params: Array<number | number[]> = [ids];
    if (excludeId) params.push(excludeId);
    const rows: any[] = await this.dataSource.query(
      `SELECT order_part_group_id AS orderPartGroupId, side, SUM(return_qty) AS returnedQty
         FROM t_outsource_part
        WHERE order_part_group_id IN (?)${excludeSql}
        GROUP BY order_part_group_id, side`,
      params,
    );
    rows.forEach((row) => {
      result.set(
        this.returnSideKey(Number(row.orderPartGroupId), row.side ?? ''),
        Number(row.returnedQty) || 0,
      );
    });
    return result;
  }

  /** 判断回厂流水所属组是否为需要区分左/右的卡口外轨、内轨。 */
  private async loadSideCapableGroupIds(groupIds: number[]): Promise<Set<number>> {
    const ids = [...new Set(groupIds.filter((id) => Number.isInteger(id) && id > 0))];
    const result = new Set<number>();
    if (!ids.length) return result;
    const rows: any[] = await this.dataSource.query(
      `SELECT g.id AS orderPartGroupId, g.group_type AS groupType, p.product_type AS productType
         FROM t_order_part_group g
         JOIN t_order_product p ON p.id = g.order_product_id
        WHERE g.id IN (?)`,
      [ids],
    );
    rows.forEach((row) => {
      const sides = partGroupSideQtyRows(row.groupType, hasSocket(row.productType), 1);
      if (sides.some((item) => item.side)) result.add(Number(row.orderPartGroupId));
    });
    return result;
  }

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
      // 卡口外轨/内轨按同边别累计判定；中轨、非卡口及历史未分边流水按组累计判定。
      qb.andWhere(
        `(
          (r.side <> '' AND
            (SELECT COALESCE(SUM(x.return_qty), 0) FROM t_outsource_part x
              WHERE x.order_part_group_id = r.order_part_group_id AND x.side = r.side)
            < COALESCE((SELECT MAX(pt.qty) FROM t_order_part pt
              WHERE pt.part_group_id = r.order_part_group_id AND pt.side = r.side), 0))
          OR
          (r.side = '' AND
            (SELECT COALESCE(SUM(x.return_qty), 0) FROM t_outsource_part x
              WHERE x.order_part_group_id = r.order_part_group_id)
            < (SELECT g.qty_pcs FROM t_order_part_group g WHERE g.id = r.order_part_group_id))
        )`,
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
    const sideCapableGroupIds = await this.loadSideCapableGroupIds(rows.map((row) => row.orderPartGroupId));
    const list = rows.map((r, i) => Object.assign(r, {
      canModify: modifiable[i],
      legacyUnassigned: r.side === '' && sideCapableGroupIds.has(r.orderPartGroupId),
    }));
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const row = await this.partRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('外发回厂记录不存在');
    return row;
  }

  /** 列表与下拉选项共用的基础范围，避免切换「只看已回齐」后两边口径不一致。 */
  private buildPartGroupVisibilityFilter(query: QueryPartGroupVisibilityDto) {
    const params: any[] = [ORDER_STATUS.CANCELLED, SURFACE_NONE];
    let where = ' WHERE o.status <> ? AND p.surface_type <> ?';
    const returnedSql = `COALESCE((SELECT SUM(op2.return_qty) FROM t_outsource_part op2
                               WHERE op2.order_part_group_id = g.id), 0)`;
    // 卡口外轨、内轨需要在返回到前端后再按 left/right 判定；此处不能用组总数把
    // 「左边超量、右边未回」误当成整组已回齐。
    const sideCapableSql = `(FIND_IN_SET('socket', COALESCE(p.product_type, '')) > 0
      AND g.group_type IN ('outer', 'inner'))`;
    if (query.onlyReturned) {
      where += ` AND (${sideCapableSql} OR (g.qty_pcs > 0 AND ${returnedSql} >= g.qty_pcs))`;
    } else if (query.hideReturned) {
      where += ` AND (${sideCapableSql} OR ${returnedSql} < g.qty_pcs)`;
    }
    return { where, params };
  }

  /**
   * 客户、产品型号、表面处理下拉项：直接从当前可选记录全量去重，按上级条件
   * 单向收窄，不从最多 200 条的列表结果反推，避免旧记录中的选项缺失。
   */
  async findPartGroupFilterOptions(
    query: QueryPartGroupOptionDto,
  ): Promise<PartGroupFilterOptions> {
    const buildRange = (level: 'customer' | 'productModel' | 'surfaceType') => {
      const visibility = this.buildPartGroupVisibilityFilter(query);
      const params = visibility.params;
      let where = visibility.where;
      const addExact = (column: string, value?: string) => {
        const normalized = value?.trim();
        if (!normalized) return;
        where += ` AND ${column} = ?`;
        params.push(normalized);
      };
      // 单向级联：当前字段只受它之前的上级条件约束。下级旧值不得反向限制上级选项，
      // 因为用户切换上级时前端会立即清空这些下级值。
      if (level !== 'customer') addExact('o.customer_name', query.customerName);
      if (level === 'surfaceType') addExact('g.product_model', query.productModel);
      return {
        fromSql: `
          FROM t_order_part_group g
          JOIN t_order_product p ON p.id = g.order_product_id
          JOIN t_order o ON o.id = g.order_id
          ${where}`,
        params,
      };
    };
    const customersRange = buildRange('customer');
    const modelsRange = buildRange('productModel');
    const surfacesRange = buildRange('surfaceType');
    const [customers, models, surfaces]: any[][] = await Promise.all([
      this.dataSource.query(
        `SELECT DISTINCT o.customer_name AS value ${customersRange.fromSql}
          AND o.customer_name IS NOT NULL AND TRIM(o.customer_name) <> ''
         ORDER BY o.customer_name`,
        customersRange.params,
      ),
      this.dataSource.query(
        `SELECT DISTINCT g.product_model AS value ${modelsRange.fromSql}
          AND g.product_model IS NOT NULL AND TRIM(g.product_model) <> ''
         ORDER BY g.product_model`,
        modelsRange.params,
      ),
      this.dataSource.query(
        `SELECT DISTINCT p.surface_type AS value ${surfacesRange.fromSql}
          AND p.surface_type IS NOT NULL AND TRIM(p.surface_type) <> ''
         ORDER BY p.surface_type`,
        surfacesRange.params,
      ),
    ]);
    const valuesOf = (rows: any[]) => rows.map((row) => String(row.value));
    return {
      customerNames: valuesOf(customers),
      productModels: valuesOf(models),
      surfaceTypes: valuesOf(surfaces),
    };
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
    const limit = query.all ? undefined : Math.min(Math.max(query.limit ?? 200, 1), 500);
    const visibility = this.buildPartGroupVisibilityFilter(query);
    const params = visibility.params;
    let where = visibility.where;
    const addLikeFilter = (column: string, value?: string) => {
      const normalized = value?.trim();
      if (!normalized) return;
      where += ` AND ${column} LIKE ?`;
      params.push(`%${normalized}%`);
    };
    const addExactFilter = (column: string, value?: string) => {
      const normalized = value?.trim();
      if (!normalized) return;
      where += ` AND ${column} = ?`;
      params.push(normalized);
    };

    // 独立条件彼此以及关键词之间按 AND 组合；必须在服务端、LIMIT 之前过滤，
    // 否则前端从最多 200 条结果里二次筛选会漏掉真正匹配的旧订单。
    addLikeFilter('o.order_no', query.orderNo);
    addExactFilter('o.customer_name', query.customerName);
    addLikeFilter('o.production_no', query.productionNo);
    addExactFilter('g.product_model', query.productModel);
    if (query.surfaceType) {
      where += ' AND p.surface_type = ?';
      params.push(query.surfaceType);
    }
    const keyword = query.keyword?.trim();
    if (keyword) {
      // 关键词是独立条件之外的全局搜索，不绑定在上面四个表单字段上。
      // 覆盖订单、产品、部件组、部件追溯码及相关字典中文标签；新增独立条件时
      // 仍与本条件按 AND 叠加，用户可以先缩小范围再搜任意业务属性。
      const kw = `%${keyword}%`;
      where += ` AND (
        (CONVERT(CONCAT_WS('|',
          o.order_no, o.po_no, o.customer_name, o.production_no,
          p.material_code, p.item_no, p.product_name, p.product_type, p.rail_section,
          p.dimension_raw, CAST(p.dimension_mm AS CHAR), p.surface_type, p.color, p.sheet_material,
          g.product_model, g.group_type, g.drawing_no, g.drawing_version,
          g.material_thickness, g.remark
        ) USING utf8mb4) COLLATE utf8mb4_general_ci) LIKE ?
        OR EXISTS (
          SELECT 1 FROM t_order_part pt_kw
           WHERE pt_kw.part_group_id = g.id
             AND (CONVERT(CONCAT_WS('|', pt_kw.cycle_code, pt_kw.remark) USING utf8mb4)
                  COLLATE utf8mb4_general_ci) LIKE ?
        )
        OR EXISTS (
          SELECT 1 FROM t_dict d_kw
           WHERE d_kw.dict_label LIKE ?
             AND (
               (d_kw.dict_type = 'surface_type' AND d_kw.dict_value = p.surface_type)
               OR (d_kw.dict_type = 'product_type' AND FIND_IN_SET(d_kw.dict_value, p.product_type))
               OR (d_kw.dict_type = 'rail_section' AND d_kw.dict_value = p.rail_section)
               OR (d_kw.dict_type = 'part_group_type' AND d_kw.dict_value = g.group_type)
             )
        )
      )`;
      params.push(kw, kw, kw);
    }
    const searchTextSelect = query.includeSearchText
      ? `, CONCAT_WS('|',
          o.order_no, o.po_no, o.customer_name, o.production_no,
          p.material_code, p.item_no, p.product_name,
          p.product_type, p.rail_section, p.dimension_raw, CAST(p.dimension_mm AS CHAR),
          p.surface_type, p.color, p.sheet_material,
          g.product_model, g.group_type, g.drawing_no, g.drawing_version,
          g.material_thickness, g.remark,
          pt_summary.partSearchText
        ) AS searchText`
      : `, '' AS searchText`;
    const sqlLimit = limit == null ? '' : ' LIMIT ?';
    if (limit != null) params.push(limit);

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
              p.product_type       AS productType,
              p.rail_section       AS railSection,
              g.qty_pcs            AS qtyPcs,
              g.group_type         AS groupType,
              p.item_no            AS itemNo,
              m.unit_weight        AS productUnitWeight,
              pt_summary.cycleCode AS cycleCode,
              pt_summary.partTypes AS partTypes,
              COALESCE(return_summary.returnedQty, 0) AS returnedQty
              ${searchTextSelect}
         FROM t_order_part_group g
         JOIN t_order_product p ON p.id = g.order_product_id
         JOIN t_order o         ON o.id = g.order_id
         LEFT JOIN t_material m ON m.id = p.material_id
         LEFT JOIN (
           SELECT part_group_id,
                  MIN(NULLIF(cycle_code, '')) AS cycleCode,
                  GROUP_CONCAT(DISTINCT part_type) AS partTypes,
                  GROUP_CONCAT(CONCAT_WS('|', part_type, side, cycle_code, remark) SEPARATOR '|') AS partSearchText
             FROM t_order_part
            GROUP BY part_group_id
         ) pt_summary ON pt_summary.part_group_id = g.id
         LEFT JOIN (
           SELECT order_part_group_id, SUM(return_qty) AS returnedQty
             FROM t_outsource_part
            GROUP BY order_part_group_id
         ) return_summary ON return_summary.order_part_group_id = g.id
         ${where}
        ORDER BY g.id DESC${sqlLimit}`,
      params,
    );

    const [partWeight, dict, returnedBySide] = await Promise.all([
      this.loadPartUnitWeights(rows),
      query.includeSearchText
        ? loadDictLabels(this.dataSource, [
          'surface_type', 'product_type', 'rail_section', 'part_group_type', 'part_type',
        ])
        : Promise.resolve(new Map<string, string>()),
      this.loadReturnedBySide(rows.map((row) => Number(row.orderPartGroupId))),
    ]);
    const label = dictLabeler(dict);

    return rows.flatMap((r) => {
      const orderPartGroupId = Number(r.orderPartGroupId);
      const groupQtyPcs = Number(r.qtyPcs) || 0;
      const groupReturnedQty = Number(r.returnedQty) || 0;
      const legacyReturnedQty = returnedBySide.get(this.returnSideKey(orderPartGroupId, '')) ?? 0;
      const sideRows = partGroupSideQtyRows(r.groupType, hasSocket(r.productType), groupQtyPcs);
      const searchText = query.includeSearchText
        ? [
          r.searchText,
          label('surface_type', r.surfaceType),
          ...String(r.productType ?? '').split(',').map((value) => label('product_type', value.trim())),
          label('rail_section', r.railSection),
          label('part_group_type', r.groupType),
          ...String(r.partTypes ?? '').split(',').map((value) => label('part_type', value.trim())),
        ].filter(Boolean).join('|')
        : undefined;
      return sideRows.map(({ side, qty }) => {
        const returnedQty = side
          ? (returnedBySide.get(this.returnSideKey(orderPartGroupId, side)) ?? 0)
          : groupReturnedQty;
        const option: PartGroupOption = {
          orderPartGroupId,
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
          side,
          qtyPcs: qty,
          returnedQty,
          groupQtyPcs,
          groupReturnedQty,
          legacyReturnedQty: side ? legacyReturnedQty : 0,
          orderQty: Number(r.orderQty) || 0,
          unit: r.unit ?? null,
          drawingNo: r.drawingNo ?? null,
          materialThickness: r.materialThickness ?? null,
          // 优先按「组对应的部件」取单重，取不到再回落产品级——回厂过的是部件，
          // 外轨和内轨的单重本就不同，拿产品级一个值折算数量会系统性偏差。
          unitWeight:
            partWeight.get(`${r.itemNo ?? ''}|${partGroupParts(r.groupType)[0] ?? ''}`) ??
            (Number(r.productUnitWeight) || 0),
          searchText,
        };
        const returned = side
          ? option.legacyReturnedQty === 0 && option.returnedQty >= option.qtyPcs
          : option.returnedQty >= option.qtyPcs;
        if (query.onlyReturned && !returned) return null;
        if (query.hideReturned && returned) return null;
        return option;
      }).filter((option): option is PartGroupOption => option !== null);
    });
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
   * 部件/边别回厂进度：卡口外轨、内轨按 left/right 分别统计；中轨及非卡口按组统计。
   *
   * 供前端保存前做**超量提醒**（累计将超过组支数时弹框确认，可继续）——
   * 刻意不在 create/update 里硬拦：返工回厂、客户加量先做后补单都会合理地超出，
   * 硬拦会逼人先去改订单或者干脆不录；拦住「重复登记 / 多打一个 0」靠当场确认就够了。
   */
  async findReturnProgress(query: QueryReturnProgressDto) {
    const rawIds = String(query.groupIds ?? '').split(',');
    const rawSides = String(query.sides ?? '').split(',');
    const requested = rawIds
      .map((value, index) => ({
        orderPartGroupId: Number(value),
        side: rawSides[index] === 'left' || rawSides[index] === 'right' ? rawSides[index] : '',
      }))
      .filter((item) => Number.isInteger(item.orderPartGroupId) && item.orderPartGroupId > 0)
      .filter((item, index, items) => items.findIndex((other) =>
        other.orderPartGroupId === item.orderPartGroupId && other.side === item.side,
      ) === index)
      .slice(0, 500);
    const ids = [...new Set(requested.map((item) => item.orderPartGroupId))];
    if (!ids.length) return [];
    const [snapshots, returnedBySide] = await Promise.all([
      this.partGroupSnapshot.load(null, ids),
      this.loadReturnedBySide(ids, query.excludeId),
    ]);
    return requested.flatMap((item) => {
      const snap = snapshots.get(item.orderPartGroupId);
      if (!snap) return [];
      const sideRows = partGroupSideQtyRows(
        snap.groupType,
        hasSocket(snap.productType),
        snap.qtyPcs,
      );
      const target = sideRows.find((row) => row.side === item.side);
      if (!target) return [];
      const returnedQty = item.side
        ? (returnedBySide.get(this.returnSideKey(item.orderPartGroupId, item.side)) ?? 0)
        : [...returnedBySide.entries()]
          .filter(([key]) => key.startsWith(`${item.orderPartGroupId}|`))
          .reduce((sum, [, qty]) => sum + qty, 0);
      return [{
        orderPartGroupId: item.orderPartGroupId,
        side: item.side,
        qtyPcs: target.qty,
        returnedQty,
      }];
    });
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
      const side = it.side === 'left' || it.side === 'right' ? it.side : '';
      const allowedSides = partGroupSideQtyRows(
        snap.groupType,
        hasSocket(snap.productType),
        snap.qtyPcs,
      );
      if (!allowedSides.some((row) => row.side === side)) {
        throw new BadRequestException(
          `第 ${i + 1} 行：部件组边别不符合产品结构，请重新选择回厂部件`,
        );
      }
      return this.partRepo.create({
        ...audit,
        orderId: snap.orderId,
        orderProductId: snap.orderProductId,
        orderPartGroupId: it.orderPartGroupId,
        side,
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
