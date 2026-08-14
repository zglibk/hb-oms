import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DIMENSION_UNIT,
  EXPORT_ROW_LIMIT,
  FINISHED_BIZ_TYPE_OPTIONS,
  FINISHED_DOC_STATUS,
  ORDER_STATUS,
  formatDimension,
  formatDimensionView,
  productLevelModel,
  railSectionLabel,
  sideLabel,
} from '@hb-oms/shared';
import { OrderLedgerService, joinGroupField } from './order-ledger.service';
import { QueryPeriodSummaryDto, QueryProductSummaryDto } from './dto/product-summary.dto';
// 单据族 SQL 与参数是全系统欠数/出入库口径的唯一事实源（§5.6），期间汇总同样复用
import {
  INBOUND_FAMILY_PARAMS,
  INBOUND_FAMILY_SQL,
  OUTBOUND_FAMILY_PARAMS,
  OUTBOUND_FAMILY_SQL,
} from './order-owed.util';
import { SystemConfigService } from '../system-config/system-config.service';
import { dictLabeler, loadDictLabels } from '../../common/utils/dict-label.util';
import { createWorkbook, labelOf, styleSheet } from '../../common/utils/excel.util';

/**
 * ===== 产品汇总查询（财务需求，2026-08-14）=====
 *
 * 台账是「订单视角」（一行 = 一张订单的一个产品行），本页是「**产品视角**」：
 * 跨订单把「相同产品」归并成一行。财务四条需求收敛于此——
 *   ① 不同订单相同产品汇总（主表本身）；② 入库/出库累计（主表两列 + 合计卡）；
 *   ③ 按客户查其所有产品（客户筛选）；④ 按产品反查客户（客户列 + 展开明细）。
 *
 * **「相同产品」= 六要素聚合键**（财务口径「型号、规格、厚度、颜色」的落地）：
 *   产品级型号（productLevelModel，分体行天然与整品分行）| 轨道节数（防脏数据补强）
 *   | 规格 mm 存储值 | 料厚签名（组级料厚按组序去重「/」并列）| 表面处理 | 颜色。
 * 各字段 trim 后按**字面值**聚合，刻意不做数值语义归一（「2.0」与「2」分成两行
 * 暴露的是录入不规范，正确动作是回订单修正）；聚合键**恒含颜色**，与显示开关无关
 * （开关是展示开关不是数据清理，§5.7——若历史有颜色值，关了开关仍按值分行）。
 *
 * **Tab1 累计口径复用 findLedger 在应用层二次聚合，不写第二份聚合 SQL**（§4.4）：
 * 台账口径（排除作废、完成数含期初、红字自然抵扣）自动继承，verify:ledger 校验
 * 过的口径覆盖本页，永远不会出现「台账 100、汇总 98」。
 *
 * **Tab2 期间口径（进销存）**：按**单据日期**切区间，
 *   期末结存 = 期初结存 + 期间入库 − 期间出库（同一份流水推算，天然勾稽）。
 * 跨期红字计入**红字发生期**（8 月冲 7 月的入库 → 8 月期间入库为负），财务标准处理；
 * 全量区间下期末合计 = 成品库存余额表合计（E2E 断言）。
 *
 * 呆滞品是独立台账（不挂订单），不进本页——别为「口径统一」把它接进来。
 */

/** Tab1 展开行：该产品的逐订单明细（需求③④的答案） */
export interface SummaryOrderRow {
  orderProductId: number;
  orderId: number;
  orderDate: string | null;
  /** 订单编号 = 生产单号（台账既有口径），无生产单号回落系统单号 */
  productionNo: string | null;
  orderNo: string | null;
  customerName: string | null;
  qtyPcs: number;
  inQty: number;
  outQty: number;
  stockQty: number;
  productionOwed: number;
  deliveryOwed: number;
  deliveryDate: string | null;
  overdue: boolean;
}

