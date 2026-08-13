import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  FINISHED_BIZ_TYPE,
  FINISHED_DOC_STATUS,
  ORDER_STATUS,
  SIDE_OPTIONS,
  STOCK_DIRECTION,
  hasSocket,
  isValidSide,
  sideLabel,
} from '@hb-oms/shared';
import { FinishedDoc } from './entities/finished-doc.entity';
import { FinishedItem } from './entities/finished-item.entity';
import { FinishedBalance } from './entities/finished-balance.entity';
import {
  CreateFinishedDocDto,
  QueryBalanceDto,
  QueryFinishedDocDto,
  QueryStockGroupOptionDto,
  ReverseFinishedDocDto,
  UpdateFinishedDocDto,
} from './dto/finished-stock.dto';
import { loadInboundQuota, quotaKey } from '../assembly/assembly-quota.util';
import { syncOrderFinishState } from '../order/order-owed.util';
// 仅取类型：期初入参形状定义在 opening 模块，此处 import type 编译后即擦除，无运行时耦合
import type { OpeningFinishedDto } from '../opening/dto/opening.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import {
  ProductSnapshot,
  ProductSnapshotService,
} from '../../common/services/product-snapshot.service';
import { NumberGeneratorService } from '../../common/services/number-generator.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { dictLabeler, loadDictLabels } from '../../common/utils/dict-label.util';
import {
  EXPORT_ROW_LIMIT,
  addTipsSheet,
  cellString,
  createWorkbook,
  importRejected,
  loadFirstSheet,
  styleSheet,
} from '../../common/utils/excel.util';

/** 单据类型 → 采番前缀（设计文档 §4.7：期初走 FGO 序列） */
function prefixOf(bizType: string): string {
  if (bizType === FINISHED_BIZ_TYPE.INBOUND) return 'FGI';
  if (bizType === FINISHED_BIZ_TYPE.REVERSAL) return 'FGR';
  return 'FGO';
}

/** 单据类型 → 方向：只有销售出库是出向，期初与生产入库都是入向 */
function directionOf(bizType: string): number {
  return bizType === FINISHED_BIZ_TYPE.SALE_OUTBOUND ? STOCK_DIRECTION.OUT : STOCK_DIRECTION.IN;
}

@Injectable()
export class FinishedStockService {
  constructor(
    @InjectRepository(FinishedDoc) private readonly docRepo: Repository<FinishedDoc>,
    @InjectRepository(FinishedItem) private readonly itemRepo: Repository<FinishedItem>,
    @InjectRepository(FinishedBalance) private readonly balanceRepo: Repository<FinishedBalance>,
    private readonly dataSource: DataSource,
    // 成品锚产品行，故读产品级快照（部件组级快照留给外发用）
    private readonly productSnapshot: ProductSnapshotService,
    private readonly numberGenerator: NumberGeneratorService,
    // 「颜色」是可停用的业务字段（§5.7），导出列随开关增减；导出文件由服务端生成，
    // 前端的列显隐管不到，故这里也要读一次开关
    private readonly systemConfig: SystemConfigService,
  ) {}

  /* ==================== 查询 ==================== */

