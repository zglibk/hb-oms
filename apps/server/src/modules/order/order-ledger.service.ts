import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  FINISHED_DOC_STATUS,
  ORDER_STATUS,
  OUTSOURCE_STATUS,
  formatDimension,
  hasSocket,
  UNIT_OPTIONS,
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

/**
 * ===== 订单跟踪台账：本系统的核心产出（设计文档 §5.1）=====
 *
 * 按**部件组**一行（对齐车间手工《订单跟踪表台账》的行粒度），围绕订单逐行呈现四个数：
 *   订单数 / 完成数 / 库存数 / 双欠数（生产欠数、发货欠数）
 *
 * **全部实时聚合，不落任何冗余列**（§4.2）——冗余列一旦与单据不同步就是对账灾难，
 * 这里宁可每次算。红字单方向与原单相反，聚合时按 `direction × quantity` 求和即自然抵扣。
 *
 * ⚠️ 与入库闸门的口径差异（**故意不同，勿"统一"**）：
 *   - 台账「完成数」**包含期初**（opening_balance）——期初是上线前已完成的存量，
 *     业务上确实"已完成"，不计进去台账就对不上手工账；
 *   - 闸门「已入库量」**排除期初**（assembly-quota.util.ts）——期初没有装配过程，
 *     计进去会让该组额度永久为负、挡死后续正常入库。
 *   两者服务于不同问题，各自正确。
 */

/**
 * 单次导出行数上限。超过就拒绝——静默截断出去的表用户不会知道少了行，
 * 拿去对账比不给更糟。
 */
const EXPORT_MAX_ROWS = 5000;

export interface LedgerRow {
  orderPartGroupId: number;
  orderId: number;
  orderProductId: number;
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
  productModel: string | null;
  productType: string | null;
  groupType: string | null;
  railSection: string | null;
  dimensionMm: number | null;
  dimensionText: string | null;
  /** 订单数量与单位（原始录入口径，展示用） */
  orderQty: number;
  unit: string | null;
  surfaceType: string | null;
  color: string | null;
  drawingNo: string | null;
  drawingVersion: string | null;
  materialThickness: string | null;
  /** 该部件组各装配批次的车间（去重）；车间已下沉批次级，一组多批可分在不同车间 */
  assemblyWorkshops: string[];
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
  /** 生产欠数 = 订单数 − 完成数，可为负（超产） */
  productionOwed: number;
  /** 发货欠数 = 订单数 − 出库数，可为负（超发）；手工表「成品结存」即此口径 */
  deliveryOwed: number;
  /** 外发已回货数量 */
  returnedQty: number;
  /** 装配完成量（actual_date 非空的批次合计） */
  assembledQty: number;
  /** 装配未完成量 = 订单数 − 装配完成量，可为负（超装配） */
  assemblyPendingQty: number;
  /** 最早未完成装配批次的计划完成日 */
  nextAssemblyPlanDate: string | null;
  /** 是否逾期：交期已过且仍欠发货 */
  overdue: boolean;
}

@Injectable()
export class OrderLedgerService {
  constructor(private readonly dataSource: DataSource) {}

