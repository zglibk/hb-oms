import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  type LedgerSortField,
  DIMENSION_UNIT,
  EXPORT_ROW_LIMIT,
  FINISHED_DOC_STATUS,
  ORDER_STATUS,
  formatDimension,
  formatDimensionView,
  formatProductModel,
  hasSocket,
  needsOutsource,
  productLevelModel,
  UNIT_OPTIONS,
  sanitizeItemCode,
} from '@hb-oms/shared';
import { QueryLedgerDto } from './dto/ledger.dto';
import { QueryOrderDto } from './dto/order.dto';
// 单据族 SQL 与参数是台账与订单自动完结共用的欠数口径，唯一事实源在 order-owed.util
import {
  INBOUND_FAMILY_PARAMS,
  INBOUND_FAMILY_SQL,
  OUTBOUND_FAMILY_PARAMS,
  OUTBOUND_FAMILY_SQL,
} from './order-owed.util';
import { SystemConfigService } from '../system-config/system-config.service';
import { dictLabeler, loadDictLabels } from '../../common/utils/dict-label.util';

/**
 * ===== 订单跟踪台账：本系统的核心产出（设计文档 §5.1）=====
 *
 * 按**订单产品行**一行，围绕订单逐行呈现四个数：
 *   订单数 / 完成数 / 库存数 / 双欠数（成品欠数、发货欠数）
 *
 * **全部实时聚合，不落任何冗余列**（§4.2）——冗余列一旦与单据不同步就是对账灾难，
 * 这里宁可每次算。红字单方向与原单相反，聚合时按 `direction × quantity` 求和即自然抵扣。
 *
 * ⚠️ 与入库闸门的口径差异（**故意不同，勿"统一"**）：
 *   - 台账「完成数」**包含期初**（opening_balance）——期初是上线前已完成的存量，
 *     业务上确实"已完成"，不计进去台账就对不上手工账；
 *   - 闸门「已入库量」**排除期初**（assembly-quota.util.ts）——期初没有装配过程，
 *     计进去会让该产品额度永久为负、挡死后续正常入库。
 *   两者服务于不同问题，各自正确。
 */

/**
 * 单次导出行数上限。超过就拒绝——静默截断出去的表用户不会知道少了行，
 * 拿去对账比不给更糟。
 *
 * 取自共享包：前端导出前要拿同一个数做预检，两端各写一份迟早漂移
 * （本文件原先自带一份 5000 的副本，2026-08-12 收敛）。
 */
const EXPORT_MAX_ROWS = EXPORT_ROW_LIMIT;

/**
 * 取台账行下各部件组的某个字段，去重后按组序用「/」并列。
 *
 * 台账主行升到产品级后，生产图号/版本/料厚这些**组级**字段一个产品可能有多个值，
 * 导出是平表没法嵌套，故并列展示（与总计划导出同一处理方式）。
 * 按组序（sort/id 正序，见 attachPartGroups 的 ORDER BY）而非台账排序，
 * 保证得到「外轨/中轨/内轨」这种与订单表单一致的顺序。
 *
 * 导出供产品汇总（product-summary.service）拼「料厚签名」复用，禁止复制第二份；
 * 泛型化是因为那边 Tab2 的组数组只有 groupType/materialThickness 两个字段。
 */
export function joinGroupField<G>(
  row: { partGroups: G[] },
  pick: (g: G) => string | null,
): string {
  const seen: string[] = [];
  row.partGroups.forEach((g) => {
    const v = (pick(g) ?? '').trim();
    if (v && !seen.includes(v)) seen.push(v);
  });
  return seen.join('/');
}

/**
 * 台账展开行：部件组明细。
 * 四数在产品级（主行），组级只剩「工艺属性 + 外发回厂进度」——外发仍锚部件组，
 * 这正是展开行存在的意义。
 */
export interface LedgerPartGroup {
  orderPartGroupId: number;
  groupType: string | null;
  productModel: string | null;
  /** 生产图号（组级，内部技术图纸号） */
  drawingNo: string | null;
  drawingVersion: string | null;
  materialThickness: string | null;
  /** 组支数（组间是互补部件，各组默认都等于产品支数，非数量拆分） */
  qtyPcs: number;
  /** 该组外发已回货数量（支） */
  returnedQty: number;
  /** 该组外发欠数 = 组支数 − 已回货；不需要表面处理时为 null（不适用） */
  outsourceOwed: number | null;
}