  async findList(query: QueryFinishedDocDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.docRepo.createQueryBuilder('d');
    if (query.bizType) qb.andWhere('d.bizType = :bt', { bt: query.bizType });
    if (query.direction != null) qb.andWhere('d.direction = :dir', { dir: query.direction });
    if (query.status != null) qb.andWhere('d.status = :st', { st: query.status });
    if (query.dateFrom) qb.andWhere('d.docDate >= :df', { df: query.dateFrom });
    if (query.dateTo) qb.andWhere('d.docDate <= :dt', { dt: query.dateTo });
    if (query.keyword) {
      qb.andWhere(
        `(d.docNo LIKE :kw
          OR d.id IN (SELECT i.doc_id FROM t_finished_item i
                       WHERE i.order_no LIKE :kw OR i.customer_name LIKE :kw
                          OR i.production_no LIKE :kw OR i.product_model LIKE :kw))`,
        { kw: `%${query.keyword}%` },
      );
    }
    qb.orderBy('d.id', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [docs, total] = await qb.getManyAndCount();

    const docIds = docs.map((d) => d.id);
    const items = docIds.length
      ? await this.itemRepo.find({ where: { docId: In(docIds) }, order: { sort: 'ASC', id: 'ASC' } })
      : [];
    const byDoc = new Map<number, FinishedItem[]>();
    items.forEach((it) => {
      const arr = byDoc.get(it.docId) ?? [];
      arr.push(it);
      byDoc.set(it.docId, arr);
    });

    return {
      list: docs.map((d) => {
        const its = byDoc.get(d.id) ?? [];
        return Object.assign(d, {
          items: its,
          itemCount: its.length,
          totalQty: its.reduce((s, it) => s + (it.quantity || 0), 0),
        });
      }),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: number) {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('单据不存在');
    const items = await this.itemRepo.find({ where: { docId: id }, order: { sort: 'ASC', id: 'ASC' } });
    // 已被红字冲销的数量（按原明细行聚合），供界面显示可再冲销余量
    const reversed = await this.loadReversedQty(items.map((it) => it.id));
    return Object.assign(doc, {
      items: items.map((it) =>
        Object.assign(it, {
          reversedQty: reversed.get(it.id) ?? 0,
          reversibleQty: Math.max((it.quantity || 0) - (reversed.get(it.id) ?? 0), 0),
        }),
      ),
      totalQty: items.reduce((s, it) => s + (it.quantity || 0), 0),
    });
  }

  /** 成品库存（只读结存查询）：余额行 + 订单侧展示信息 */
  async findBalance(query: QueryBalanceDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: string[] = ['1 = 1'];
    const params: Array<string | number> = [];

    // 默认只看有结存；零结存行是历史痕迹，日常不看
    if (query.onlyInStock !== false) where.push('b.quantity <> 0');
    if (query.orderProductId) {
      where.push('b.order_product_id = ?');
      params.push(query.orderProductId);
    }
    if (query.side != null) {
      where.push('b.side = ?');
      params.push(query.side);
    }
    if (query.surfaceType) {
      where.push('b.surface_type = ?');
      params.push(query.surfaceType);
    }
    if (query.keyword) {
      where.push(`(b.item_no LIKE ? OR b.product_model LIKE ?
                   OR o.order_no LIKE ? OR o.customer_name LIKE ? OR o.production_no LIKE ?)`);
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw, kw, kw);
    }

    const fromSql = `
        FROM t_finished_balance b
        LEFT JOIN t_order o         ON o.id = b.order_id
        LEFT JOIN t_order_product p ON p.id = b.order_product_id
       WHERE ${where.join(' AND ')}`;

    const countRows: Array<{ cnt: number | string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt ${fromSql}`,
      params,
    );
    const rows: any[] = await this.dataSource.query(
      `SELECT b.*, o.order_no AS orderNo, o.customer_name AS customerName,
              o.production_no AS productionNo
       ${fromSql}
       ORDER BY b.item_no ASC, b.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    return {
      list: rows.map((r) => ({
        id: Number(r.id),
        orderId: Number(r.order_id),
        orderProductId: Number(r.order_product_id),
        orderNo: r.orderNo ?? null,
        customerName: r.customerName ?? null,
        productionNo: r.productionNo ?? null,
        itemNo: r.item_no,
        productModel: r.product_model,
        productType: r.product_type,
        groupType: r.group_type,
        railSection: r.rail_section,
        dimensionMm: Number(r.dimension_mm) || 0,
        dimensionText: r.dimension_text,
        surfaceType: r.surface_type,
        color: r.color,
        side: r.side,
        batchNo: r.batch_no,
        quantity: Number(r.quantity) || 0,
      })),
      total: Number(countRows?.[0]?.cnt ?? 0),
      page,
      pageSize,
    };
  }

  /**
   * 可出入库的**产品行**选项（2026-08-10 由部件组升级——入库对象是装配产出的整套滑轨）：
   * - 入库（inbound）附「可入库量」= Σ已完成装配 − Σ已入库（§4.4 闸门口径）；
   * - 出库（sale_outbound）附当前结存，供选行时看清能发多少。
   */
  async findGroupOptions(query: QueryStockGroupOptionDto) {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
    const params: Array<string | number> = [ORDER_STATUS.CANCELLED];
    let where = ' WHERE o.status <> ?';
    // 期初录入页传 onlyOpening=true：期初只能挂「期初补录」订单，
    // 挂正常订单等于绕过装配闸门凭空加库存（服务端另有硬校验，见 buildOpeningItems）
    if (query.onlyOpening) where += ' AND o.is_opening = 1';
    if (query.keyword) {
      where += ` AND (o.order_no LIKE ? OR o.customer_name LIKE ? OR o.production_no LIKE ?
                      OR p.item_no LIKE ? OR p.material_code LIKE ?)`;
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw, kw, kw);
    }
    params.push(limit);

    const rows: any[] = await this.dataSource.query(
      `SELECT p.id AS productId, p.order_id AS orderId, p.qty_pcs AS qtyPcs,
              o.order_no AS orderNo, o.customer_name AS customerName,
              o.production_no AS productionNo, p.item_no AS itemNo, p.product_type AS productType,
              p.rail_section AS railSection, p.dimension_raw AS dimensionRaw,
              p.dimension_unit AS dimensionUnit, p.dimension_mm AS dimensionMm,
              p.surface_type AS surfaceType, p.color AS color
         FROM t_order_product p
         JOIN t_order o ON o.id = p.order_id
         ${where}
        ORDER BY p.id DESC
        LIMIT ?`,
      params,
    );
    if (!rows.length) return [];

    const productIds = rows.map((r) => Number(r.productId));
    const snaps = await this.productSnapshot.load(null, productIds);

    // 每个产品按其卡口口径展开 side，附额度/结存
    const keys: Array<{ orderProductId: number; side: string }> = [];
    rows.forEach((r) => {
      const socket = hasSocket(r.productType);
      (socket ? ['left', 'right'] : ['']).forEach((side) =>
        keys.push({ orderProductId: Number(r.productId), side }),
      );
    });
    const quota = await loadInboundQuota(this.dataSource.manager, keys);
    const balances = await this.loadBalanceMap(this.dataSource.manager, keys);

    return rows.map((r) => {
      const pid = Number(r.productId);
      const socket = hasSocket(r.productType);
      const sides = (socket ? ['left', 'right'] : ['']).map((side) => {
        const q = quota.get(quotaKey(pid, side));
        return {
          side,
          sideLabel: sideLabel(side),
          assembledQty: q?.assembledQty ?? 0,
          inboundQty: q?.inboundQty ?? 0,
          /** 可入库量（入库时的硬上限） */
          quota: q?.quota ?? 0,
          /** 当前结存（出库时的硬上限） */
          stockQty: balances.get(quotaKey(pid, side))?.quantity ?? 0,
        };
      });
      const snap = snaps.get(pid);
      return {
        orderProductId: pid,
        orderId: Number(r.orderId),
        orderNo: r.orderNo ?? null,
        customerName: r.customerName ?? null,
        productionNo: r.productionNo ?? null,
        itemNo: r.itemNo ?? null,
        productModel: snap?.productModel ?? null,
        productName: snap?.productName ?? null,
        productType: r.productType ?? null,
        dimensionText: snap?.dimensionText ?? null,
        surfaceType: r.surfaceType ?? null,
        color: r.color ?? null,
        qtyPcs: Number(r.qtyPcs) || 0,
        socket,
        sides,
      };
    });
  }

  /* ==================== 成品库存导入 / 导出 ==================== */

  /**
   * 导出当前筛选的成品库存（结存）。
   *
   * **直接复用 `findBalance`，不为导出另写聚合 SQL**——两份 SQL 迟早分叉，
   * 届时「页面 100、导出 98」最难查（同台账导出口径，§9-2e）。
   */
  async exportBalance(query: QueryBalanceDto): Promise<Buffer> {
    const all = await this.findBalance({ ...query, page: 1, pageSize: EXPORT_ROW_LIMIT + 1 });
    // 空结果一律拒绝，不给一张只有表头的空表——拿去对账最危险（§4.3）
    if (!all.list.length) {
      throw new BadRequestException('当前筛选条件下没有库存数据可导出，请调整筛选条件后重试');
    }
    if (all.list.length > EXPORT_ROW_LIMIT) {
      throw new BadRequestException(
        `当前筛选结果 ${all.total} 行，超过单次导出上限 ${EXPORT_ROW_LIMIT} 行，请缩小筛选范围后重试`,
      );
    }

    const { colorFieldEnabled } = await this.systemConfig.getFeatureFlags();
    const label = dictLabeler(await loadDictLabels(this.dataSource, ['surface_type']));

    type Row = (typeof all.list)[number];
    // 列序对齐页面，便于与屏幕上的表并排核对
    const columns: Array<{ header: string; pick: (r: Row) => string | number; center?: boolean }> = [
      { header: '货号', pick: (r) => r.itemNo || '', center: true },
      { header: '产品型号', pick: (r) => r.productModel || '' },
      { header: '规格', pick: (r) => r.dimensionText || '', center: true },
      { header: '表面处理', pick: (r) => label('surface_type', r.surfaceType), center: true },
      // 「颜色」停用时整列不输出——页面也不显示，导出留一列空值只是噪音（§5.7）
      ...(colorFieldEnabled
        ? [{ header: '颜色', pick: (r: Row) => r.color || '', center: true }]
        : []),
      { header: '边别', pick: (r) => sideLabel(r.side), center: true },
      { header: '订单号', pick: (r) => r.orderNo || '' },
      { header: '生产单号', pick: (r) => r.productionNo || '' },
      { header: '客户', pick: (r) => r.customerName || '' },
      { header: '批次', pick: (r) => r.batchNo || '', center: true },
      { header: '结存(支)', pick: (r) => r.quantity, center: true },
    ];

    const wb = createWorkbook();
    const ws = wb.addWorksheet('成品库存');
    ws.columns = columns.map((c) => ({ header: c.header }));
    all.list.forEach((r) => ws.addRow(columns.map((c) => c.pick(r))));

    // 汇总行**按表头名定位**：颜色列随开关增减，位置写死必错位（§5.7）
    const totalRow: Array<string | number> = new Array(columns.length).fill('');
    const put = (header: string, v: string | number) => {
      const i = columns.findIndex((c) => c.header === header);
      if (i >= 0) totalRow[i] = v;
    };
    put('货号', '合计');
    put('结存(支)', all.list.reduce((s, r) => s + (r.quantity || 0), 0));
    ws.addRow(totalRow);

    // styleSheet 必须在写完所有数据行之后调用——自动列宽要量全部单元格
    styleSheet(ws, {
      centerColumns: columns.map((c, i) => (c.center ? i + 1 : 0)).filter(Boolean),
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * 成品库存导入模板：**预填所有可录期初的产品行**，只留「期初数量」空着让人填。
   *
   * 之所以不是一张空表：库存行锚定 `(订单产品行, 边别)`，让人手抄订单号 + 型号再由
   * 服务端反查，同订单同货号多行时根本分不清是哪一行；预填的「产品行ID」是唯一可靠的
   * 定位键。上线搬账时对着手工账逐行填数量即可，也不必再回系统查订单号。
   */
  async buildBalanceImportTemplate(): Promise<Buffer> {
    // 与期初录入页的「添加产品」选择器同源：期初只能挂「期初补录」订单
    const options = await this.findGroupOptions({ onlyOpening: true, limit: 500 });

    const wb = createWorkbook();
    const ws = wb.addWorksheet('成品库存导入');
    ws.columns = [
      { header: '产品行ID*' },
      { header: '订单号' },
      { header: '客户' },
      { header: '生产单号' },
      { header: '产品型号' },
      { header: '规格' },
      { header: '边别' },
      { header: '订单数(支)' },
      { header: '期初数量*' },
      { header: '批次' },
      { header: '备注' },
    ];
    options.forEach((o: any) => {
      // 含卡口的产品按左右分行——库存本就分边别记账
      (o.sides ?? []).forEach((s: any) => {
        ws.addRow([
          o.orderProductId,
          o.orderNo || '',
          o.customerName || '',
          o.productionNo || '',
          o.productModel || '',
          o.dimensionText || '',
          sideLabel(s.side),
          o.qtyPcs || 0,
          '', // 期初数量：留空由人填
          '',
          '',
        ]);
      });
    });
    styleSheet(ws, { centerColumns: [1, 6, 7, 8, 9, 10] });

    addTipsSheet(wb, [
      ['这张表是做什么的', '把**上线前手工账上的成品库存**批量搬进系统。表里已按「期初补录」订单预填好可录的产品行，你只需要在**期初数量**列填数——没有库存的行留空或删掉即可。'],
      ['产品行ID', '**必填，请勿修改**。它是系统定位库存挂在哪个订单产品上的唯一依据，改了就会导错订单。若要新增系统里没有的行，请先到「订单管理」补录订单并打开「期初补录」开关，再重新下载模板。'],
      ['订单号', '**核对用，请勿修改**。导入时会与产品行ID 反查出的订单号比对，对不上直接报错——这样即使 ID 列被误改（比如排序时只排了一列），也不会静默导到别的订单上。'],
      ['期初数量', '必填，**大于 0 的整数**，单位是**支**（1 套 = 2 支）。留空的行会被跳过，不会导入。'],
      ['边别', '含卡口的产品已按 左 / 右 拆成两行，请分别填数量；不含卡口的行边别是空的，**不要自己填**。'],
      ['批次', '选填。同一产品行 + 边别下按批次分开记账；不分批次就留空。同一份文件里「产品行ID + 边别 + 批次」不能重复，重复请自行合并数量。'],
      ['导入会产生什么', '生成**一张 FGO 期初单并立即生效**，库存随之增加。这张单在「物料管理 → 成品出入库」里可查、录错可**红字冲销**——库存不会被凭空改写，每一笔都有据可查。'],
      ['为什么只能挂「期初补录」订单', '期初**豁免装配闸门**（上线前的存量没有装配过程）。若允许挂到正常订单上，就等于绕过「已装配 − 已入库」凭空加库存。正常订单的成品请走「成品出入库 → 成品入库」，先完成装配再入库。'],
      ['导入规则', '整批校验通过才写入；任一行有问题会列出逐行原因并**整批回滚**，不会导入一半。修正后重新上传即可，不会重复计数。'],
    ]);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * 批量导入成品库存。
   *
   * ⚠️ **不直接写 `t_finished_balance`**（§5.6 核心不变式：确认是唯一驱动余额的入口）。
   * 导入的行汇成一张 FGO 期初单，走 `createOpeningBalance` 由单据驱动余额——
   * 库存有单可查、录错可红字冲销。直写余额表会让库存与单据流水对不上，
   * 而余额表本身没有审计字段，届时谁也说不清那个数是怎么来的。
   *
   * 校验分两段：这里**逐行收集**全部问题一次性回给用户（Excel 导入的错通常是成片的，
   * 一次报一条要来回十几趟）；`buildOpeningItems` 的服务端硬校验仍然生效，是兜底。
   */
  async importBalanceFromExcel(
    buffer: Buffer,
    opts: { docDate?: string; remark?: string },
    user: CurrentUserPayload,
  ) {
    const ws = await loadFirstSheet(buffer);
    const sideByLabel = new Map(SIDE_OPTIONS.map((o) => [o.label, o.value]));

    /** 先把表读成结构化行，产品行ID 汇总后一次性查快照 */
    const raw: Array<{
      rowNo: number;
      productId: number;
      orderNoText: string;
      sideText: string;
      batchNo: string;
      qtyText: string;
      remark: string;
    }> = [];
    const errors: string[] = [];

    ws.eachRow((row, idx) => {
      if (idx === 1) return; // 表头
      const [idText, orderNoText, , , , , sideText, , qtyText, batchNo, remark] =
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((c) => cellString(row.getCell(c)));

      // 模板是预填的：没填数量的行就是「这行没库存」，跳过而不是报错
      if (!qtyText) return;
      if (!idText && !orderNoText) return;

      const at = `第 ${idx} 行`;
      const productId = Number(idText);
      if (!idText) {
        errors.push(`${at}：产品行ID 必填（请勿删除模板的第一列）`);
        return;
      }
      if (!Number.isInteger(productId) || productId <= 0) {
        errors.push(`${at}：产品行ID「${idText}」不是有效的编号，请勿修改该列`);
        return;
      }
      raw.push({ rowNo: idx, productId, orderNoText, sideText, batchNo, qtyText, remark });
    });

    if (!raw.length && !errors.length) {
      throw new BadRequestException(
        'Excel 中没有填了「期初数量」的行。请在模板的「期初数量」列填上数量后再导入',
      );
    }

    const snapshots = await this.productSnapshot.load(
      null,
      raw.map((r) => r.productId),
      { includeCancelledOrder: false },
    );

    const seen = new Map<string, number>();
    const items: Array<{
      orderProductId: number;
      side: string;
      batchNo: string;
      quantity: number;
      remark?: string;
    }> = [];

    for (const r of raw) {
      const at = `第 ${r.rowNo} 行`;
      const rowErrors: string[] = [];
      const snap = snapshots.get(r.productId);

      if (!snap) {
        errors.push(`${at}：产品行ID ${r.productId} 不存在或所属订单已作废，请重新下载模板`);
        continue;
      }
      // 订单号交叉核对：ID 列被误改（如只对一列排序）时不至于静默导到别的订单上
      if (r.orderNoText && snap.orderNo && r.orderNoText !== snap.orderNo) {
        errors.push(
          `${at}：订单号「${r.orderNoText}」与产品行ID ${r.productId} 实际所属的订单`
            + `「${snap.orderNo}」不一致，请重新下载模板，不要改动前两列`,
        );
        continue;
      }
      if (snap.orderIsOpening !== 1) {
        errors.push(
          `${at}：订单「${snap.orderNo ?? ''}」不是期初补录单，不能录期初。`
            + '正常订单的成品请走「成品出入库 → 成品入库」（需先完成装配）；'
            + '若这确实是上线前的历史订单，请到订单管理把它的「期初补录」开关打开',
        );
        continue;
      }

      // 边别：含卡口必须分左右，不含卡口必须留空（与建单同一口径）
      let side = '';
      if (r.sideText) {
        const hit = sideByLabel.get(r.sideText)
          ?? (SIDE_OPTIONS.some((o) => o.value === r.sideText) ? r.sideText : undefined);
        if (!hit) rowErrors.push(`边别「${r.sideText}」无效，只能是 左 / 右`);
        else side = hit;
      }
      const socket = hasSocket(snap.productType);
      if (!rowErrors.length && !isValidSide(side, socket)) {
        rowErrors.push(
          socket
            ? `产品「${snap.productModel ?? ''}」含卡口，必须按 左 / 右 分行填写`
            : `产品「${snap.productModel ?? ''}」不含卡口，边别必须留空`,
        );
      }

      const quantity = Number(r.qtyText);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        rowErrors.push(`期初数量「${r.qtyText}」必须是大于 0 的整数`);
      }

      const key = `p${r.productId}#${side}#${r.batchNo}`;
      const dup = seen.get(key);
      if (dup) {
        rowErrors.push(
          `与第 ${dup} 行重复（同一产品行 + 边别 + 批次），请合并成一行填写`,
        );
      }

      if (rowErrors.length) {
        errors.push(`${at}：${rowErrors.join('；')}`);
        continue;
      }
      seen.set(key, r.rowNo);
      items.push({
        orderProductId: r.productId,
        side,
        batchNo: r.batchNo,
        quantity,
        remark: r.remark || undefined,
      });
    }

    if (errors.length) throw importRejected(errors, raw.length);
    if (!items.length) throw new BadRequestException('Excel 中没有可导入的数据行');

    // 汇成一张期初单：整批一个事务，全有全无（部分成功后用户改完重提会重复加库存）
    const res = await this.createOpeningBalance(
      {
        docDate: opts.docDate || new Date().toISOString().slice(0, 10),
        remark: opts.remark || '成品库存批量导入',
        items,
      } as OpeningFinishedDto,
      user,
    );
    return { total: items.length, ...res };
  }

  /* ==================== 建单 / 编辑 ==================== */

  /** 建草稿单；单号事务内采番，明细快照由服务端读取落库 */
  async create(dto: CreateFinishedDocDto, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const docNo = await this.numberGenerator.generate(prefixOf(dto.bizType), mgr);
      const doc = await mgr.getRepository(FinishedDoc).save(
        mgr.getRepository(FinishedDoc).create({
          docNo,
          bizType: dto.bizType,
          direction: directionOf(dto.bizType),
          docDate: dto.docDate,
          workTeam: dto.workTeam ?? null,
          // 机台号已停用录入（2026-08-13）：新单恒空，历史列保留
          machineNo: null,
          originDocId: null,
          status: FINISHED_DOC_STATUS.DRAFT,
          remark: dto.remark ?? null,
          ...auditOnCreate(user),
        }),
      );
      await this.writeItems(mgr, doc.id, dto.items);
      return { id: doc.id, docNo };
    });
  }

  /**
   * 成品期初录入（设计文档 §4.8，供 opening 模块调用——§6 要求「内部走 finished-stock 通道」）。
   *
   * 与普通建单的差异：**建单后同事务立即确认并驱动余额**，不留草稿。
   * 期初录入页本身就是"确认"的语义，让用户录完再去出入库列表点一次确认纯属多余；
   * 单据仍在成品出入库列表可见、可红字冲销纠错，追溯性与纠错路径都没丢。
   *
   * 明细**必须挂订单产品行**（2026-08-11）：已完结订单剩下的成品改由
   * 「物料管理 → 呆滞品管理」承载，不再走这条通道。
   *
   * 期初豁免装配闸门（§4.5——期初是上线前存量，没有装配过程），但结存不得为负的
   * 通用约束仍然生效（期初是入向，正常不会触发）。
   */
  async createOpeningBalance(dto: OpeningFinishedDto, user: CurrentUserPayload) {
    if (!dto.items?.length) throw new BadRequestException('至少需要一条期初明细');
    return this.dataSource.transaction(async (mgr) => {
      const docNo = await this.numberGenerator.generate(
        prefixOf(FINISHED_BIZ_TYPE.OPENING_BALANCE),
        mgr,
      );
      const doc = await mgr.getRepository(FinishedDoc).save(
        mgr.getRepository(FinishedDoc).create({
          docNo,
          bizType: FINISHED_BIZ_TYPE.OPENING_BALANCE,
          direction: directionOf(FINISHED_BIZ_TYPE.OPENING_BALANCE),
          docDate: dto.docDate,
          workTeam: null,
          machineNo: null,
          originDocId: null,
          // 期初直接生效，不经草稿
          status: FINISHED_DOC_STATUS.CONFIRMED,
          remark: dto.remark ?? '期初录入',
          ...auditOnCreate(user),
        }),
      );

      const rows = await this.buildOpeningItems(mgr, doc.id, dto.items);
      const saved = await mgr.getRepository(FinishedItem).save(rows);
      await this.applyItemsToBalance(mgr, doc, saved, user);

      // 期初会抬高完成数，若某订单因此交清则自动完结（§3.1）
      const sync = await syncOrderFinishState(mgr, this.orderIdsOf(saved), user);
      return { id: doc.id, docNo, itemCount: saved.length, ...sync };
    });
  }

  /** 期初明细落库：快照一律从订单侧读，客户端传值不采信 */
  private async buildOpeningItems(
    mgr: EntityManager,
    docId: number,
    items: OpeningFinishedDto['items'],
  ): Promise<FinishedItem[]> {
    const productIds = items.map((it) => Number(it.orderProductId) || 0);
    const snapshots = await this.productSnapshot.load(mgr, productIds, {
      // 期初补录的历史订单可能已完结，但不会是作废；作废订单仍不允许挂
      includeCancelledOrder: false,
    });

    const seen = new Set<string>();
    return items.map((it, i) => {
      const productId = Number(it.orderProductId) || 0;
      const batchNo = (it.batchNo ?? '').trim();

      const snap = snapshots.get(productId);
      if (!snap) {
        throw new BadRequestException(`第 ${i + 1} 行：订单产品不存在或订单已作废`);
      }
      /**
       * **期初只能挂「期初补录」订单**（2026-08-11 补的闸门）。
       *
       * 期初豁免装配闸门（§4.5），若允许挂到正常订单上，就等于绕过
       * 「Σ已完成装配 − Σ已入库」凭空给该订单加完成数与库存——正常订单的货
       * 必须走装配再入库。前端选择器已按 is_opening 过滤，这里是服务端硬闸门。
       */
      if (snap.orderIsOpening !== 1) {
        throw new BadRequestException(
          `第 ${i + 1} 行：订单「${snap.orderNo ?? ''}」不是期初补录单，不能录期初。`
            + '正常订单的成品请走「成品出入库 → 成品入库」（需先完成装配）；'
            + '若这确实是上线前的历史订单，请到订单管理把它的「期初补录」开关打开',
        );
      }
      const side = this.assertSide(it.side, snap, i);
      const key = `p${productId}#${side}#${batchNo}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `第 ${i + 1} 行：「${snap.productModel ?? ''}${side ? ` ${sideLabel(side)}边` : ''}」重复，请合并数量`,
        );
      }
      seen.add(key);
      return mgr.getRepository(FinishedItem).create({
        docId,
        orderId: snap.orderId,
        orderProductId: snap.orderProductId,
        orderNo: snap.orderNo,
        customerName: snap.customerName,
        productionNo: snap.productionNo,
        itemNo: snap.itemNo,
        productModel: snap.productModel,
        productType: snap.productType,
        // 挂订单的成品是整套滑轨，没有组的概念，故不落组类型
        groupType: null,
        railSection: snap.railSection,
        dimensionText: snap.dimensionText,
        dimensionMm: snap.dimensionMm,
        surfaceType: snap.surfaceType,
        color: snap.color,
        side,
        batchNo,
        quantity: it.quantity,
        originItemId: null,
        remark: it.remark ?? null,
        sort: i,
      });
    });
  }

  /** 编辑：仅草稿可改（已确认单禁改禁删，只能红字冲销，§7.1）；明细整体重建 */
  async update(id: number, dto: UpdateFinishedDocDto, user: CurrentUserPayload) {
    const doc = await this.mustGet(id);
    this.assertDraft(doc, '编辑');
    if (doc.bizType !== dto.bizType) {
      throw new BadRequestException('单据业务类型不可更改；如需更换请作废后重新建单');
    }
    return this.dataSource.transaction(async (mgr) => {
      await mgr.getRepository(FinishedDoc).update(id, {
        docDate: dto.docDate,
        workTeam: dto.workTeam ?? null,
        // 机台号已停用录入：编辑**不触碰**该列——历史草稿上的旧值保留，不被洗成 null
        remark: dto.remark ?? null,
        ...auditOnUpdate(user),
      });
      await mgr.getRepository(FinishedItem).delete({ docId: id });
      await this.writeItems(mgr, id, dto.items);
      return { id };
    });
  }

  /** 作废：仅草稿（已确认单只能红字冲销，§3.3） */
  async cancel(id: number, user: CurrentUserPayload) {
    const doc = await this.mustGet(id);
    if (doc.status === FINISHED_DOC_STATUS.CANCELLED) {
      throw new BadRequestException('单据已作废');
    }
    this.assertDraft(doc, '作废');
    await this.docRepo.update(id, {
      status: FINISHED_DOC_STATUS.CANCELLED,
      ...auditOnUpdate(user),
    });
    return { id, status: FINISHED_DOC_STATUS.CANCELLED };
  }

  /* ==================== 确认（闸门 + 结存） ==================== */

  /**
   * 确认单据：草稿 → 已确认，并驱动余额增减。
   *
   * 同一事务内依次做三件事，任一失败整笔回滚：
   * 1. **装配入库闸门**（仅 biz_type='inbound'）：按 (产品行, side) 校验
   *    `本次入库量 ≤ 可入库量`，口径复用 assembly-quota.util（§4.5 / §7.13）。
   *    期初与红字豁免——期初是存量补录、红字是对已确认单的抵扣，均无装配过程。
   * 2. **余额行锁**：对涉及的余额行 `SELECT ... FOR UPDATE`，防并发超扣（§7.8）。
   * 3. **结存不得为负**：出库与「红字冲销入库单」都会减库存，减到负数一律拒绝（§7.2）。
   */
  async confirm(id: number, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const doc = await mgr.getRepository(FinishedDoc).findOne({ where: { id } });
      if (!doc) throw new NotFoundException('单据不存在');
      this.assertDraft(doc, '确认');

      const items = await mgr.getRepository(FinishedItem).find({ where: { docId: id } });
      if (!items.length) throw new BadRequestException('单据没有明细，不能确认');

      await this.applyItemsToBalance(mgr, doc, items, user);

      await mgr.getRepository(FinishedDoc).update(id, {
        status: FINISHED_DOC_STATUS.CONFIRMED,
        ...auditOnUpdate(user),
      });

      // 出库量变了 → 发货欠数变了 → 订单可能该完结（§3.1）。同事务内同步，
      // 保证库存与订单状态一起成立或一起回滚
      const sync = await syncOrderFinishState(mgr, this.orderIdsOf(items), user);
      return { id, status: FINISHED_DOC_STATUS.CONFIRMED, ...sync };
    });
  }

  /**
   * 红字冲销：对已确认单生成方向相反的 FGR 单并**自动确认**，原单保持不变（§3.3 / §7.1）。
   * 支持按行部分冲销；每行冲销量 ≤ 原行数量 − 该行已冲销量。红字单本身不可再冲销。
   */
  async reverse(id: number, dto: ReverseFinishedDocDto, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const origin = await mgr.getRepository(FinishedDoc).findOne({ where: { id } });
      if (!origin) throw new NotFoundException('单据不存在');
      if (origin.status !== FINISHED_DOC_STATUS.CONFIRMED) {
        throw new BadRequestException('仅「已确认」的单据可以红字冲销');
      }
      if (origin.bizType === FINISHED_BIZ_TYPE.REVERSAL) {
        throw new BadRequestException('红字冲销单本身不能再冲销；如需恢复请重新建单');
      }

      const originItems = await mgr.getRepository(FinishedItem).find({ where: { docId: id } });
      if (!originItems.length) throw new BadRequestException('原单没有明细，无法冲销');
      const originMap = new Map(originItems.map((it) => [it.id, it]));
      const reversed = await this.loadReversedQty(
        originItems.map((it) => it.id),
        mgr,
      );

      // 未指定明细 = 整单按剩余可冲量全额冲销
      const plan = (dto.items?.length
        ? dto.items
        : originItems.map((it) => ({
            originItemId: it.id,
            quantity: (it.quantity || 0) - (reversed.get(it.id) ?? 0),
          }))
      ).filter((r) => r.quantity > 0);
      if (!plan.length) throw new BadRequestException('该单已全部冲销，没有可冲销的数量');

      for (const row of plan) {
        const src = originMap.get(row.originItemId);
        if (!src) throw new BadRequestException(`明细行 ${row.originItemId} 不属于本单据`);
        const left = (src.quantity || 0) - (reversed.get(src.id) ?? 0);
        if (row.quantity > left) {
          throw new BadRequestException(
            `产品「${src.productModel ?? ''}」${src.side ? `（${sideLabel(src.side)}边）` : ''}` +
              `本次冲销 ${row.quantity} 支超过可冲销余量 ${left} 支（原单 ${src.quantity} 支、已冲销 ${reversed.get(src.id) ?? 0} 支）`,
          );
        }
      }

      const docNo = await this.numberGenerator.generate(prefixOf(FINISHED_BIZ_TYPE.REVERSAL), mgr);
      const redDoc = await mgr.getRepository(FinishedDoc).save(
        mgr.getRepository(FinishedDoc).create({
          docNo,
          bizType: FINISHED_BIZ_TYPE.REVERSAL,
          // 方向与被冲原单相反，聚合时 direction×quantity 自然抵扣
          direction: -origin.direction,
          docDate: dto.docDate,
          workTeam: null,
          machineNo: null,
          originDocId: origin.id,
          status: FINISHED_DOC_STATUS.CONFIRMED,
          remark: `冲销 ${origin.docNo}：${dto.reason}`,
          ...auditOnCreate(user),
        }),
      );

      const redItems = plan.map((row, i) => {
        const src = originMap.get(row.originItemId) as FinishedItem;
        return mgr.getRepository(FinishedItem).create({
          ...this.copySnapshot(src),
          docId: redDoc.id,
          quantity: row.quantity,
          originItemId: src.id,
          remark: dto.reason,
          sort: i,
        });
      });
      const saved = await mgr.getRepository(FinishedItem).save(redItems);

      // 红字单建后立即生效：驱动余额（红字豁免装配闸门，但结存仍不得为负）
      await this.applyItemsToBalance(mgr, redDoc, saved, user);

      // 冲销出库单会让发货欠数回正 → 已完结订单需自动重开（§3.1）
      const sync = await syncOrderFinishState(mgr, this.orderIdsOf(saved), user);
      return { id: redDoc.id, docNo, originDocId: origin.id, ...sync };
    });
  }

  /** 明细涉及的订单 ID（去重，跳过不挂订单的纯属性行） */
  private orderIdsOf(items: FinishedItem[]): number[] {
    return [...new Set(items.map((it) => it.orderId).filter((v) => v > 0))];
  }

  /* ==================== 内部：余额与闸门 ==================== */

  /**
   * 把一张单的明细应用到余额上。
   * 闸门 → 锁余额 → 增减 → 负数拦截，全部在调用方给定的事务内完成。
   */
  private async applyItemsToBalance(
    mgr: EntityManager,
    doc: FinishedDoc,
    items: FinishedItem[],
    user: CurrentUserPayload,
  ) {
    void user;
    // 同一单内同键明细先合并，避免逐行判定时漏算本单内的累计影响
    const merged = new Map<string, { item: FinishedItem; qty: number }>();
    items.forEach((it) => {
      const key = this.balanceKey(it.orderProductId, it.side, it.batchNo);
      const prev = merged.get(key);
      if (prev) prev.qty += it.quantity || 0;
      else merged.set(key, { item: it, qty: it.quantity || 0 });
    });

    // 1) 装配入库闸门：仅生产入库校验；期初与红字豁免（§4.5）
    if (doc.bizType === FINISHED_BIZ_TYPE.INBOUND) {
      const byProductSide = new Map<
        string,
        { productId: number; side: string; qty: number; item: FinishedItem }
      >();
      merged.forEach(({ item, qty }) => {
        if (item.orderProductId <= 0) return;
        const k = quotaKey(item.orderProductId, item.side);
        const cur = byProductSide.get(k);
        if (cur) cur.qty += qty;
        else byProductSide.set(k, { productId: item.orderProductId, side: item.side, qty, item });
      });
      if (byProductSide.size) {
        // 所有产品行（含分体单部件行如内轨）一律受闸门约束
        // ——原「免装配剔除」已于 2026-08-13 按使用部门反馈取消（内轨也要装配自身小零件）
        const gated = [...byProductSide.values()];
        const quota = await loadInboundQuota(
          mgr,
          gated.map((v) => ({ orderProductId: v.productId, side: v.side })),
          { lock: true },
        );
        for (const v of gated) {
          const q = quota.get(quotaKey(v.productId, v.side));
          const allowed = q?.quota ?? 0;
          if (v.qty > allowed) {
            const st = v.side ? `（${sideLabel(v.side)}边）` : '';
            throw new BadRequestException(
              `产品「${v.item.productModel ?? ''}」${st}本次入库 ${v.qty} 支，` +
                `超过可入库量 ${allowed} 支（已完成装配 ${q?.assembledQty ?? 0} 支、已入库 ${q?.inboundQty ?? 0} 支）；` +
                `请先在装配管理补录已完成的装配批次`,
            );
          }
        }
      }
    }

    // 2) 锁余额行 → 3) 增减 → 负数拦截
    for (const { item, qty } of merged.values()) {
      const delta = doc.direction * qty;
      const balance = await this.lockOrCreateBalance(mgr, item);
      const next = (balance.quantity || 0) + delta;
      if (next < 0) {
        const st = item.side ? `（${sideLabel(item.side)}边）` : '';
        throw new BadRequestException(
          `产品「${item.productModel ?? ''}」${st}当前结存 ${balance.quantity} 支，` +
            `本次需扣减 ${qty} 支，结存不足`,
        );
      }
      await mgr.getRepository(FinishedBalance).update(balance.id, { quantity: next });
    }
  }

  /**
   * 取余额行并加行锁；不存在则先建一行 0 结存再锁（唯一键兜底并发重复插入）。
   * `attr_key` 恒为空串——余额行现在一律挂订单产品行（不挂订单的纯属性行已下线，
   * 见 t_finished_balance 实体注释），它只是仍留在 uk_balance 里的历史成分。
   */
  private async lockOrCreateBalance(mgr: EntityManager, item: FinishedItem): Promise<FinishedBalance> {
    const attrKey = '';
    const where = {
      orderProductId: item.orderProductId,
      side: item.side ?? '',
      batchNo: item.batchNo ?? '',
      attrKey,
    };
    const find = async () =>
      mgr
        .getRepository(FinishedBalance)
        .createQueryBuilder('b')
        .setLock('pessimistic_write')
        .where(
          'b.orderProductId = :p AND b.side = :s AND b.batchNo = :b AND b.attrKey = :a',
          { p: where.orderProductId, s: where.side, b: where.batchNo, a: attrKey },
        )
        .getOne();

    const existing = await find();
    if (existing) return existing;

    try {
      await mgr.getRepository(FinishedBalance).insert({
        orderId: item.orderId,
        orderProductId: item.orderProductId,
        itemNo: item.itemNo ?? '',
        productModel: item.productModel ?? '',
        productType: item.productType ?? '',
        groupType: item.groupType ?? '',
        railSection: item.railSection ?? '',
        dimensionMm: item.dimensionMm ?? 0,
        dimensionText: item.dimensionText ?? '',
        surfaceType: item.surfaceType ?? '',
        color: item.color ?? '',
        side: where.side,
        batchNo: where.batchNo,
        attrKey,
        quantity: 0,
      });
    } catch {
      // 并发下另一事务已插入同键行，忽略后重取（唯一键保证只会有一行）
    }
    const created = await find();
    if (!created) throw new BadRequestException('库存余额行创建失败，请重试');
    return created;
  }

  private balanceKey(productId: number, side: string, batchNo: string): string {
    return `${productId}#${side ?? ''}#${batchNo ?? ''}`;
  }

  /** 各原明细行已被红字冲销的数量合计 */
  private async loadReversedQty(itemIds: number[], mgr?: EntityManager) {
    const map = new Map<number, number>();
    const ids = itemIds.filter((v) => Number.isInteger(v) && v > 0);
    if (!ids.length) return map;
    const runner = mgr ?? this.dataSource;
    const rows: any[] = await runner.query(
      `SELECT i.origin_item_id AS oid, SUM(i.quantity) AS qty
         FROM t_finished_item i
         JOIN t_finished_doc d ON d.id = i.doc_id
        WHERE i.origin_item_id IN (${ids.map(() => '?').join(',')})
          AND d.status = ? AND d.biz_type = ?
        GROUP BY i.origin_item_id`,
      [...ids, FINISHED_DOC_STATUS.CONFIRMED, FINISHED_BIZ_TYPE.REVERSAL],
    );
    rows.forEach((r) => map.set(Number(r.oid), Number(r.qty) || 0));
    return map;
  }

  /** 按 (产品行, side) 取余额（batch 默认空串），供选项接口展示当前结存 */
  private async loadBalanceMap(
    mgr: EntityManager,
    keys: Array<{ orderProductId: number; side: string }>,
  ) {
    const map = new Map<string, { quantity: number }>();
    const ids = [...new Set(keys.map((k) => k.orderProductId))].filter((v) => v > 0);
    if (!ids.length) return map;
    const rows: any[] = await mgr.query(
      `SELECT order_product_id AS pid, side, SUM(quantity) AS qty
         FROM t_finished_balance
        WHERE order_product_id IN (${ids.map(() => '?').join(',')})
        GROUP BY order_product_id, side`,
      ids,
    );
    rows.forEach((r) =>
      map.set(quotaKey(Number(r.pid), r.side ?? ''), { quantity: Number(r.qty) || 0 }),
    );
    return map;
  }

  /* ==================== 内部：明细落库 ==================== */

  private async writeItems(
    mgr: EntityManager,
    docId: number,
    items: CreateFinishedDocDto['items'],
  ) {
    const productIds = items.map((it) => it.orderProductId);
    const snapshots = await this.productSnapshot.load(mgr, productIds);

    const seen = new Set<string>();
    const rows = items.map((it, i) => {
      const snap = snapshots.get(it.orderProductId);
      if (!snap) {
        throw new BadRequestException(`第 ${i + 1} 行明细：订单产品不存在或订单已作废`);
      }
      const side = this.assertSide(it.side, snap, i);
      const batchNo = (it.batchNo ?? '').trim();
      const key = `${it.orderProductId}#${side}#${batchNo}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `第 ${i + 1} 行明细：同一单据内「${snap.productModel ?? ''}${side ? ` ${sideLabel(side)}边` : ''}」重复，请合并数量`,
        );
      }
      seen.add(key);

      return mgr.getRepository(FinishedItem).create({
        docId,
        orderId: snap.orderId,
        orderProductId: snap.orderProductId,
        orderNo: snap.orderNo,
        customerName: snap.customerName,
        productionNo: snap.productionNo,
        itemNo: snap.itemNo,
        productModel: snap.productModel,
        productType: snap.productType,
        // 挂订单的成品是整套滑轨，没有组的概念
        groupType: null,
        railSection: snap.railSection,
        dimensionText: snap.dimensionText,
        dimensionMm: snap.dimensionMm,
        surfaceType: snap.surfaceType,
        color: snap.color,
        side,
        batchNo,
        quantity: it.quantity,
        originItemId: null,
        remark: it.remark ?? null,
        sort: it.sort ?? i,
      });
    });
    await mgr.getRepository(FinishedItem).save(rows);
  }

  /** 红字明细复制原行的锚点与快照（只换数量、来源与备注） */
  private copySnapshot(src: FinishedItem) {
    return {
      orderId: src.orderId,
      orderProductId: src.orderProductId,
      orderNo: src.orderNo,
      customerName: src.customerName,
      productionNo: src.productionNo,
      itemNo: src.itemNo,
      productModel: src.productModel,
      productType: src.productType,
      groupType: src.groupType,
      railSection: src.railSection,
      dimensionText: src.dimensionText,
      dimensionMm: src.dimensionMm,
      surfaceType: src.surfaceType,
      color: src.color,
      side: src.side,
      batchNo: src.batchNo,
    };
  }

  private assertSide(side: string | undefined, snap: ProductSnapshot, index: number): string {
    const v = (side ?? '').trim();
    const socket = hasSocket(snap.productType);
    if (!isValidSide(v, socket)) {
      throw new BadRequestException(
        socket
          ? `第 ${index + 1} 行明细：产品「${snap.productModel ?? ''}」含卡口，必须按左/右分行录入`
          : `第 ${index + 1} 行明细：产品「${snap.productModel ?? ''}」不含卡口，不能指定边别`,
      );
    }
    return v;
  }

  private assertDraft(doc: FinishedDoc, action: string) {
    if (doc.status === FINISHED_DOC_STATUS.CONFIRMED) {
      throw new BadRequestException(
        `单据 ${doc.docNo} 已确认，不能${action}；已确认单据只能通过「红字冲销」更正`,
      );
    }
    if (doc.status !== FINISHED_DOC_STATUS.DRAFT) {
      throw new BadRequestException(`单据 ${doc.docNo} 当前状态不允许${action}`);
    }
  }

  private async mustGet(id: number): Promise<FinishedDoc> {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('单据不存在');
    return doc;
  }
}