/** Tab1 聚合行：一行 = 一种「相同产品」 */
export interface ProductSummaryRow {
  /** 聚合键拼串（前端 row-key；同页不重复） */
  key: string;
  productModel: string;
  railSection: string | null;
  dimensionMm: number | null;
  /** 规格原文（取该组首个非空的录入展示值，规格未录时兜底显示） */
  dimensionText: string | null;
  /** 料厚签名（组级料厚按组序去重「/」并列，如「1.2/1.5」） */
  thickness: string;
  surfaceType: string | null;
  color: string | null;
  /** 下过单的客户（去重保序）——需求④不用展开就有答案 */
  customers: string[];
  /** 去重订单数 */
  orderCount: number;
  qtyPcs: number;
  inQty: number;
  outQty: number;
  stockQty: number;
  productionOwed: number;
  deliveryOwed: number;
  orders: SummaryOrderRow[];
}

/** Tab2 展开行：期间内逐笔已确认单据 */
export interface PeriodFlowRow {
  docNo: string | null;
  docDate: string | null;
  bizType: string | null;
  /** 1入 −1出（数量恒正，方向由此表达） */
  direction: number;
  quantity: number;
  side: string;
  /** 红字单被冲的原单号 */
  originDocNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  creatorName: string | null;
}

/** Tab2 聚合行：期初 → 期间入 → 期间出 → 期末 */
export interface PeriodSummaryRow {
  key: string;
  productModel: string;
  railSection: string | null;
  dimensionMm: number | null;
  dimensionText: string | null;
  thickness: string;
  surfaceType: string | null;
  color: string | null;
  customers: string[];
  opening: number;
  periodIn: number;
  periodOut: number;
  periodEnd: number;
  flows: PeriodFlowRow[];
}