export interface LedgerRow {
  orderProductId: number;
  orderId: number;
  /** 下单日期 */
  orderDate: string | null;
  salesman: string | null;
  merchandiser: string | null;
  customerName: string | null;
  /** 台账「订单编号」= 生产单号（ORD 系统号仅内部定位） */
  productionNo: string | null;
  orderNo: string | null;
  materialCode: string | null;
  itemNo: string | null;
  /** 产品型号：整品行 = 货号 + 类型中文组合 + 「滑轨」；分体行后缀由组构成推导（外中轨/内轨…） */
  productModel: string | null;
  productType: string | null;
  railSection: string | null;
  /** 分体出货：0整品 1分体（该行按部件组构成分体包装出货，不组装成整品） */
  isSplit: number;
  dimensionMm: number | null;
  dimensionText: string | null;
  /** 订单数量与单位（原始录入口径，展示用） */
  orderQty: number;
  unit: string | null;
  surfaceType: string | null;
  color: string | null;
  /** 该产品各装配批次的车间（去重）；车间已下沉批次级，多批可分在不同车间 */
  assemblyWorkshops: string[];
  /** 部件组明细（展开行）：工艺属性 + 各组外发回厂进度 */
  partGroups: LedgerPartGroup[];
  deliveryDate: string | null;
  isExport: number;
  exportCountry: string | null;
  socket: boolean;
  /** ===== 四数 ===== */
  /** 订单数（支，组支数口径） */
  qtyPcs: number;
  /** 完成数：Σ已确认入库（含期初）− Σ对应红字 */
  inQty: number;
  /** 出库数：Σ已确认销售出库 − Σ对应红字 */
  outQty: number;
  /** 库存数：该组当前结存合计 */
  stockQty: number;
  /**
   * 成品欠数 = 订单数 − 完成数，可为负（超产）。
   * 展示名 2026-08-11 由「生产欠数」改为「成品欠数」——欠的是成品，与「发货欠数」成对；
   * 字段名按 CLAUDE.md 的命名稳定性约定**保持 `productionOwed` 不变**（只改展示名）。
   */
  productionOwed: number;
  /** 发货欠数 = 订单数 − 出库数，可为负（超发）；手工表「成品结存」即此口径 */
  deliveryOwed: number;
  /** 外发已回货数量（该产品下各部件组之和） */
  returnedQty: number;
  /**
   * 外发欠数 = **应外发量 − 已回货量**，即"还有多少支零件在加工厂没回来"。
   *
   * ⚠️ 应外发量是 **Σ部件组支数**，不是产品订单数——外发锚部件组，一个三节轨产品
   * 20 支会拆成 外轨/中轨/内轨 三组各 20 支，实际要送出去 60 支零件。拿产品订单数
   * 去减各组回货合计（20 − 60）只会得到 −40 这种没有意义的负数。
   *
   * 不需要表面处理的产品（`surface_type = none`）为 **null**——它压根不走外发，
   * 显示 0 会和"已全部回厂"混淆，界面与导出一律留空。
   */
  outsourceOwed: number | null;
  /** 装配完成量（actual_date 非空的批次合计）；分体行同样要装配，一律出数字 */
  assembledQty: number;
  /** 装配未完成量 = 订单数 − 装配完成量，可为负（超装配） */
  assemblyPendingQty: number;
  /** 最早未完成装配批次的计划完成日 */
  nextAssemblyPlanDate: string | null;
  /** 是否逾期：交期已过且仍欠发货 */
  overdue: boolean;
}

/** SQL 表达式只来自服务端白名单；NULL 始终置后，产品行 ID 保证分页稳定。 */
const LEDGER_SORT_SQL: Record<LedgerSortField, string> = {
  orderDate: 'o.order_date',
  deliveryDate: 'p.delivery_date',
  customerName: 'o.customer_name',
  productionNo: "COALESCE(NULLIF(o.production_no, ''), o.order_no)",
  materialCode: "NULLIF(p.material_code, '')",
  dimensionMm: 'p.dimension_mm',
  orderQty: 'p.order_qty',
  returnedQty: 'IFNULL(ret.return_qty, 0)',
  assembledQty: 'IFNULL(asm.done_qty, 0)',
  qtyPcs: 'p.qty_pcs',
  inQty: 'IFNULL(fin.in_qty, 0)',
  productionOwed: '(p.qty_pcs - IFNULL(fin.in_qty, 0))',
  outQty: 'IFNULL(fin.out_qty, 0)',
  deliveryOwed: '(p.qty_pcs - IFNULL(fin.out_qty, 0))',
  stockQty: 'IFNULL(bal.qty, 0)',
};

@Injectable()
export class OrderLedgerService {
  constructor(
    private readonly dataSource: DataSource,
    // 导出文件由服务端生成，前端的字段显隐管不到，故导出列要自己读一次开关
    private readonly systemConfig: SystemConfigService,
  ) {}

  async findLedger(query: QueryLedgerDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: string[] = ['o.status <> ?'];
    const params: Array<string | number> = [ORDER_STATUS.CANCELLED];

    if (query.keyword) {
      // 生产图号在部件组上（展开行才显示），但要能搜到——故用 EXISTS 下钻匹配
      where.push(`(o.order_no LIKE ? OR o.customer_name LIKE ? OR o.production_no LIKE ?
                   OR p.item_no LIKE ? OR p.material_code LIKE ?
                   OR EXISTS (SELECT 1 FROM t_order_part_group g2
                               WHERE g2.order_product_id = p.id
                                 AND (g2.product_model LIKE ? OR g2.drawing_no LIKE ?)))`);
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw, kw, kw, kw, kw);
    }
    if (query.customerName) {
      where.push('o.customer_name = ?');
      params.push(query.customerName);
    }
    if (query.salesman) {
      where.push('o.salesman = ?');
      params.push(query.salesman);
    }
    if (query.merchandiser) {
      where.push('o.merchandiser = ?');
      params.push(query.merchandiser);
    }
    if (query.deliveryFrom) {
      where.push('p.delivery_date >= ?');
      params.push(query.deliveryFrom);
    }
    if (query.deliveryTo) {
      where.push('p.delivery_date <= ?');
      params.push(query.deliveryTo);
    }
    if (query.orderDateFrom) {
      where.push('o.order_date >= ?');
      params.push(query.orderDateFrom);
    }
    if (query.orderDateTo) {
      where.push('o.order_date <= ?');
      params.push(query.orderDateTo);
    }
    if (query.surfaceType) {
      where.push('p.surface_type = ?');
      params.push(query.surfaceType);
    }
    if (query.assemblyWorkshop) {
      // 车间已下沉批次级（订单环节不再安排装配车间），按批次实际车间匹配
      where.push(`EXISTS (SELECT 1 FROM t_assembly_batch b
                           WHERE b.order_product_id = p.id AND b.workshop = ?)`);
      params.push(query.assemblyWorkshop);
    }
    if (query.isExport != null) {
      where.push('p.is_export = ?');
      params.push(query.isExport);
    }
    if (query.orderStatus != null) {
      where.push('o.status = ?');
      params.push(query.orderStatus);
    }
    // 产品类型多选组合按**包含匹配**：组合串是字典序逗号拼接，单值命中即入选
    if (query.productType) {
      where.push('FIND_IN_SET(?, p.product_type)');
      params.push(query.productType);
    }
    if (query.railSection) {
      where.push('p.rail_section = ?');
      params.push(query.railSection);
    }
    if (query.customerDrawingNo) {
      where.push('p.customer_drawing_no LIKE ?');
      params.push(`%${query.customerDrawingNo}%`);
    }
    if (query.drawingNo) {
      where.push(`EXISTS (SELECT 1 FROM t_order_part_group g3
                           WHERE g3.order_product_id = p.id AND g3.drawing_no LIKE ?)`);
      params.push(`%${query.drawingNo}%`);
    }