  async findLedger(query: QueryLedgerDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: string[] = ['o.status <> ?'];
    const params: Array<string | number> = [ORDER_STATUS.CANCELLED];

    if (query.keyword) {
      where.push(`(o.order_no LIKE ? OR o.customer_name LIKE ? OR o.production_no LIKE ?
                   OR g.product_model LIKE ? OR p.item_no LIKE ? OR p.material_code LIKE ?)`);
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw, kw, kw, kw);
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
                           WHERE b.order_part_group_id = g.id AND b.workshop = ?)`);
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

    // 聚合派生表放在 JOIN 里，筛选条件才能引用其列
    const fromSql = `
        FROM t_order_part_group g
        JOIN t_order_product p ON p.id = g.order_product_id
        JOIN t_order o         ON o.id = g.order_id
        LEFT JOIN (
              SELECT fi.order_part_group_id AS gid,
                     SUM(CASE WHEN ${INBOUND_FAMILY_SQL}  THEN fd.direction * fi.quantity ELSE 0 END) AS in_qty,
                     SUM(CASE WHEN ${OUTBOUND_FAMILY_SQL} THEN -fd.direction * fi.quantity ELSE 0 END) AS out_qty
                FROM t_finished_item fi
                JOIN t_finished_doc  fd ON fd.id = fi.doc_id
                LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
               WHERE fd.status = ? AND fi.order_part_group_id > 0
               GROUP BY fi.order_part_group_id
             ) fin ON fin.gid = g.id
        LEFT JOIN (
              SELECT order_part_group_id AS gid, SUM(quantity) AS qty
                FROM t_finished_balance
               WHERE order_part_group_id > 0
               GROUP BY order_part_group_id
             ) bal ON bal.gid = g.id
        LEFT JOIN (
              SELECT oi.order_part_group_id AS gid, SUM(orr.return_qty) AS return_qty
                FROM t_outsource_return orr
                JOIN t_outsource_item oi ON oi.id = orr.item_id
                JOIN t_outsource_doc od ON od.id = oi.doc_id
               WHERE od.status <> ?
               GROUP BY oi.order_part_group_id
             ) ret ON ret.gid = g.id
        LEFT JOIN (
              SELECT order_part_group_id AS gid,
                     SUM(CASE WHEN actual_date IS NOT NULL THEN qty ELSE 0 END) AS done_qty,
                     MIN(CASE WHEN actual_date IS NULL THEN plan_date END)      AS next_plan_date,
                     -- 装配车间已下沉批次级，一组多批可分在不同车间，聚合成去重列表展示
                     GROUP_CONCAT(DISTINCT NULLIF(workshop, '') ORDER BY workshop SEPARATOR ',') AS workshops
                FROM t_assembly_batch
               GROUP BY order_part_group_id
             ) asm ON asm.gid = g.id
       WHERE ${where.join(' AND ')}`;

    // 派生表参数在 WHERE 参数之前（SQL 里 JOIN 先于 WHERE 出现）
    const joinParams: Array<string | number> = [
      ...INBOUND_FAMILY_PARAMS,
      ...OUTBOUND_FAMILY_PARAMS,
      FINISHED_DOC_STATUS.CONFIRMED,
      // 外发：已作废单不计回货
      OUTSOURCE_STATUS.CANCELLED,
    ];

    // 只看有欠数 / 只看逾期：依赖聚合结果，放 HAVING 之后的外层条件里
    const having: string[] = [];
    if (query.onlyOwed) {
      having.push(
        '(g.qty_pcs - IFNULL(fin.in_qty, 0) > 0 OR g.qty_pcs - IFNULL(fin.out_qty, 0) > 0)',
      );
    }
    if (query.onlyOverdue) {
      having.push('(p.delivery_date IS NOT NULL AND p.delivery_date < CURDATE() AND g.qty_pcs - IFNULL(fin.out_qty, 0) > 0)');
    }
    const havingSql = having.length ? ` AND ${having.join(' AND ')}` : '';

    const allParams = [...joinParams, ...params];

    const countRows: Array<{ cnt: number | string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt ${fromSql}${havingSql}`,
      allParams,
    );
    const total = Number(countRows?.[0]?.cnt ?? 0);

    const rows: any[] = await this.dataSource.query(
      `SELECT g.id AS groupId, g.order_id AS orderId, g.order_product_id AS orderProductId,
              g.group_type AS groupType, g.product_model AS productModel, g.qty_pcs AS qtyPcs,
              g.drawing_no AS drawingNo, g.drawing_version AS drawingVersion,
              g.material_thickness AS materialThickness,
              o.order_no AS orderNo, o.order_date AS orderDate, o.customer_name AS customerName,
              o.salesman AS salesman, o.merchandiser AS merchandiser,
              o.production_no AS productionNo, p.material_code AS materialCode, p.item_no AS itemNo,
              p.product_type AS productType, p.rail_section AS railSection,
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
       ORDER BY (p.delivery_date IS NULL), p.delivery_date ASC, g.id DESC
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
        orderPartGroupId: Number(r.groupId),
        orderId: Number(r.orderId),
        orderProductId: Number(r.orderProductId),
        orderDate: this.dateText(r.orderDate),
        salesman: r.salesman ?? null,
        merchandiser: r.merchandiser ?? null,
        customerName: r.customerName ?? null,
        productionNo: r.productionNo ?? null,
        orderNo: r.orderNo ?? null,
        materialCode: r.materialCode ?? null,
        itemNo: r.itemNo ?? null,
        productModel: r.productModel ?? null,
        productType: r.productType ?? null,
        groupType: r.groupType ?? null,
        railSection: r.railSection ?? null,
        dimensionMm: r.dimensionMm == null ? null : Number(r.dimensionMm),
        dimensionText: formatDimension(r.dimensionRaw, r.dimensionUnit, r.dimensionMm) || null,
        orderQty: Number(r.orderQty) || 0,
        unit: r.unit ?? null,
        surfaceType: r.surfaceType ?? null,
        color: r.color ?? null,
        drawingNo: r.drawingNo ?? null,
        drawingVersion: r.drawingVersion ?? null,
        materialThickness: r.materialThickness ?? null,
        assemblyWorkshops: this.splitList(r.workshops),
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
        assembledQty,
        assemblyPendingQty: qtyPcs - assembledQty,
        nextAssemblyPlanDate: this.dateText(r.nextAssemblyPlanDate),
        overdue: !!deliveryDate && deliveryDate < today && deliveryOwed > 0,
      };
    });

    // 汇总卡：当前筛选结果的整体口径（不受分页影响，故单独聚合）
    const sumRows: any[] = await this.dataSource.query(
      // 注意：rows 是 MySQL 8 保留字（窗口函数），列别名必须避开
      `SELECT COUNT(*) AS rowCnt,
              SUM(g.qty_pcs) AS totalQty,
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
   * 台账行内展开明细（设计文档 §5.1）：该部件组的三条流水。
   *
   * 只读、按需加载——台账一页 15~100 行，若随列表一起返回，三张流水表要多查三遍
   * 全量数据，而用户实际只会展开其中一两行。故独立接口，展开时才查。
   *
   * 口径与台账主表保持一致：
   *   - 成品流水只取**已确认**单据（草稿/已作废不算数，与四数聚合同口径）；
   *   - 外发流水排除已作废发坯单（与台账「外发已回货」列同口径）；
   *   - 装配批次全取，用 actual_date 是否为空区分计划中/已完成。
   */
  async findRowDetail(orderPartGroupId: number) {
    const [finished, outsource, assembly] = await Promise.all([
      this.dataSource.query(
        `SELECT fd.doc_no AS docNo, fd.biz_type AS bizType, fd.direction AS direction,
                fd.doc_date AS docDate, fi.side AS side, fi.quantity AS quantity,
                fd.creator_name AS creatorName, fi.remark AS remark,
                fo.doc_no AS originDocNo
           FROM t_finished_item fi
           JOIN t_finished_doc fd ON fd.id = fi.doc_id
           LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
          WHERE fi.order_part_group_id = ? AND fd.status = ?
          ORDER BY fd.doc_date ASC, fd.id ASC`,
        [orderPartGroupId, FINISHED_DOC_STATUS.CONFIRMED],
      ),
      this.dataSource.query(
        `SELECT od.blank_no AS blankNo, od.processor_name AS processorName,
                od.surface_type AS surfaceType, od.color AS color, od.status AS status,
                od.actual_send_date AS sendDate, od.require_back_date AS requireBackDate,
                oi.send_weight AS sendWeight, oi.unit_weight AS unitWeight,
                oi.send_qty AS sendQty, oi.returned_qty AS returnedQty
           FROM t_outsource_item oi
           JOIN t_outsource_doc od ON od.id = oi.doc_id
          WHERE oi.order_part_group_id = ? AND od.status <> ?
          ORDER BY od.id ASC`,
        [orderPartGroupId, OUTSOURCE_STATUS.CANCELLED],
      ),
      this.dataSource.query(
        `SELECT id, side, workshop, plan_start_date AS planStartDate, plan_date AS planDate,
                actual_date AS actualDate, qty, remark, creator_name AS creatorName
           FROM t_assembly_batch
          WHERE order_part_group_id = ?
          ORDER BY id ASC`,
        [orderPartGroupId],
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
        blankNo: r.blankNo ?? null,
        processorName: r.processorName ?? null,
        surfaceType: r.surfaceType ?? null,
        color: r.color ?? null,
        status: Number(r.status) || 0,
        sendDate: this.dateText(r.sendDate),
        requireBackDate: this.dateText(r.requireBackDate),
        sendWeight: Number(r.sendWeight) || 0,
        unitWeight: Number(r.unitWeight) || 0,
        sendQty: Number(r.sendQty) || 0,
        returnedQty: Number(r.returnedQty) || 0,
        pendingQty: (Number(r.sendQty) || 0) - (Number(r.returnedQty) || 0),
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
    const dict = await this.loadDictLabels(['surface_type', 'assembly_workshop']);
    const label = (type: string, v: string | null) =>
      v ? (dict.get(`${type}:${v}`) ?? v) : '';
    const unitLabel = (v: string | null) =>
      UNIT_OPTIONS.find((o) => o.value === v)?.label ?? (v ?? '');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('订单跟踪台账');

    const columns: Array<{ header: string; width: number; productLevel?: boolean }> = [
      { header: '下单日期', width: 12, productLevel: true },
      { header: '业务员', width: 10, productLevel: true },
      { header: '跟单员', width: 10, productLevel: true },
      { header: '客户', width: 20, productLevel: true },
      { header: '订单编号', width: 16, productLevel: true },
      { header: '产品编码', width: 14, productLevel: true },
      { header: '产品型号', width: 22 },
      { header: '规格', width: 12, productLevel: true },
      { header: '订单数量', width: 10, productLevel: true },
      { header: '单位', width: 7, productLevel: true },
      { header: '表面处理', width: 11, productLevel: true },
      { header: '颜色', width: 10, productLevel: true },
      { header: '生产图号', width: 16 },
      { header: '版本', width: 8 },
      { header: '料厚', width: 14 },
      { header: '外发已回货', width: 11 },
      { header: '装配车间', width: 12 },
      { header: '装配完成', width: 10 },
      { header: '订单数(支)', width: 11 },
      { header: '成品入库', width: 10 },
      { header: '生产欠数', width: 10 },
      { header: '订单交期', width: 12, productLevel: true },
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
        r.dimensionText ?? '',
        r.orderQty,
        unitLabel(r.unit),
        label('surface_type', r.surfaceType),
        r.color ?? '',
        r.drawingNo ?? '',
        r.drawingVersion ?? '',
        r.materialThickness ?? '',
        r.returnedQty,
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

    // 产品级列跨行合并：与台账页同一规则——只合并**相邻**的同产品行，
    // 同产品的组万一没挨着就各自成行，绝不把中间夹着的别的产品并进来
    const productCols = columns
      .map((c, i) => (c.productLevel ? i + 1 : 0))
      .filter(Boolean);
    let i = 0;
    while (i < list.length) {
      let j = i;
      while (j + 1 < list.length && list[j + 1].orderProductId === list[i].orderProductId) j++;
      if (j > i) {
        const from = i + 2; // +1 表头、+1 转成 1-based
        const to = j + 2;
        productCols.forEach((col) => ws.mergeCells(from, col, to, col));
      }
      i = j + 1;
    }

    // 汇总行：与页面顶部汇总卡同一口径（当前筛选的整体合计，不受分页影响）
    const totalRow = ws.addRow([
      '合计', '', '', `${summary.rows} 行`, '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      summary.totalQty,
      summary.totalIn,
      summary.totalProductionOwed,
      '',
      summary.totalOut,
      summary.totalDeliveryOwed,
      summary.totalStock,
      '',
    ]);
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
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
    });
    if (!total) {
      throw new BadRequestException('当前筛选条件下没有订单数据，未生成导出文件');
    }
    if (total > EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `当前筛选结果 ${total} 个部件组，超过单次导出上限 ${EXPORT_MAX_ROWS}；` +
          '请先按关键字 / 状态 / 下单日期区间缩小范围再导出',
      );
    }

    // 1) 按产品行汇总（保持 findLedger 的排序：交期升序）
    interface PlanRow {
      first: LedgerRow;
      groupTypes: string[];
      drawingNos: string[];
      drawingVersions: string[];
      thicknesses: string[];
      qtyPcs: number;
      inQty: number;
      outQty: number;
      stockQty: number;
      returnedQty: number;
      assembledQty: number;
      workshops: string[];
      overdue: boolean;
    }
    // 先按产品分桶（Map 保留首次出现顺序 = findLedger 的交期排序）
    const groupsByProduct = new Map<number, LedgerRow[]>();
    for (const r of list) {
      const arr = groupsByProduct.get(r.orderProductId) ?? [];
      arr.push(r);
      groupsByProduct.set(r.orderProductId, arr);
    }
    const pushUniq = (arr: string[], v: string | null) => {
      if (v && !arr.includes(v)) arr.push(v);
    };
    const planRows: PlanRow[] = [];
    for (const groups of groupsByProduct.values()) {
      // 组级字段并列时按**组序正序**（台账排序是 g.id DESC，直接拼会得到
      // 「内轨/外中轨」这种与订单表单相反的顺序，看表的人要多想一步）
      const ordered = [...groups].sort((a, b) => a.orderPartGroupId - b.orderPartGroupId);
      const row: PlanRow = {
        first: ordered[0],
        groupTypes: [], drawingNos: [], drawingVersions: [], thicknesses: [],
        qtyPcs: 0, inQty: 0, outQty: 0, stockQty: 0, returnedQty: 0, assembledQty: 0,
        workshops: [], overdue: false,
      };
      for (const r of ordered) {
        pushUniq(row.groupTypes, r.groupType);
        pushUniq(row.drawingNos, r.drawingNo);
        pushUniq(row.drawingVersions, r.drawingVersion);
        pushUniq(row.thicknesses, r.materialThickness);
        r.assemblyWorkshops.forEach((w) => pushUniq(row.workshops, w));
        row.qtyPcs += r.qtyPcs;
        row.inQty += r.inQty;
        row.outQty += r.outQty;
        row.stockQty += r.stockQty;
        row.returnedQty += r.returnedQty;
        row.assembledQty += r.assembledQty;
        row.overdue = row.overdue || r.overdue;
      }
      planRows.push(row);
    }

    // 2) 台账行不含的产品/订单侧列，单独平选一次（纯取列，无聚合，不涉口径）
    const productIds = [...groupsByProduct.keys()];
    const extraRows: any[] = await this.dataSource.query(
      `SELECT p.id            AS productId,
              p.product_name  AS productName,
              p.customer_drawing_no AS customerDrawingNo,
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

    const dict = await this.loadDictLabels([
      'surface_type', 'assembly_workshop', 'product_type', 'rail_section', 'part_group_type',
    ]);
    const label = (type: string, v: string | null) =>
      v ? (dict.get(`${type}:${v}`) ?? v) : '';
    /** 多值（逗号串或数组）逐个转中文，用 / 并列 */
    const labels = (type: string, vs: string[] | string | null) => {
      const arr = Array.isArray(vs) ? vs : this.splitList(vs);
      return arr.map((v) => label(type, v)).filter(Boolean).join('/');
    };
    const unitLabel = (v: string | null) =>
      UNIT_OPTIONS.find((o) => o.value === v)?.label ?? (v ?? '');
    const statusText = (s: number) =>
      s === ORDER_STATUS.FINISHED ? '已完结' : s === ORDER_STATUS.CANCELLED ? '已作废' : '进行中';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('总计划');
    const columns: Array<{ header: string; width: number }> = [
      { header: '下单日期', width: 12 },
      { header: '业务员', width: 10 },
      { header: '跟单员', width: 10 },
      { header: '客户', width: 20 },
      { header: '订单编号', width: 16 },
      { header: 'PO#', width: 14 },
      { header: '货号', width: 10 },
      { header: '产品编码', width: 14 },
      { header: '产品名称', width: 16 },
      { header: '客户图号', width: 14 },
      { header: '产品类型', width: 12 },
      { header: '产品类别', width: 10 },
      { header: '部件组', width: 12 },
      { header: '规格', width: 12 },
      { header: '订单数量', width: 10 },
      { header: '单位', width: 7 },
      { header: '订单数(支)', width: 11 },
      { header: '表面处理', width: 11 },
      { header: '颜色', width: 10 },
      { header: '材质', width: 10 },
      { header: '生产图号', width: 16 },
      { header: '版本', width: 8 },
      { header: '料厚', width: 14 },
      { header: '外发已回货', width: 11 },
      { header: '装配车间', width: 12 },
      { header: '装配完成', width: 10 },
      { header: '成品入库', width: 10 },
      { header: '生产欠数', width: 10 },
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
      const f = r.first;
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
        f.itemNo ?? '',
        f.materialCode ?? '',
        ex.productName ?? '',
        ex.customerDrawingNo ?? '',
        labels('product_type', f.productType),
        label('rail_section', f.railSection),
        labels('part_group_type', r.groupTypes),
        f.dimensionText ?? '',
        f.orderQty,
        unitLabel(f.unit),
        r.qtyPcs,
        label('surface_type', f.surfaceType),
        f.color ?? '',
        ex.sheetMaterial ?? '',
        r.drawingNos.join('/'),
        r.drawingVersions.join('/'),
        r.thicknesses.join('/'),
        r.returnedQty,
        labels('assembly_workshop', r.workshops),
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

    // 汇总行：口径与上面逐行一致（合计四数），列位对齐
    const totalRow = ws.addRow([
      '合计', '', '', `${planRows.length} 个产品`, '', '', '', '', '', '', '', '', '', '', '', '',
      sumQtyPcs,
      '', '', '', '', '', '', '', '', '',
      sumIn,
      sumQtyPcs - sumIn,
      sumOut,
      sumQtyPcs - sumOut,
      sumStock,
      '', '', '', '', '', '',
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    });

    const today = new Date().toISOString().slice(0, 10);
    ws.getCell(`A${ws.rowCount + 2}`).value =
      `导出时间：${today} | 产品行数：${planRows.length} | 部件组行数：${list.length}`;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** 字典值 → 中文标签，键为 `${dictType}:${dictValue}`（只取启用项） */
  private async loadDictLabels(types: string[]): Promise<Map<string, string>> {
    const rows: any[] = await this.dataSource.query(
      `SELECT dict_type, dict_value, dict_label FROM t_dict
        WHERE dict_type IN (${types.map(() => '?').join(',')}) AND status = 1`,
      types,
    );
    return new Map(rows.map((r) => [`${r.dict_type}:${r.dict_value}`, r.dict_label]));
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