@Injectable()
export class ProductSummaryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledgerService: OrderLedgerService,
    // 导出文件由服务端生成，颜色列显隐/规格单位要自己读一次开关
    private readonly systemConfig: SystemConfigService,
  ) {}

  /* ==================== Tab1 产品汇总（累计口径） ==================== */

  async findSummary(query: QueryProductSummaryDto) {
    // ⚠️ onlyOwed/onlyOverdue 绝不透传：findLedger 的 onlyOwed 是**订单行级**过滤，
    // 会把同产品下已交清的订单行剔掉，聚合出来的累计数直接失真（E2E 有回归用例）。
    // 本页的 onlyOwed 语义是「聚合行仍有欠数」，在聚合完成后过滤。
    const { list, total } = await this.ledgerService.findLedger({
      keyword: query.keyword,
      customerName: query.customerName,
      surfaceType: query.surfaceType,
      productType: query.productType,
      orderDateFrom: query.orderDateFrom,
      orderDateTo: query.orderDateTo,
      orderStatus: query.orderStatus,
      page: 1,
      pageSize: EXPORT_ROW_LIMIT,
    });
    if (total > EXPORT_ROW_LIMIT) {
      throw new BadRequestException(
        `当前筛选命中 ${total} 个订单产品行，超过单次汇总上限 ${EXPORT_ROW_LIMIT}；` +
          '请按客户 / 下单日期区间等条件缩小范围后再查询',
      );
    }

    // 六要素聚合：Σ四数、客户与订单去重、逐订单明细挂行
    const map = new Map<string, ProductSummaryRow & { orderIds: Set<number> }>();
    for (const r of list) {
      const thickness = joinGroupField(r, (g) => g.materialThickness);
      const key = [
        (r.productModel ?? '').trim(),
        (r.railSection ?? '').trim(),
        r.dimensionMm == null ? '' : String(r.dimensionMm),
        thickness,
        (r.surfaceType ?? '').trim(),
        (r.color ?? '').trim(),
      ].join('|');

      let row = map.get(key);
      if (!row) {
        row = {
          key,
          productModel: r.productModel ?? '',
          railSection: r.railSection ?? null,
          dimensionMm: r.dimensionMm,
          dimensionText: r.dimensionText,
          thickness,
          surfaceType: r.surfaceType ?? null,
          color: r.color ?? null,
          customers: [],
          orderCount: 0,
          qtyPcs: 0,
          inQty: 0,
          outQty: 0,
          stockQty: 0,
          productionOwed: 0,
          deliveryOwed: 0,
          orders: [],
          orderIds: new Set<number>(),
        };
        map.set(key, row);
      }
      row.qtyPcs += r.qtyPcs;
      row.inQty += r.inQty;
      row.outQty += r.outQty;
      row.stockQty += r.stockQty;
      if (!row.dimensionText && r.dimensionText) row.dimensionText = r.dimensionText;
      if (r.customerName && !row.customers.includes(r.customerName)) {
        row.customers.push(r.customerName);
      }
      row.orderIds.add(r.orderId);
      row.orders.push({
        orderProductId: r.orderProductId,
        orderId: r.orderId,
        orderDate: r.orderDate,
        productionNo: r.productionNo,
        orderNo: r.orderNo,
        customerName: r.customerName,
        qtyPcs: r.qtyPcs,
        inQty: r.inQty,
        outQty: r.outQty,
        stockQty: r.stockQty,
        productionOwed: r.productionOwed,
        deliveryOwed: r.deliveryOwed,
        deliveryDate: r.deliveryDate,
        overdue: r.overdue,
      });
    }

    let rows = [...map.values()].map((r) => {
      r.orderCount = r.orderIds.size;
      // 欠数 = Σ订单数 − Σ入库/出库（Σ差 = 差Σ，与台账逐行口径守恒）
      r.productionOwed = r.qtyPcs - r.inQty;
      r.deliveryOwed = r.qtyPcs - r.outQty;
      // 明细按 客户 + 下单日期 排（同客户的订单挨在一起，需求③④读起来顺）
      r.orders.sort(
        (a, b) =>
          (a.customerName ?? '').localeCompare(b.customerName ?? '', 'zh-Hans-CN') ||
          (a.orderDate ?? '').localeCompare(b.orderDate ?? ''),
      );
      const { orderIds: _drop, ...rest } = r;
      return rest as ProductSummaryRow;
    });

    if (query.onlyOwed) {
      rows = rows.filter((r) => r.productionOwed > 0 || r.deliveryOwed > 0);
    }
    if (query.onlyStocked) {
      rows = rows.filter((r) => r.stockQty > 0);
    }

    rows.sort(
      (a, b) =>
        a.productModel.localeCompare(b.productModel, 'zh-Hans-CN') ||
        (a.dimensionMm ?? Number.MAX_SAFE_INTEGER) - (b.dimensionMm ?? Number.MAX_SAFE_INTEGER) ||
        a.thickness.localeCompare(b.thickness, 'zh-Hans-CN'),
    );

    // 汇总卡：过滤后**全量**聚合行的合计（与台账「汇总卡=当前筛选合计」同语义，不受分页影响）
    const summary = rows.reduce(
      (s, r) => {
        s.totalQty += r.qtyPcs;
        s.totalIn += r.inQty;
        s.totalOut += r.outQty;
        s.totalStock += r.stockQty;
        return s;
      },
      { kinds: rows.length, totalQty: 0, totalIn: 0, totalOut: 0, totalStock: 0,
        totalProductionOwed: 0, totalDeliveryOwed: 0 },
    );
    summary.totalProductionOwed = summary.totalQty - summary.totalIn;
    summary.totalDeliveryOwed = summary.totalQty - summary.totalOut;

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return {
      list: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      summary,
    };
  }

  /* ==================== Tab2 出入库汇总（期间进销存） ==================== */

  async findPeriod(query: QueryPeriodSummaryDto) {
    const { from, to } = query;
    if (from > to) {
      throw new BadRequestException('开始日期不能晚于结束日期');
    }

    // 1) 按产品行聚合流水：期初 = from 之前**全部**已确认单据的净额（结存推移，
    //    不分族——direction×quantity 对四种单据天然给出正确的正负）；
    //    期间入/出按单据族拆分（红字随族抵扣，跨期红字计入红字发生期）。
    //    只扫 doc_date <= to 的单据；HAVING 滤掉「期初为 0 且期间无发生」的静默行。
    const flowRows: any[] = await this.dataSource.query(
      `SELECT fi.order_product_id AS pid,
              SUM(CASE WHEN fd.doc_date < ? THEN fd.direction * fi.quantity ELSE 0 END) AS openingQty,
              SUM(CASE WHEN fd.doc_date >= ? AND ${INBOUND_FAMILY_SQL}
                       THEN fd.direction * fi.quantity ELSE 0 END)  AS periodIn,
              SUM(CASE WHEN fd.doc_date >= ? AND ${OUTBOUND_FAMILY_SQL}
                       THEN -fd.direction * fi.quantity ELSE 0 END) AS periodOut,
              SUM(CASE WHEN fd.doc_date >= ? THEN 1 ELSE 0 END)     AS periodCnt
         FROM t_finished_item fi
         JOIN t_finished_doc  fd ON fd.id = fi.doc_id
         LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
        WHERE fd.status = ? AND fi.order_product_id > 0 AND fd.doc_date <= ?
        GROUP BY fi.order_product_id
       HAVING openingQty <> 0 OR periodCnt > 0`,
      [
        from,
        from,
        ...INBOUND_FAMILY_PARAMS,
        from,
        ...OUTBOUND_FAMILY_PARAMS,
        from,
        FINISHED_DOC_STATUS.CONFIRMED,
        to,
      ],
    );

    const emptyResult = (page: number, pageSize: number) => ({
      list: [] as PeriodSummaryRow[],
      total: 0,
      page,
      pageSize,
      summary: { kinds: 0, totalOpening: 0, totalIn: 0, totalOut: 0, totalEnd: 0 },
    });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    if (!flowRows.length) return emptyResult(page, pageSize);

    const flowByPid = new Map<number, { opening: number; periodIn: number; periodOut: number }>(
      flowRows.map((r) => [
        Number(r.pid),
        {
          opening: Number(r.openingQty) || 0,
          periodIn: Number(r.periodIn) || 0,
          periodOut: Number(r.periodOut) || 0,
        },
      ]),
    );
    const pids = [...flowByPid.keys()];

    // 2) 产品行信息（订单侧筛选也在这一步落地：被筛掉的产品行连带其流水不进结果）
    const prodWhere: string[] = [
      `p.id IN (${pids.map(() => '?').join(',')})`,
      'o.status <> ?',
    ];
    const prodParams: Array<string | number> = [...pids, ORDER_STATUS.CANCELLED];
    if (query.customerName) {
      prodWhere.push('o.customer_name = ?');
      prodParams.push(query.customerName);
    }
    if (query.surfaceType) {
      prodWhere.push('p.surface_type = ?');
      prodParams.push(query.surfaceType);
    }
    if (query.keyword) {
      prodWhere.push(`(p.item_no LIKE ? OR o.production_no LIKE ? OR o.order_no LIKE ?
                       OR o.customer_name LIKE ?
                       OR EXISTS (SELECT 1 FROM t_order_part_group g2
                                   WHERE g2.order_product_id = p.id AND g2.product_model LIKE ?))`);
      const kw = `%${query.keyword}%`;
      prodParams.push(kw, kw, kw, kw, kw);
    }
    const prodRows: any[] = await this.dataSource.query(
      `SELECT p.id AS pid, p.item_no AS itemNo, p.product_type AS productType,
              p.rail_section AS railSection, p.is_split AS isSplit,
              p.dimension_mm AS dimensionMm, p.dimension_raw AS dimensionRaw,
              p.dimension_unit AS dimensionUnit,
              p.surface_type AS surfaceType, p.color AS color,
              o.customer_name AS customerName, o.production_no AS productionNo,
              o.order_no AS orderNo
         FROM t_order_product p
         JOIN t_order o ON o.id = p.order_id
        WHERE ${prodWhere.join(' AND ')}`,
      prodParams,
    );
    if (!prodRows.length) return emptyResult(page, pageSize);

    // 3) 部件组（型号分体后缀 + 料厚签名都要用；ORDER BY 保证签名与订单表单同序）
    const hitPids = prodRows.map((r) => Number(r.pid));
    const groupRows: any[] = await this.dataSource.query(
      `SELECT g.order_product_id AS pid, g.group_type AS groupType,
              g.material_thickness AS materialThickness
         FROM t_order_part_group g
        WHERE g.order_product_id IN (${hitPids.map(() => '?').join(',')})
        ORDER BY g.sort ASC, g.id ASC`,
      hitPids,
    );
    const groupsByPid = new Map<number, Array<{ groupType: string | null; materialThickness: string | null }>>();
    groupRows.forEach((g) => {
      const pid = Number(g.pid);
      const arr = groupsByPid.get(pid) ?? [];
      arr.push({ groupType: g.groupType ?? null, materialThickness: g.materialThickness ?? null });
      groupsByPid.set(pid, arr);
    });

    // 4) 按六要素聚合键归并（与 Tab1 同一套键）
    interface ProdInfo {
      customerName: string | null;
      productionNo: string | null;
      orderNo: string | null;
    }
    const prodInfoByPid = new Map<number, ProdInfo>();
    const map = new Map<string, PeriodSummaryRow & { pids: number[] }>();
    for (const p of prodRows) {
      const pid = Number(p.pid);
      const flow = flowByPid.get(pid);
      if (!flow) continue;
      prodInfoByPid.set(pid, {
        customerName: p.customerName ?? null,
        productionNo: p.productionNo ?? null,
        orderNo: p.orderNo ?? null,
      });

      const groups = groupsByPid.get(pid) ?? [];
      // 产品级型号唯一拼法（§5.2）：整品「滑轨」后缀，分体行按组构成推导
      const model = productLevelModel(
        p.itemNo ?? '',
        p.productType ?? '',
        Number(p.isSplit) || 0,
        groups.map((g) => g.groupType),
        p.railSection ?? null,
      );
      const thickness = joinGroupField({ partGroups: groups }, (g) => g.materialThickness);
      const dimensionMm = p.dimensionMm == null ? null : Number(p.dimensionMm);
      const key = [
        model.trim(),
        (p.railSection ?? '').trim(),
        dimensionMm == null ? '' : String(dimensionMm),
        thickness,
        (p.surfaceType ?? '').trim(),
        (p.color ?? '').trim(),
      ].join('|');

      let row = map.get(key);
      if (!row) {
        row = {
          key,
          productModel: model,
          railSection: p.railSection ?? null,
          dimensionMm,
          dimensionText: formatDimension(p.dimensionRaw, p.dimensionUnit, p.dimensionMm) || null,
          thickness,
          surfaceType: p.surfaceType ?? null,
          color: p.color ?? null,
          customers: [],
          opening: 0,
          periodIn: 0,
          periodOut: 0,
          periodEnd: 0,
          flows: [],
          pids: [],
        };
        map.set(key, row);
      }
      row.opening += flow.opening;
      row.periodIn += flow.periodIn;
      row.periodOut += flow.periodOut;
      if (p.customerName && !row.customers.includes(p.customerName)) {
        row.customers.push(p.customerName);
      }
      row.pids.push(pid);
    }

    const allRows = [...map.values()];
    allRows.forEach((r) => {
      // 期末 = 期初 + 期间入 − 期间出（同一份流水推算，天然勾稽；不另查余额表）
      r.periodEnd = r.opening + r.periodIn - r.periodOut;
    });
    allRows.sort(
      (a, b) =>
        a.productModel.localeCompare(b.productModel, 'zh-Hans-CN') ||
        (a.dimensionMm ?? Number.MAX_SAFE_INTEGER) - (b.dimensionMm ?? Number.MAX_SAFE_INTEGER) ||
        a.thickness.localeCompare(b.thickness, 'zh-Hans-CN'),
    );

    const summary = allRows.reduce(
      (s, r) => {
        s.totalOpening += r.opening;
        s.totalIn += r.periodIn;
        s.totalOut += r.periodOut;
        s.totalEnd += r.periodEnd;
        return s;
      },
      { kinds: allRows.length, totalOpening: 0, totalIn: 0, totalOut: 0, totalEnd: 0 },
    );

    const paged = allRows.slice((page - 1) * pageSize, page * pageSize);

    // 5) 当前页聚合行挂期间内逐笔流水（展开行）；导出全量时同样走这里
    const pagePids = paged.flatMap((r) => r.pids);
    if (pagePids.length) {
      const detailRows: any[] = await this.dataSource.query(
        `SELECT fi.order_product_id AS pid, fd.doc_no AS docNo, fd.doc_date AS docDate,
                fd.biz_type AS bizType, fd.direction AS direction, fi.quantity AS quantity,
                fi.side AS side, fo.doc_no AS originDocNo, fd.creator_name AS creatorName
           FROM t_finished_item fi
           JOIN t_finished_doc  fd ON fd.id = fi.doc_id
           LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
          WHERE fi.order_product_id IN (${pagePids.map(() => '?').join(',')})
            AND fd.status = ? AND fd.doc_date >= ? AND fd.doc_date <= ?
          ORDER BY fd.doc_date ASC, fd.id ASC`,
        [...pagePids, FINISHED_DOC_STATUS.CONFIRMED, from, to],
      );
      const rowByPid = new Map<number, PeriodSummaryRow & { pids: number[] }>();
      paged.forEach((r) => r.pids.forEach((pid) => rowByPid.set(pid, r)));
      detailRows.forEach((d) => {
        const pid = Number(d.pid);
        const row = rowByPid.get(pid);
        if (!row) return;
        const info = prodInfoByPid.get(pid);
        row.flows.push({
          docNo: d.docNo ?? null,
          docDate: this.dateText(d.docDate),
          bizType: d.bizType ?? null,
          direction: Number(d.direction) || 0,
          quantity: Number(d.quantity) || 0,
          side: d.side ?? '',
          originDocNo: d.originDocNo ?? null,
          customerName: info?.customerName ?? null,
          productionNo: info?.productionNo || info?.orderNo || null,
          creatorName: d.creatorName ?? null,
        });
      });
    }

    return {
      list: paged.map(({ pids: _drop, ...rest }) => rest as PeriodSummaryRow),
      total: allRows.length,
      page,
      pageSize,
      summary,
    };
  }

  /* ==================== 导出（装配记录导出的双 Sheet 模式） ==================== */

  /** Tab1 导出：Sheet1 产品汇总 + Sheet2 订单明细 */
  async exportSummary(query: QueryProductSummaryDto): Promise<Buffer> {
    // 台账行上限 5000 已在 findSummary 内拦截，聚合行数 ≤ 台账行数，无需再限
    const { list, summary } = await this.findSummary({
      ...query,
      page: 1,
      pageSize: EXPORT_ROW_LIMIT,
    });
    if (!list.length) {
      throw new BadRequestException('当前筛选条件下没有汇总数据，未生成导出文件');
    }

    const label = dictLabeler(await loadDictLabels(this.dataSource, ['surface_type']));
    const { colorEnabled, dimHeader, dimCell } = await this.exportContext();

    const wb = createWorkbook();

    /* ---------- Sheet1：产品汇总（一行 = 一种相同产品） ---------- */
    const ws = wb.addWorksheet('产品汇总');
    const columns: Array<{ header: string }> = [
      // 首列序号：车间手工表的习惯格式，打印出来逐行核对要念行号
      { header: '序号' },
      { header: '产品型号' },
      { header: dimHeader },
      { header: '节数' },
      { header: '料厚' },
      { header: '表面处理' },
      ...(colorEnabled ? [{ header: '颜色' }] : []),
      { header: '客户' },
      { header: '订单数' },
      { header: '订单总数(支)' },
      { header: '累计入库' },
      { header: '成品欠数' },
      { header: '累计出库' },
      { header: '发货欠数' },
      { header: '库存数' },
    ];
    ws.columns = columns.map((c) => ({ header: c.header }));
    list.forEach((r, i) => {
      ws.addRow([
        i + 1,
        r.productModel,
        dimCell(r),
        railSectionLabel(r.railSection),
        r.thickness,
        label('surface_type', r.surfaceType),
        ...(colorEnabled ? [r.color ?? ''] : []),
        r.customers.join('、'),
        r.orderCount,
        r.qtyPcs,
        r.inQty,
        r.productionOwed,
        r.outQty,
        r.deliveryOwed,
        r.stockQty,
      ]);
    });
    // 合计行按表头名定位——列数随「颜色」开关变化，位置写死必错位（§5.7）
    const cells: Array<string | number> = new Array(columns.length).fill('');
    const put = (header: string, v: string | number) => {
      const i = columns.findIndex((c) => c.header === header);
      if (i >= 0) cells[i] = v;
    };
    cells[0] = '合计';
    put('客户', `${summary.kinds} 款产品`);
    put('订单总数(支)', summary.totalQty);
    put('累计入库', summary.totalIn);
    put('成品欠数', summary.totalProductionOwed);
    put('累计出库', summary.totalOut);
    put('发货欠数', summary.totalDeliveryOwed);
    put('库存数', summary.totalStock);
    ws.addRow(cells).font = { bold: true };
    styleSheet(ws, {
      centerColumns: this.centerCols(columns, [
        '序号', dimHeader, '节数', '料厚', '表面处理', '颜色', '订单数',
        '订单总数(支)', '累计入库', '成品欠数', '累计出库', '发货欠数', '库存数',
      ]),
    });

    /* ---------- Sheet2：订单明细（聚合键列前置，便于筛选对应） ---------- */
    const wsB = wb.addWorksheet('订单明细');
    const colsB: Array<{ header: string }> = [
      { header: '序号' },
      { header: '产品型号' },
      { header: dimHeader },
      { header: '料厚' },
      { header: '表面处理' },
      ...(colorEnabled ? [{ header: '颜色' }] : []),
      { header: '下单日期' },
      { header: '订单编号' },
      { header: '客户' },
      { header: '订单数(支)' },
      { header: '累计入库' },
      { header: '累计出库' },
      { header: '库存数' },
      { header: '成品欠数' },
      { header: '发货欠数' },
      { header: '交期' },
      { header: '状态' },
    ];
    wsB.columns = colsB.map((c) => ({ header: c.header }));
    let seqB = 0;
    list.forEach((r) => {
      r.orders.forEach((o) => {
        seqB += 1;
        wsB.addRow([
          seqB,
          r.productModel,
          dimCell(r),
          r.thickness,
          label('surface_type', r.surfaceType),
          ...(colorEnabled ? [r.color ?? ''] : []),
          o.orderDate ?? '',
          o.productionNo || o.orderNo || '',
          o.customerName ?? '',
          o.qtyPcs,
          o.inQty,
          o.outQty,
          o.stockQty,
          o.productionOwed,
          o.deliveryOwed,
          o.deliveryDate ?? '',
          o.overdue ? '逾期' : o.deliveryOwed <= 0 ? '已交清' : '跟进中',
        ]);
      });
    });
    styleSheet(wsB, {
      centerColumns: this.centerCols(colsB, [
        '序号', dimHeader, '料厚', '表面处理', '颜色', '下单日期', '订单数(支)',
        '累计入库', '累计出库', '库存数', '成品欠数', '发货欠数', '交期', '状态',
      ]),
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Tab2 导出：Sheet1 出入库汇总 + Sheet2 出入库明细 */
  async exportPeriod(query: QueryPeriodSummaryDto): Promise<Buffer> {
    const { list, total, summary } = await this.findPeriod({
      ...query,
      page: 1,
      pageSize: EXPORT_ROW_LIMIT,
    });
    if (!list.length) {
      throw new BadRequestException('所选期间内没有出入库数据，未生成导出文件');
    }
    if (total > EXPORT_ROW_LIMIT) {
      throw new BadRequestException(
        `当前期间命中 ${total} 款产品，超过单次导出上限 ${EXPORT_ROW_LIMIT}；` +
          '请按客户 / 关键字等条件缩小范围后再导出',
      );
    }

    const label = dictLabeler(await loadDictLabels(this.dataSource, ['surface_type']));
    const { colorEnabled, dimHeader, dimCell } = await this.exportContext();

    const wb = createWorkbook();

    /* ---------- Sheet1：出入库汇总（期初 → 期间入 → 期间出 → 期末） ---------- */
    const ws = wb.addWorksheet('出入库汇总');
    const columns: Array<{ header: string }> = [
      { header: '序号' },
      { header: '产品型号' },
      { header: dimHeader },
      { header: '节数' },
      { header: '料厚' },
      { header: '表面处理' },
      ...(colorEnabled ? [{ header: '颜色' }] : []),
      { header: '客户' },
      { header: '期初结存' },
      { header: '期间入库' },
      { header: '期间出库' },
      { header: '期末结存' },
    ];
    ws.columns = columns.map((c) => ({ header: c.header }));
    list.forEach((r, i) => {
      ws.addRow([
        i + 1,
        r.productModel,
        dimCell(r),
        railSectionLabel(r.railSection),
        r.thickness,
        label('surface_type', r.surfaceType),
        ...(colorEnabled ? [r.color ?? ''] : []),
        r.customers.join('、'),
        r.opening,
        r.periodIn,
        r.periodOut,
        r.periodEnd,
      ]);
    });
    const cells: Array<string | number> = new Array(columns.length).fill('');
    const put = (header: string, v: string | number) => {
      const i = columns.findIndex((c) => c.header === header);
      if (i >= 0) cells[i] = v;
    };
    cells[0] = '合计';
    put('客户', `${summary.kinds} 款产品`);
    put('期初结存', summary.totalOpening);
    put('期间入库', summary.totalIn);
    put('期间出库', summary.totalOut);
    put('期末结存', summary.totalEnd);
    ws.addRow(cells).font = { bold: true };
    styleSheet(ws, {
      centerColumns: this.centerCols(columns, [
        '序号', dimHeader, '节数', '料厚', '表面处理', '颜色',
        '期初结存', '期间入库', '期间出库', '期末结存',
      ]),
    });

    /* ---------- Sheet2：出入库明细（期间内逐笔已确认单据） ---------- */
    const wsB = wb.addWorksheet('出入库明细');
    const colsB: Array<{ header: string }> = [
      { header: '序号' },
      { header: '产品型号' },
      { header: dimHeader },
      { header: '单据号' },
      { header: '单据日期' },
      { header: '业务类型' },
      { header: '方向' },
      { header: '数量(支)' },
      { header: '边别' },
      { header: '客户' },
      { header: '订单编号' },
      { header: '被冲原单' },
      { header: '登记人' },
    ];
    wsB.columns = colsB.map((c) => ({ header: c.header }));
    let seqB = 0;
    list.forEach((r) => {
      r.flows.forEach((f) => {
        seqB += 1;
        wsB.addRow([
          seqB,
          r.productModel,
          dimCell(r),
          f.docNo ?? '',
          f.docDate ?? '',
          labelOf(FINISHED_BIZ_TYPE_OPTIONS, f.bizType),
          f.direction > 0 ? '入' : '出',
          f.quantity,
          sideLabel(f.side),
          f.customerName ?? '',
          f.productionNo ?? '',
          f.originDocNo ?? '',
          f.creatorName ?? '',
        ]);
      });
    });
    styleSheet(wsB, {
      centerColumns: this.centerCols(colsB, [
        '序号', dimHeader, '单据日期', '业务类型', '方向', '数量(支)', '边别', '登记人',
      ]),
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** 导出共用的开关上下文：颜色列显隐 + 规格列表头/取值（随系统配置的默认查看单位） */
  private async exportContext() {
    const { colorFieldEnabled, inchToMm, dimensionViewUnit } =
      await this.systemConfig.getFeatureFlags();
    const dimHeader = dimensionViewUnit === DIMENSION_UNIT.INCH ? '规格(寸)' : '规格(mm)';
    const dimCell = (r: { dimensionMm: number | null; dimensionText: string | null }) =>
      formatDimensionView(r.dimensionMm, dimensionViewUnit, inchToMm) || r.dimensionText || '';
    return { colorEnabled: colorFieldEnabled, dimHeader, dimCell };
  }

  /** 按表头名点名居中列（1 基列号）——列号会随「颜色」开关伸缩，不能写死 */
  private centerCols(columns: Array<{ header: string }>, names: string[]): number[] {
    return columns
      .map((c, i) => (names.includes(c.header) ? i + 1 : 0))
      .filter((i) => i > 0);
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