    // 聚合派生表放在 JOIN 里，筛选条件才能引用其列。
    // 主行粒度＝**订单产品行**：成品出入库与装配都锚产品行，四数自然在产品级；
    // 部件组沦为展开明细（图号/版本/料厚/外发回货），另行按需查询。
    const fromSql = `
        FROM t_order_product p
        JOIN t_order o ON o.id = p.order_id
        LEFT JOIN (
              SELECT fi.order_product_id AS pid,
                     SUM(CASE WHEN ${INBOUND_FAMILY_SQL}  THEN fd.direction * fi.quantity ELSE 0 END) AS in_qty,
                     SUM(CASE WHEN ${OUTBOUND_FAMILY_SQL} THEN -fd.direction * fi.quantity ELSE 0 END) AS out_qty
                FROM t_finished_item fi
                JOIN t_finished_doc  fd ON fd.id = fi.doc_id
                LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
               WHERE fd.status = ? AND fi.order_product_id > 0
               GROUP BY fi.order_product_id
             ) fin ON fin.pid = p.id
        LEFT JOIN (
              SELECT order_product_id AS pid, SUM(quantity) AS qty
                FROM t_finished_balance
               WHERE order_product_id > 0
               GROUP BY order_product_id
             ) bal ON bal.pid = p.id
        LEFT JOIN (
              -- 外发仍锚**部件组**（部件分开送去表面处理），故按产品行下的组求和
              SELECT g.order_product_id AS pid, SUM(op.return_qty) AS return_qty
                FROM t_outsource_part op
                JOIN t_order_part_group g ON g.id = op.order_part_group_id
               GROUP BY g.order_product_id
             ) ret ON ret.pid = p.id
        LEFT JOIN (
              SELECT order_product_id AS pid,
                     SUM(CASE WHEN actual_date IS NOT NULL THEN qty ELSE 0 END) AS done_qty,
                     MIN(CASE WHEN actual_date IS NULL THEN plan_date END)      AS next_plan_date,
                     -- 装配车间已下沉批次级，一个产品多批可分在不同车间，聚合成去重列表展示
                     GROUP_CONCAT(DISTINCT NULLIF(workshop, '') ORDER BY workshop SEPARATOR ',') AS workshops
                FROM t_assembly_batch
               GROUP BY order_product_id
             ) asm ON asm.pid = p.id
       WHERE ${where.join(' AND ')}`;

    // 派生表参数在 WHERE 参数之前（SQL 里 JOIN 先于 WHERE 出现）。
    // 外发已无单据与状态可言（只剩回厂流水），故不再需要排除作废单的参数。
    const joinParams: Array<string | number> = [
      ...INBOUND_FAMILY_PARAMS,
      ...OUTBOUND_FAMILY_PARAMS,
      FINISHED_DOC_STATUS.CONFIRMED,
    ];

    // 只看有欠数 / 只看逾期：依赖聚合结果，放 HAVING 之后的外层条件里
    const having: string[] = [];
    if (query.onlyOwed) {
      having.push(
        '(p.qty_pcs - IFNULL(fin.in_qty, 0) > 0 OR p.qty_pcs - IFNULL(fin.out_qty, 0) > 0)',
      );
    }
    if (query.onlyOverdue) {
      having.push('(p.delivery_date IS NOT NULL AND p.delivery_date < CURDATE() AND p.qty_pcs - IFNULL(fin.out_qty, 0) > 0)');
    }
    const havingSql = having.length ? ` AND ${having.join(' AND ')}` : '';

    const allParams = [...joinParams, ...params];

    const countRows: Array<{ cnt: number | string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt ${fromSql}${havingSql}`,
      allParams,
    );
    const total = Number(countRows?.[0]?.cnt ?? 0);

    const sortExpression = query.sortBy && Object.prototype.hasOwnProperty.call(LEDGER_SORT_SQL, query.sortBy)
      ? LEDGER_SORT_SQL[query.sortBy]
      : LEDGER_SORT_SQL.orderDate;
    const sortDirection = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const rows: any[] = await this.dataSource.query(
      `SELECT p.id AS orderProductId, p.order_id AS orderId, p.qty_pcs AS qtyPcs,
              o.order_no AS orderNo, o.order_date AS orderDate, o.customer_name AS customerName,
              o.salesman AS salesman, o.merchandiser AS merchandiser,
              o.production_no AS productionNo, p.material_code AS materialCode, p.item_no AS itemNo,
              p.product_type AS productType, p.rail_section AS railSection, p.is_split AS isSplit,
              p.dimension_raw AS dimensionRaw, p.dimension_unit AS dimensionUnit,
              p.dimension_mm AS dimensionMm, p.order_qty AS orderQty, p.unit AS unit,
              p.surface_type AS surfaceType, p.color AS color,
              asm.workshops AS workshops, p.delivery_date AS deliveryDate,
              p.is_export AS isExport, p.export_country AS exportCountry,
              IFNULL(fin.in_qty, 0)     AS inQty,
              IFNULL(fin.out_qty, 0)    AS outQty,
              IFNULL(bal.qty, 0)        AS stockQty,
              IFNULL(ret.return_qty, 0) AS returnedQty,
              IFNULL(asm.done_qty, 0)   AS assembledQty,
              asm.next_plan_date        AS nextAssemblyPlanDate
       ${fromSql}${havingSql}
       ORDER BY (${sortExpression} IS NULL), ${sortExpression} ${sortDirection}, p.id DESC
       LIMIT ? OFFSET ?`,
      [...allParams, pageSize, (page - 1) * pageSize],
    );

    const today = new Date().toISOString().slice(0, 10);
    const list: LedgerRow[] = rows.map((r) => {
      const qtyPcs = Number(r.qtyPcs) || 0;
      const inQty = Number(r.inQty) || 0;
      const outQty = Number(r.outQty) || 0;
      const assembledQty = Number(r.assembledQty) || 0;
      const deliveryDate = this.dateText(r.deliveryDate);
      const deliveryOwed = qtyPcs - outQty;
      return {
        orderProductId: Number(r.orderProductId),
        orderId: Number(r.orderId),
        orderDate: this.dateText(r.orderDate),
        salesman: r.salesman ?? null,
        merchandiser: r.merchandiser ?? null,
        customerName: r.customerName ?? null,
        productionNo: r.productionNo ?? null,
        orderNo: r.orderNo ?? null,
        materialCode: r.materialCode ?? null,
        itemNo: r.itemNo ?? null,
        // 产品级型号：整品行 = 货号 + 类型中文组合 + 「滑轨」；
        // 分体行后缀由组构成推导，组数据在 attachPartGroups 里才有，先给整品拼法、随后覆盖
        productModel: formatProductModel(r.itemNo ?? '', r.productType ?? ''),
        productType: r.productType ?? null,
        railSection: r.railSection ?? null,
        isSplit: Number(r.isSplit) || 0,
        dimensionMm: r.dimensionMm == null ? null : Number(r.dimensionMm),
        dimensionText: formatDimension(r.dimensionRaw, r.dimensionUnit, r.dimensionMm) || null,
        orderQty: Number(r.orderQty) || 0,
        unit: r.unit ?? null,
        surfaceType: r.surfaceType ?? null,
        color: r.color ?? null,
        assemblyWorkshops: this.splitList(r.workshops),
        // 部件组明细随主行一起返回（组数有限，一次查完免得每展开一行再打一次接口）
        partGroups: [] as LedgerPartGroup[],
        deliveryDate,
        isExport: Number(r.isExport) || 0,
        exportCountry: r.exportCountry ?? null,
        socket: hasSocket(r.productType),
        qtyPcs,
        inQty,
        outQty,
        stockQty: Number(r.stockQty) || 0,
        productionOwed: qtyPcs - inQty,
        deliveryOwed,
        returnedQty: Number(r.returnedQty) || 0,
        // 应外发量要按部件组累加，故留到 attachPartGroups 里填
        outsourceOwed: null,
        assembledQty,
        assemblyPendingQty: qtyPcs - assembledQty,
        nextAssemblyPlanDate: this.dateText(r.nextAssemblyPlanDate),
        overdue: !!deliveryDate && deliveryDate < today && deliveryOwed > 0,
      };
    });

    // 部件组明细：只查当前页这些产品行的组，一次查完（一页 20 行 × 三组＝60 行，很轻）
    await this.attachPartGroups(list);

    // 汇总卡：当前筛选结果的整体口径（不受分页影响，故单独聚合）
    const sumRows: any[] = await this.dataSource.query(
      // 注意：rows 是 MySQL 8 保留字（窗口函数），列别名必须避开
      `SELECT COUNT(*) AS rowCnt,
              SUM(p.qty_pcs) AS totalQty,
              SUM(IFNULL(fin.in_qty, 0)) AS totalIn,
              SUM(IFNULL(fin.out_qty, 0)) AS totalOut,
              SUM(IFNULL(bal.qty, 0)) AS totalStock
       ${fromSql}${havingSql}`,
      allParams,
    );
    const s = sumRows?.[0] ?? {};
    const totalQty = Number(s.totalQty) || 0;
    const totalIn = Number(s.totalIn) || 0;
    const totalOut = Number(s.totalOut) || 0;

    return {
      list,
      total,
      page,
      pageSize,
      summary: {
        rows: Number(s.rowCnt) || 0,
        totalQty,
        totalIn,
        totalOut,
        totalStock: Number(s.totalStock) || 0,
        totalProductionOwed: totalQty - totalIn,
        totalDeliveryOwed: totalQty - totalOut,
      },
    };
  }

  /**
   * 给台账主行挂上部件组明细（展开行用）。
   *
   * 随列表一起返回而不是另开接口：组数有限（一个产品最多 5 组），一页 20 行也就
   * 60~100 行，一次 IN 查询就够；每展开一行打一次接口反而更慢、还要在前端做缓存。
   * 组级唯一还需实时聚合的只有**外发已回货**（外发仍锚部件组）。
   */
  private async attachPartGroups(list: LedgerRow[]) {
    const productIds = [...new Set(list.map((r) => r.orderProductId))].filter((v) => v > 0);
    if (!productIds.length) return;

    const rows: any[] = await this.dataSource.query(
      `SELECT g.id AS groupId, g.order_product_id AS pid, g.group_type AS groupType,
              g.product_model AS productModel, g.drawing_no AS drawingNo,
              g.drawing_version AS drawingVersion, g.material_thickness AS materialThickness,
              g.qty_pcs AS qtyPcs,
              IFNULL(ret.return_qty, 0) AS returnedQty
         FROM t_order_part_group g
         LEFT JOIN (
               SELECT order_part_group_id AS gid, SUM(return_qty) AS return_qty
                 FROM t_outsource_part
                GROUP BY order_part_group_id
              ) ret ON ret.gid = g.id
        WHERE g.order_product_id IN (${productIds.map(() => '?').join(',')})
        ORDER BY g.sort ASC, g.id ASC`,
      productIds,
    );

    const byProduct = new Map<number, Array<Omit<LedgerPartGroup, 'outsourceOwed'>>>();
    rows.forEach((r) => {
      const pid = Number(r.pid);
      const arr = byProduct.get(pid) ?? [];
      arr.push({
        orderPartGroupId: Number(r.groupId),
        groupType: r.groupType ?? null,
        productModel: r.productModel ?? null,
        drawingNo: r.drawingNo ?? null,
        drawingVersion: r.drawingVersion ?? null,
        materialThickness: r.materialThickness ?? null,
        qtyPcs: Number(r.qtyPcs) || 0,
        returnedQty: Number(r.returnedQty) || 0,
      });
      byProduct.set(pid, arr);
    });
    list.forEach((r) => {
      // 不外发的产品（表面处理=无）欠数不适用，组级与产品级一律 null，界面与导出留空
      const outsourced = needsOutsource(r.surfaceType);
      const groups = byProduct.get(r.orderProductId) ?? [];
      r.partGroups = groups.map((g) => ({
        ...g,
        outsourceOwed: outsourced ? g.qtyPcs - g.returnedQty : null,
      }));
      // 应外发量 = Σ组支数（一个三节轨产品要送出去的是三个部件，不是一套产品）
      r.outsourceOwed = outsourced
        ? groups.reduce((s, g) => s + g.qtyPcs, 0) - r.returnedQty
        : null;
      // 分体行：型号后缀由组构成推导（外中轨/内轨…）。装配两列不再特判——
      // 分体行（含内轨等单部件行）同样要装配自身小零件，与整品行一样出数字
      if (r.isSplit) {
        const groupTypes = groups.map((g) => g.groupType);
        r.productModel = productLevelModel(r.itemNo, r.productType, 1, groupTypes, r.railSection);
      }
    });
  }

  /**
   * 台账行内展开明细（设计文档 §5.1）：该**产品行**的三条流水。
   *
   * 只读、按需加载——台账一页 15~100 行，若随列表一起返回，三张流水表要多查三遍
   * 全量数据，而用户实际只会展开其中一两行。故独立接口，展开时才查。
   * （部件组的工艺属性与外发回货合计已随主行返回，这里查的是逐笔流水。）
   *
   * 口径与台账主表保持一致：
   *   - 成品与装配锚**产品行**；
   *   - 外发仍锚**部件组**，故按该产品下的所有组反查（外发本就是分部件送出去的）；
   *   - 成品流水只取**已确认**单据（草稿/已作废不算数，与四数聚合同口径）；
   *   - 装配批次全取，用 actual_date 是否为空区分计划中/已完成。
   */
  async findRowDetail(orderProductId: number) {
    const [finished, outsource, assembly] = await Promise.all([
      this.dataSource.query(
        `SELECT fd.doc_no AS docNo, fd.biz_type AS bizType, fd.direction AS direction,
                fd.doc_date AS docDate, fi.side AS side, fi.quantity AS quantity,
                fd.creator_name AS creatorName, fi.remark AS remark,
                fo.doc_no AS originDocNo
           FROM t_finished_item fi
           JOIN t_finished_doc fd ON fd.id = fi.doc_id
           LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
          WHERE fi.order_product_id = ? AND fd.status = ?
          ORDER BY fd.doc_date ASC, fd.id ASC`,
        [orderProductId, FINISHED_DOC_STATUS.CONFIRMED],
      ),
      this.dataSource.query(
        `SELECT op.id, op.back_date AS backDate, op.processor_name AS processorName,
                op.surface_type AS surfaceType, op.color AS color,
                op.return_weight AS returnWeight, op.unit_weight AS unitWeight,
                op.return_qty AS returnQty, op.remark, op.creator_name AS creatorName,
                g.group_type AS groupType
           FROM t_outsource_part op
           JOIN t_order_part_group g ON g.id = op.order_part_group_id
          WHERE g.order_product_id = ?
          ORDER BY op.back_date ASC, op.id ASC`,
        [orderProductId],
      ),
      this.dataSource.query(
        `SELECT id, side, workshop, plan_start_date AS planStartDate, plan_date AS planDate,
                actual_date AS actualDate, qty, remark, creator_name AS creatorName
           FROM t_assembly_batch
          WHERE order_product_id = ?
          ORDER BY id ASC`,
        [orderProductId],
      ),
    ]);

    return {
      finished: finished.map((r: any) => ({
        docNo: r.docNo ?? null,
        bizType: r.bizType ?? null,
        /** 1入 −1出；数量恒为正，方向由此表达 */
        direction: Number(r.direction) || 0,
        docDate: this.dateText(r.docDate),
        side: r.side ?? '',
        quantity: Number(r.quantity) || 0,
        /** 红字单被冲的原单号，非红字为 null */
        originDocNo: r.originDocNo ?? null,
        creatorName: r.creatorName ?? null,
        remark: r.remark ?? null,
      })),
      outsource: outsource.map((r: any) => ({
        id: Number(r.id),
        // 外发锚部件组，故流水要标明是哪个部件回的厂
        groupType: r.groupType ?? null,
        backDate: this.dateText(r.backDate),
        processorName: r.processorName ?? null,
        surfaceType: r.surfaceType ?? null,
        color: r.color ?? null,
        returnWeight: Number(r.returnWeight) || 0,
        unitWeight: Number(r.unitWeight) || 0,
        returnQty: Number(r.returnQty) || 0,
        remark: r.remark ?? null,
        creatorName: r.creatorName ?? null,
      })),
      assembly: assembly.map((r: any) => ({
        id: Number(r.id),
        side: r.side ?? '',
        workshop: r.workshop ?? null,
        planStartDate: this.dateText(r.planStartDate),
        planDate: this.dateText(r.planDate),
        actualDate: this.dateText(r.actualDate),
        qty: Number(r.qty) || 0,
        /** 派生状态：实际完成日为空=计划中，非空=已完成（不读 status 列，防脏数据） */
        completed: !!r.actualDate,
        creatorName: r.creatorName ?? null,
        remark: r.remark ?? null,
      })),
    };
  }

  /**
   * 导出 Excel（设计文档 §5.1）：列序对齐台账页，便于过渡期与手工表并行对账。
   *
   * **直接复用 findLedger**，不为导出另写一份聚合 SQL——两份 SQL 迟早分叉，
   * 届时"页面显示 100、导出成 98"这种问题最难查。筛选、四数、汇总、装配车间
   * 聚合全部继承台账口径，页面看到什么就导出什么。
   *
   * 超上限**拒绝而不是静默截断**：截断出去的表用户不会知道少了行，拿去对账
   * 反而比不给更糟。
   */
  async exportExcel(query: QueryLedgerDto): Promise<Buffer> {
    const { list, total, summary } = await this.findLedger({
      ...query,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
    });
    if (!total) {
      throw new BadRequestException('当前筛选条件下没有台账数据，未生成导出文件');
    }
    if (total > EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `当前筛选结果 ${total} 行，超过单次导出上限 ${EXPORT_MAX_ROWS} 行；` +
          '请先按客户 / 交期区间 / 只看有欠数等条件缩小范围再导出',
      );
    }

    // 表面处理与装配车间落库的是字典值（如 spray / assembly_2），导出必须转中文
    const dict = await loadDictLabels(this.dataSource, ['surface_type', 'assembly_workshop']);
    const label = dictLabeler(dict);
    const unitLabel = (v: string | null) =>
      UNIT_OPTIONS.find((o) => o.value === v)?.label ?? (v ?? '');
    // 「颜色」字段停用时整列不输出——台账页也不显示，导出留一列空值只是噪音
    const {
      colorFieldEnabled: colorEnabled,
      inchToMm,
      dimensionViewUnit,
    } = await this.systemConfig.getFeatureFlags();
    // 规格列跟随「默认查看单位」（系统配置）：车间拿导出表对手工账，不该再自己换算一遍
    const dimHeader = dimensionViewUnit === DIMENSION_UNIT.INCH ? '规格(寸)' : '规格(mm)';
    const dimCell = (r: { dimensionMm: number | null; dimensionText: string | null }) =>
      formatDimensionView(r.dimensionMm, dimensionViewUnit, inchToMm) || r.dimensionText || '';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('订单跟踪台账');

    const columns: Array<{ header: string; width: number; productLevel?: boolean }> = [
      { header: '下单日期', width: 12 },
      { header: '业务员', width: 10 },
      { header: '跟单员', width: 10 },
      { header: '客户', width: 20 },
      { header: '订单编号', width: 16 },
      { header: '产品编码', width: 14 },
      { header: '产品型号', width: 22 },
      { header: dimHeader, width: 12 },
      { header: '订单数量', width: 10 },
      { header: '单位', width: 7 },
      { header: '表面处理', width: 11 },
      ...(colorEnabled
        ? [{ header: '颜色', width: 10 }]
        : []),
      { header: '生产图号', width: 16 },
      { header: '版本', width: 8 },
      { header: '料厚', width: 14 },
      { header: '外发已回货', width: 11 },
      { header: '外发欠数', width: 10 },
      { header: '装配车间', width: 12 },
      { header: '装配完成', width: 10 },
      { header: '订单数(支)', width: 11 },
      { header: '成品入库', width: 10 },
      { header: '成品欠数', width: 10 },
      { header: '订单交期', width: 12 },
      { header: '成品出货', width: 10 },
      { header: '发货欠数', width: 10 },
      { header: '库存数', width: 10 },
      { header: '状态', width: 10 },
    ];
    ws.columns = columns.map((c) => ({ header: c.header, width: c.width }));
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.alignment = { vertical: 'middle', horizontal: 'center' };
    head.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FA' } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

    const today = new Date().toISOString().slice(0, 10);
    list.forEach((r) => {
      ws.addRow([
        r.orderDate ?? '',
        r.salesman ?? '',
        r.merchandiser ?? '',
        r.customerName ?? '',
        r.productionNo || r.orderNo || '',
        r.materialCode ?? '',
        r.productModel ?? '',
        dimCell(r),
        r.orderQty,
        unitLabel(r.unit),
        label('surface_type', r.surfaceType),
        ...(colorEnabled ? [r.color ?? ''] : []),
        // 组级字段按组序去重并列（一个产品多组时如「DWG-OM/DWG-IN」）
        joinGroupField(r, (g) => g.drawingNo),
        joinGroupField(r, (g) => g.drawingVersion),
        joinGroupField(r, (g) => g.materialThickness),
        r.returnedQty,
        // 不外发的产品留空而不是 0——0 会被读成「已全部回厂」
        r.outsourceOwed ?? '',
        r.assemblyWorkshops.map((w) => label('assembly_workshop', w)).join('/'),
        r.assembledQty,
        r.qtyPcs,
        r.inQty,
        r.productionOwed,
        r.deliveryDate ?? '',
        r.outQty,
        r.deliveryOwed,
        r.stockQty,
        r.overdue ? '逾期' : r.deliveryOwed <= 0 ? '已交清' : '跟进中',
      ]);
    });

    // 注：台账主行升到产品级后，一行就是一个产品，不再有「同产品多行需跨行合并」
    // 的情况，原先的相邻行合并逻辑已随之删除。

    // 汇总行：与页面顶部汇总卡同一口径（当前筛选的整体合计，不受分页影响）。
    // 按表头名定位而不是数手写的空串——列数会随「颜色」开关变化，位置写死必错位。
    const cells: Array<string | number> = new Array(columns.length).fill('');
    const put = (header: string, v: string | number) => {
      const i = columns.findIndex((c) => c.header === header);
      if (i >= 0) cells[i] = v;
    };
    cells[0] = '合计';
    put('客户', `${summary.rows} 行`);
    put('订单数(支)', summary.totalQty);
    put('成品入库', summary.totalIn);
    put('成品欠数', summary.totalProductionOwed);
    put('成品出货', summary.totalOut);
    put('发货欠数', summary.totalDeliveryOwed);
    put('库存数', summary.totalStock);
    const totalRow = ws.addRow(cells);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    });

    // 分隔符用半角，全角空格会被 eslint no-irregular-whitespace 拦下
    ws.getCell(`A${ws.rowCount + 2}`).value = `导出时间：${today} | 导出行数：${list.length}`;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * ===== 导出总计划（订单列表页，对齐 hb-mes 的「总计划」）=====
   *
   * 行粒度 = **订单产品行**（一行一个产品），与台账导出的部件组粒度互补：
   * 总计划给业务/PMC 看"这张单的这个产品做到哪了"，台账给车间看逐组明细。
   *
   * **四数不另写聚合 SQL**：直接调 findLedger 拿部件组行再按 orderProductId 汇总，
   * 与台账页、订单自动完结共用同一份口径（§5.6）。一个产品跨多个部件组时，
   * 组级字段（生产图号/版本/料厚/组类型）去重后用「/」并列。
   */
  async exportTotalPlan(query: QueryOrderDto): Promise<Buffer> {
    // 台账口径本就排除作废单；按作废筛选再导出只会得到空文件，不如直说
    if (query.status === ORDER_STATUS.CANCELLED) {
      throw new BadRequestException('已作废订单不纳入总计划，请改选其他状态后再导出');
    }

    const { list, total } = await this.findLedger({
      keyword: query.keyword,
      orderStatus: query.status,
      orderDateFrom: query.dateFrom,
      orderDateTo: query.dateTo,
      // 订单列表的业务员/跟单员筛选同样透传，保证「列表看到的」与「导出的」是同一批订单
      salesman: query.salesman,
      merchandiser: query.merchandiser,
      // 「更多」里的产品级条件同样透传：导出按产品行铺开，只导出满足条件的那些产品行
      customerDrawingNo: query.customerDrawingNo,
      drawingNo: query.drawingNo,
      productType: query.productType,
      railSection: query.railSection,
      surfaceType: query.surfaceType,
      deliveryFrom: query.deliveryFrom,
      deliveryTo: query.deliveryTo,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
    });
    if (!total) {
      throw new BadRequestException('当前筛选条件下没有订单数据，未生成导出文件');
    }
    if (total > EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `当前筛选结果 ${total} 个产品行，超过单次导出上限 ${EXPORT_MAX_ROWS}；` +
          '请先按关键字 / 状态 / 下单日期区间缩小范围再导出',
      );
    }

    // 1) findLedger 现在**直接返回产品级行**（2026-08-10 台账主行升级），
    //    原先「按 orderProductId 分桶再汇总四数」的整段逻辑随之删除——
    //    行本身就是产品级，组级字段（组类型/图号/版本/料厚）改从行内 partGroups 取，
    //    由 joinGroupField 按组序去重并列，与台账导出同一处理方式。
    const planRows = list;
    const productIds = planRows.map((r) => r.orderProductId);
    const extraRows: any[] = await this.dataSource.query(
      `SELECT p.id            AS productId,
              p.product_name  AS productName,
              p.customer_drawing_no AS customerDrawingNo,
              p.product_requirement AS productRequirement,
              p.sheet_material AS sheetMaterial,
              p.is_new_order  AS isNewOrder,
              p.remark        AS remark,
              o.po_no         AS poNo,
              o.status        AS orderStatus
         FROM t_order_product p
         JOIN t_order o ON o.id = p.order_id
        WHERE p.id IN (${productIds.map(() => '?').join(',')})`,
      productIds,
    );
    const extraMap = new Map<number, any>(
      extraRows.map((r) => [Number(r.productId), r]),
    );

    const dict = await loadDictLabels(this.dataSource, [
      'surface_type', 'assembly_workshop', 'product_type', 'rail_section', 'part_group_type',
    ]);
    const label = dictLabeler(dict);
    /** 多值（逗号串或数组）逐个转中文，用 / 并列 */
    const labels = (type: string, vs: string[] | string | null) => {
      const arr = Array.isArray(vs) ? vs : this.splitList(vs);
      return arr.map((v) => label(type, v)).filter(Boolean).join('/');
    };
    const unitLabel = (v: string | null) =>
      UNIT_OPTIONS.find((o) => o.value === v)?.label ?? (v ?? '');
    const statusText = (s: number) =>
      s === ORDER_STATUS.FINISHED ? '已完结' : s === ORDER_STATUS.CANCELLED ? '已作废' : '进行中';
    // 业务字段开关：停用的字段整列不输出（同台账导出）
    const {
      colorFieldEnabled: colorEnabled,
      customerDrawingNoEnabled: cdnEnabled,
      productRequirementEnabled: reqEnabled,
      inchToMm,
      dimensionViewUnit,
    } = await this.systemConfig.getFeatureFlags();
    // 规格列跟随「默认查看单位」（同台账导出口径）
    const dimHeader = dimensionViewUnit === DIMENSION_UNIT.INCH ? '规格(寸)' : '规格(mm)';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('总计划');
    const columns: Array<{ header: string; width: number }> = [
      { header: '下单日期', width: 12 },
      { header: '业务员', width: 10 },
      { header: '跟单员', width: 10 },
      { header: '客户', width: 20 },
      { header: '订单编号', width: 16 },
      { header: 'PO#', width: 14 },
      { header: '产品代码', width: 10 },
      { header: '产品编码', width: 14 },
      { header: '产品名称', width: 16 },
      ...(cdnEnabled ? [{ header: '客户图号', width: 14 }] : []),
      { header: '产品类型', width: 12 },
      { header: '产品类别', width: 10 },
      // 位置贴表单语义：节数（产品类别）之后、规格之前
      ...(reqEnabled ? [{ header: '产品要求描述', width: 20 }] : []),
      { header: '部件组', width: 12 },
      { header: dimHeader, width: 12 },
      { header: '订单数量', width: 10 },
      { header: '单位', width: 7 },
      { header: '订单数(支)', width: 11 },
      { header: '表面处理', width: 11 },
      ...(colorEnabled ? [{ header: '颜色', width: 10 }] : []),
      { header: '材质', width: 10 },
      { header: '生产图号', width: 16 },
      { header: '版本', width: 8 },
      { header: '料厚', width: 14 },
      { header: '外发已回货', width: 11 },
      { header: '装配车间', width: 12 },
      { header: '装配完成', width: 10 },
      { header: '成品入库', width: 10 },
      { header: '成品欠数', width: 10 },
      { header: '成品出货', width: 10 },
      { header: '发货欠数', width: 10 },
      { header: '库存数', width: 10 },
      { header: '订单交期', width: 12 },
      { header: '是否新单', width: 10 },
      { header: '出口国家', width: 12 },
      { header: '订单状态', width: 10 },
      { header: '交付情况', width: 10 },
      { header: '备注', width: 20 },
    ];
    ws.columns = columns.map((c) => ({ header: c.header, width: c.width }));
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.alignment = { vertical: 'middle', horizontal: 'center' };
    head.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FA' } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

    let sumQtyPcs = 0, sumIn = 0, sumOut = 0, sumStock = 0;
    planRows.forEach((r) => {
      // 行本身即产品级，产品/订单侧字段直接取 r（原先要从分桶的首行 first 取）
      const f = r;
      const ex = extraMap.get(f.orderProductId) ?? {};
      const productionOwed = r.qtyPcs - r.inQty;
      const deliveryOwed = r.qtyPcs - r.outQty;
      sumQtyPcs += r.qtyPcs;
      sumIn += r.inQty;
      sumOut += r.outQty;
      sumStock += r.stockQty;
      ws.addRow([
        f.orderDate ?? '',
        f.salesman ?? '',
        f.merchandiser ?? '',
        f.customerName ?? '',
        f.productionNo || f.orderNo || '',
        ex.poNo ?? '',
        sanitizeItemCode(f.itemNo),
        f.materialCode ?? '',
        ex.productName ?? '',
        ...(cdnEnabled ? [ex.customerDrawingNo ?? ''] : []),
        labels('product_type', f.productType),
        label('rail_section', f.railSection),
        ...(reqEnabled ? [ex.productRequirement ?? ''] : []),
        labels('part_group_type', r.partGroups.map((g) => g.groupType ?? '').filter(Boolean)),
        formatDimensionView(f.dimensionMm, dimensionViewUnit, inchToMm) || f.dimensionText || '',
        f.orderQty,
        unitLabel(f.unit),
        r.qtyPcs,
        label('surface_type', f.surfaceType),
        ...(colorEnabled ? [f.color ?? ''] : []),
        ex.sheetMaterial ?? '',
        joinGroupField(r, (g) => g.drawingNo),
        joinGroupField(r, (g) => g.drawingVersion),
        joinGroupField(r, (g) => g.materialThickness),
        r.returnedQty,
        labels('assembly_workshop', r.assemblyWorkshops),
        r.assembledQty,
        r.inQty,
        productionOwed,
        r.outQty,
        deliveryOwed,
        r.stockQty,
        f.deliveryDate ?? '',
        Number(ex.isNewOrder) === 1 ? '是' : '否',
        f.isExport ? (f.exportCountry ?? '出口') : '',
        statusText(Number(ex.orderStatus)),
        r.overdue ? '逾期' : deliveryOwed <= 0 ? '已交清' : '跟进中',
        ex.remark ?? '',
      ]);
    });

    // 汇总行：口径与上面逐行一致（合计四数）。按表头名定位而不是数手写的空串
    // ——列数会随「颜色」开关变化，位置写死必错位。
    const cells: Array<string | number> = new Array(columns.length).fill('');
    const put = (header: string, v: string | number) => {
      const i = columns.findIndex((c) => c.header === header);
      if (i >= 0) cells[i] = v;
    };
    cells[0] = '合计';
    put('客户', `${planRows.length} 个产品`);
    put('订单数(支)', sumQtyPcs);
    put('成品入库', sumIn);
    put('成品欠数', sumQtyPcs - sumIn);
    put('成品出货', sumOut);
    put('发货欠数', sumQtyPcs - sumOut);
    put('库存数', sumStock);
    const totalRow = ws.addRow(cells);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    });

    const today = new Date().toISOString().slice(0, 10);
    ws.getCell(`A${ws.rowCount + 2}`).value =
      `导出时间：${today} | 产品行数：${planRows.length} | 部件组行数：${list.length}`;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** GROUP_CONCAT 结果 → 去空字符串数组（无批次时 NULL，返回空数组） */
  private splitList(v: any): string[] {
    if (!v) return [];
    return String(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private dateText(v: any): string | null {
    if (!v) return null;
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(v).slice(0, 10);
  }
}
