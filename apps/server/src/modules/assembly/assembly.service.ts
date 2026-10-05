import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  FINISHED_DOC_STATUS,
  ORDER_STATUS,
  assemblySides,
  deriveAssemblyStatus,
  formatDimension,
  hasSocket,
  isValidSide,
  productLevelModel,
  sideLabel,
  sanitizeItemCode,
} from '@hb-oms/shared';
import { AssemblyBatch } from './entities/assembly-batch.entity';
import {
  CreateAssemblyBatchDto,
  QueryAssemblyBatchDto,
  QueryAssemblyDto,
  QueryInboundQuotaDto,
  UpdateAssemblyBatchDto,
} from './dto/assembly.dto';
import {
  InboundQuotaRow,
  loadConfirmedInboundQty,
  loadInboundQuota,
  loadOneInboundQuota,
  quotaKey,
} from './assembly-quota.util';
import { OUTBOUND_FAMILY_PARAMS, OUTBOUND_FAMILY_SQL } from '../order/order-owed.util';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { ProductSnapshotService } from '../../common/services/product-snapshot.service';
import { RecordOwnershipService } from '../../common/services/record-ownership.service';
import { EXPORT_ROW_LIMIT, createWorkbook, styleSheet } from '../../common/utils/excel.util';
import { dictLabeler, loadDictLabels } from '../../common/utils/dict-label.util';

/** 装配管理列表行：按**订单产品行**一行，附该产品的装配进度聚合 */
export interface AssemblyGroupRow {
  orderProductId: number;
  orderId: number;
  orderNo: string | null;
  customerName: string | null;
  orderDate: string | null;
  productionNo: string | null;
  itemNo: string | null;
  materialCode: string | null;
  productModel: string | null;
  /** 产品名称（同货号拆多行时的辅助区分） */
  productName: string | null;
  productType: string | null;
  railSection: string | null;
  /**
   * 分体出货：0整品 1分体（形态由部件组构成推导，已体现在 productModel 后缀）。
   * 分体行（含单部件行如内轨）同样要装配自身小零件，与整品行一样录批次、受闸门
   * ——原「免装配」口径已于 2026-08-13 按使用部门反馈取消。
   */
  isSplit: number;
  dimensionText: string | null;
  /**
   * 该产品各装配批次的车间（去重）。车间已下沉批次级——订单环节不再安排装配车间，
   * 一个产品多批可分在不同车间，故是列表而非单值；无批次时为空数组。
   */
  assemblyWorkshops: string[];
  deliveryDate: string | null;
  /** 产品支数（台账「订单数」口径，也是排产数量的默认值） */
  qtyPcs: number;
  /** 是否含卡口——含卡口的批次与闸门按左右分开核算 */
  socket: boolean;
  /** 批次数 */
  batchCount: number;
  /** 已录批次总量（含计划中）（支） */
  plannedQty: number;
  /** 已完成装配量（actual_date 非空）（支） */
  doneQty: number;
  /** 未装配量 = 产品支数 − 已完成装配量，可为负（超装配） */
  pendingQty: number;
  /**
   * 生产入库数（支）：已确认的生产入库单 − 冲销它的红字单，**不含期初**。
   * 与入库闸门「已入库量」同一实现（loadConfirmedInboundQty），故与台账「完成数」（含期初）口径不同——有意为之。
   */
  inboundQty: number;
  /** 销售出库数（支）：已确认的销售出库单 − 冲销它的红字单，与台账「成品出货」同口径（OUTBOUND_FAMILY_SQL） */
  outboundQty: number;
  /** 最早未完成批次的计划完成时间（逾期提示用） */
  nextPlanDate: string | null;
  /** 最近一次实际完成时间 */
  lastActualDate: string | null;
  /** 是否逾期：存在未完成批次且其计划完成时间已过 */
  overdue: boolean;
}

@Injectable()
export class AssemblyService {
  constructor(
    @InjectRepository(AssemblyBatch) private readonly batchRepo: Repository<AssemblyBatch>,
    private readonly dataSource: DataSource,
    // 装配锚产品行，故读产品级快照（部件组级快照留给外发用）
    private readonly productSnapshot: ProductSnapshotService,
    private readonly ownership: RecordOwnershipService,
  ) {}

  /* ==================== 查询 ==================== */

  /**
   * 装配管理列表：按**订单产品行**一行（对齐台账主行粒度），聚合该产品的批次数、
   * 已录量、已完成量、最早未完成计划日。已作废订单的产品不进本页。
   *
   * 排产是产品级活动——一条产线装的是整套滑轨，不会按外轨/中轨/内轨分别排，
   * 故不再按部件组铺行（2026-08-10 改）。
   */
  async findList(query: QueryAssemblyDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: string[] = ['o.status <> ?'];
    const params: Array<string | number> = [ORDER_STATUS.CANCELLED];

    if (query.keyword) {
      where.push(`(o.order_no LIKE ? OR o.customer_name LIKE ? OR o.production_no LIKE ?
                   OR p.item_no LIKE ? OR p.material_code LIKE ?)`);
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw, kw, kw);
    }
    if (query.workshop) {
      // 车间只存在于装配批次（订单环节不再安排计划车间），故只匹配批次实际车间
      where.push(`EXISTS (SELECT 1 FROM t_assembly_batch b
                           WHERE b.order_product_id = p.id AND b.workshop = ?)`);
      params.push(query.workshop);
    }
    if (query.deliveryFrom) {
      where.push('p.delivery_date >= ?');
      params.push(query.deliveryFrom);
    }
    if (query.deliveryTo) {
      where.push('p.delivery_date <= ?');
      params.push(query.deliveryTo);
    }
    if (query.onlyUnfinished) {
      where.push('COALESCE(a.done_qty, 0) < p.qty_pcs');
    }
    if (query.onlyOverdue) {
      where.push('a.next_plan_date IS NOT NULL AND a.next_plan_date < CURDATE()');
    }

    const fromSql = `
        FROM t_order_product p
        JOIN t_order o ON o.id = p.order_id
        LEFT JOIN (
              SELECT order_product_id                                           AS pid,
                     COUNT(*)                                                   AS batch_count,
                     SUM(qty)                                                   AS planned_qty,
                     SUM(CASE WHEN actual_date IS NOT NULL THEN qty ELSE 0 END) AS done_qty,
                     MIN(CASE WHEN actual_date IS NULL THEN plan_date END)      AS next_plan_date,
                     MAX(actual_date)                                           AS last_actual_date,
                     -- 装配车间已下沉批次级（订单不再预设计划车间），一个产品多批可能分在不同
                     -- 车间，故聚合成去重列表交给界面并列展示；NULL 会被 GROUP_CONCAT 自动跳过
                     GROUP_CONCAT(DISTINCT NULLIF(workshop, '') ORDER BY workshop SEPARATOR ',') AS workshops
                FROM t_assembly_batch
               GROUP BY order_product_id
             ) a ON a.pid = p.id
       WHERE ${where.join(' AND ')}`;

    const countRows: Array<{ cnt: number | string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt ${fromSql}`,
      params,
    );
    const total = Number(countRows?.[0]?.cnt ?? 0);

    const rows: any[] = await this.dataSource.query(
      `SELECT p.id                AS product_id,
              p.order_id          AS order_id,
              p.qty_pcs           AS qty_pcs,
              o.order_no          AS order_no,
              o.customer_name     AS customer_name,
              o.order_date        AS order_date,
              o.production_no     AS production_no,
              p.item_no           AS item_no,
              p.material_code     AS material_code,
              p.product_name      AS product_name,
              p.product_type      AS product_type,
              p.rail_section      AS rail_section,
              p.is_split          AS is_split,
              (SELECT GROUP_CONCAT(g.group_type ORDER BY g.sort, g.id)
                 FROM t_order_part_group g
                WHERE g.order_product_id = p.id) AS group_types,
              p.dimension_raw     AS dimension_raw,
              p.dimension_unit    AS dimension_unit,
              p.dimension_mm      AS dimension_mm,
              a.workshops         AS workshops,
              p.delivery_date     AS delivery_date,
              COALESCE(a.batch_count, 0) AS batch_count,
              COALESCE(a.planned_qty, 0) AS planned_qty,
              COALESCE(a.done_qty, 0)    AS done_qty,
              a.next_plan_date           AS next_plan_date,
              a.last_actual_date         AS last_actual_date
       ${fromSql}
       ORDER BY (p.delivery_date IS NULL), p.delivery_date ASC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    const today = this.todayText();
    const { inbound, outbound } = await this.loadStockFlowQty(rows.map((r) => Number(r.product_id)));
    const list: AssemblyGroupRow[] = rows.map((r) => {
      const qtyPcs = Number(r.qty_pcs) || 0;
      const doneQty = Number(r.done_qty) || 0;
      const nextPlanDate = this.dateText(r.next_plan_date);
      const isSplit = Number(r.is_split) || 0;
      const groupTypes = String(r.group_types ?? '').split(',').filter(Boolean);
      return {
        orderProductId: Number(r.product_id),
        orderId: Number(r.order_id),
        orderNo: r.order_no ?? null,
        customerName: r.customer_name ?? null,
        orderDate: this.dateText(r.order_date),
        productionNo: r.production_no ?? null,
        itemNo: r.item_no ?? null,
        materialCode: r.material_code ?? null,
        // 产品级型号：整品带「滑轨」后缀；分体行后缀由组构成推导（外中轨/内轨…）
        productModel: productLevelModel(
          r.item_no ?? '',
          r.product_type ?? '',
          isSplit,
          groupTypes,
          r.rail_section ?? null,
        ),
        productName: r.product_name ?? null,
        productType: r.product_type ?? null,
        railSection: r.rail_section ?? null,
        isSplit,
        dimensionText: this.dimensionText(r),
        assemblyWorkshops: this.splitList(r.workshops),
        deliveryDate: this.dateText(r.delivery_date),
        qtyPcs,
        socket: hasSocket(r.product_type),
        batchCount: Number(r.batch_count) || 0,
        plannedQty: Number(r.planned_qty) || 0,
        doneQty,
        pendingQty: qtyPcs - doneQty,
        inboundQty: inbound.get(Number(r.product_id)) ?? 0,
        outboundQty: outbound.get(Number(r.product_id)) ?? 0,
        nextPlanDate,
        lastActualDate: this.dateText(r.last_actual_date),
        overdue: !!nextPlanDate && nextPlanDate < today,
      };
    });

    return { list, total, page, pageSize };
  }

  /**
   * 当前页产品行的「生产入库数 / 销售出库数」（按产品行汇总，含卡口的左右两边相加）。
   * 两个口径都复用既有唯一实现、不另写判定：入库走闸门的 loadConfirmedInboundQty，
   * 出库走台账的 OUTBOUND_FAMILY_SQL（§5.6「欠数口径唯一事实源」）。
   */
  private async loadStockFlowQty(productIds: number[]) {
    const inbound = new Map<number, number>();
    const outbound = new Map<number, number>();
    const ids = [...new Set(productIds.filter((v) => Number.isInteger(v) && v > 0))];
    if (!ids.length) return { inbound, outbound };

    const mgr = this.dataSource.manager;
    const bySide = await loadConfirmedInboundQty(mgr, ids);
    bySide.forEach((qty, key) => {
      const pid = Number(key.split('#')[0]); // quotaKey 格式为「产品行ID#边别」
      inbound.set(pid, (inbound.get(pid) ?? 0) + qty);
    });

    const rows: Array<{ pid: number; qty: string | number }> = await mgr.query(
      `SELECT fi.order_product_id AS pid,
              SUM(-fd.direction * fi.quantity) AS qty
         FROM t_finished_item fi
         JOIN t_finished_doc  fd ON fd.id = fi.doc_id
         LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
        WHERE fi.order_product_id IN (${ids.map(() => '?').join(',')})
          AND fd.status = ?
          AND ${OUTBOUND_FAMILY_SQL}
        GROUP BY fi.order_product_id`,
      [...ids, FINISHED_DOC_STATUS.CONFIRMED, ...OUTBOUND_FAMILY_PARAMS],
    );
    rows.forEach((r) => outbound.set(Number(r.pid), Number(r.qty) || 0));
    return { inbound, outbound };
  }

  /**
   * 某产品行的装配批次明细 + 分边别小计与可入库量。
   * 供装配管理页的批次弹窗与成品入库表单下钻使用。
   */
  async findBatches(query: QueryAssemblyBatchDto, user?: CurrentUserPayload) {
    if (!query.orderProductId) {
      throw new BadRequestException('请指定订单产品');
    }

    const qb = this.batchRepo.createQueryBuilder('b');
    qb.andWhere('b.orderProductId = :pid', { pid: query.orderProductId });
    if (query.side != null) qb.andWhere('b.side = :side', { side: query.side });
    // 按预计装配区间排：先计划开始、再计划完成，未填计划的沉到最后按录入序
    qb.orderBy('b.planStartDate', 'ASC').addOrderBy('b.planDate', 'ASC').addOrderBy('b.id', 'ASC');
    const rows = await qb.getMany();
    // 每行带 canModify：前端据此禁用编辑 / 删除（服务端 updateBatch / removeBatch 另有硬校验）
    const modifiable = user ? await this.ownership.canModifyMany('assembly', rows, user) : rows.map(() => false);
    const list = rows.map((b, i) => Object.assign(b, { canModify: modifiable[i] }));

    // 分边别小计：含卡口按左右各算一份额度，非卡口只有空串一份
    const product = await this.productSnapshot.loadOne(null, query.orderProductId, {
      includeCancelledOrder: true,
    });
    const socket = hasSocket(product?.productType);
    const keys = assemblySides(socket).map((side) => ({
      orderProductId: query.orderProductId as number,
      side,
    }));
    const quota = await loadInboundQuota(this.dataSource.manager, keys);
    const sides: Array<InboundQuotaRow & { plannedQty: number; sideLabel: string }> = keys.map(
      (k) => {
        const row = quota.get(quotaKey(k.orderProductId, k.side)) ?? {
          orderProductId: k.orderProductId,
          side: k.side,
          assembledQty: 0,
          inboundQty: 0,
          quota: 0,
        };
        return {
          ...row,
          sideLabel: sideLabel(k.side),
          plannedQty: list
            .filter((b) => b.side === k.side)
            .reduce((s, b) => s + (b.qty || 0), 0),
        };
      },
    );

    return {
      product: product ? { ...product, socket } : null,
      sides,
      list,
    };
  }

  /** 可入库量查询（§4.4 闸门口径，入库表单前置展示；只读不加锁） */
  async findInboundQuota(query: QueryInboundQuotaDto): Promise<InboundQuotaRow> {
    return loadOneInboundQuota(
      this.dataSource.manager,
      query.orderProductId,
      query.side ?? '',
    );
  }

  /* ==================== 批次增删改 ==================== */

  /**
   * 新增装配批次。锚点与快照由服务端从订单侧读取（§5.5 防伪造）；
   * 车间未传时继承产品行的计划装配车间。新增只会抬高可入库量，无需闸门校验。
   */
  async createBatch(dto: CreateAssemblyBatchDto, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const snap = await this.productSnapshot.loadOne(mgr, dto.orderProductId);
      if (!snap) throw new BadRequestException('订单产品不存在，或所属订单已作废');

      // 分体行（含内轨等单部件行）同样要装配自身小零件，与整品行一样录批次
      // ——原「免装配禁建批次」限制已于 2026-08-13 按使用部门反馈取消

      const side = this.assertSide(dto.side, snap.productType, snap.productModel);
      const planStartDate = this.normalizeDate(dto.planStartDate);
      const planDate = this.normalizeDate(dto.planDate);
      const actualDate = this.normalizeDate(dto.actualDate);
      this.assertDates(planStartDate, planDate, actualDate);

      const saved = await mgr.getRepository(AssemblyBatch).save(
        mgr.getRepository(AssemblyBatch).create({
          orderId: snap.orderId,
          orderProductId: snap.orderProductId,
          side,
          // 车间不再继承产品行计划车间（订单环节已不安排装配车间），完全由本批次录入决定
          workshop: dto.workshop?.trim() || null,
          planStartDate,
          planDate,
          actualDate,
          qty: dto.qty,
          status: deriveAssemblyStatus(actualDate),
          orderNo: snap.orderNo,
          customerName: snap.customerName,
          productionNo: snap.productionNo,
          productModel: snap.productModel,
          dimensionText: snap.dimensionText,
          remark: dto.remark ?? null,
          ...auditOnCreate(user),
        }),
      );
      return { id: saved.id, orderProductId: snap.orderProductId, side };
    });
  }

  /**
   * 编辑装配批次（锚点不可改）。下调数量或退回「计划中」都会压低可入库量，
   * 改完必须复核 `可入库量 ≥ 0`，为负则整笔回滚（§7.14）。
   */
  async updateBatch(id: number, dto: UpdateAssemblyBatchDto, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const pre = await mgr.getRepository(AssemblyBatch).findOne({ where: { id } });
      if (!pre) throw new NotFoundException('装配批次不存在');
      // 只许创建人与装配主管角色（受数据范围约束，管理员不例外）
      await this.ownership.assertCanModify('assembly', pre, user, '修改');
      // 统一锁顺序「先锁产品行全部批次行、再改本行」，与入库确认一致，避免交叉等待死锁
      await loadInboundQuota(
        mgr,
        [{ orderProductId: pre.orderProductId, side: pre.side }],
        { lock: true },
      );
      const batch = await mgr.getRepository(AssemblyBatch).findOne({ where: { id } });
      if (!batch) throw new NotFoundException('装配批次不存在');

      const planStartDate = this.normalizeDate(dto.planStartDate);
      const planDate = this.normalizeDate(dto.planDate);
      const actualDate = this.normalizeDate(dto.actualDate);
      this.assertDates(planStartDate, planDate, actualDate);

      await mgr.getRepository(AssemblyBatch).update(id, {
        workshop: dto.workshop?.trim() || null,
        planStartDate,
        planDate,
        actualDate,
        qty: dto.qty,
        status: deriveAssemblyStatus(actualDate),
        remark: dto.remark ?? null,
        ...auditOnUpdate(user),
      });
      await this.assertQuotaNonNegative(mgr, batch.orderProductId, batch.side, '修改本批次');
      return { id, orderProductId: batch.orderProductId, side: batch.side };
    });
  }

  /**
   * 删除装配批次：已被成品入库消耗的完成量不得被删掉（§7.14），删后可入库量为负则回滚。
   * 与修改同权：只许创建人与装配主管角色。删除动作的审计由 @OperationLog 记录。
   */
  async removeBatch(id: number, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const pre = await mgr.getRepository(AssemblyBatch).findOne({ where: { id } });
      if (!pre) throw new NotFoundException('装配批次不存在');
      await this.ownership.assertCanModify('assembly', pre, user, '删除');
      await loadInboundQuota(
        mgr,
        [{ orderProductId: pre.orderProductId, side: pre.side }],
        { lock: true },
      );
      const batch = await mgr.getRepository(AssemblyBatch).findOne({ where: { id } });
      if (!batch) throw new NotFoundException('装配批次不存在');

      await mgr.getRepository(AssemblyBatch).delete(id);
      await this.assertQuotaNonNegative(mgr, batch.orderProductId, batch.side, '删除本批次');
      return { id, orderProductId: batch.orderProductId, side: batch.side };
    });
  }

  /* ==================== 校验工具 ==================== */

  /**
   * 闸门复核：可入库量不得为负（§7.14）。
   * 调用前上层已在同事务内对该产品行批次行加锁，此处 lock=false 不重复加锁。
   */
  private async assertQuotaNonNegative(
    mgr: EntityManager,
    orderProductId: number,
    side: string,
    action: string,
  ) {
    const row = await loadOneInboundQuota(mgr, orderProductId, side);
    if (row.quota < 0) {
      const st = side ? `（${sideLabel(side)}边）` : '';
      throw new BadRequestException(
        `${action}后该产品${st}已完成装配 ${row.assembledQty} 支、已入库 ${row.inboundQty} 支，` +
          `可入库量将变为 ${row.quota} 支；请先红字冲销对应的成品入库单，再调整装配批次`,
      );
    }
  }

  /** 边别校验（§7.15）：含卡口必须左/右，非卡口必须留空 */
  private assertSide(
    side: string | undefined,
    productType: string | null,
    productModel: string | null,
  ): string {
    const v = (side ?? '').trim();
    const socket = hasSocket(productType);
    if (!isValidSide(v, socket)) {
      throw new BadRequestException(
        socket
          ? `产品「${productModel ?? ''}」含卡口，装配批次必须指定左/右边别`
          : `产品「${productModel ?? ''}」不含卡口，装配批次不能指定边别`,
      );
    }
    return v;
  }

  /**
   * 日期校验：
   * 1. 计划完成与实际完成至少填一个——只有计划开始的批次没有完工时点，跟踪不了进度；
   * 2. 计划开始不得晚于计划完成（两者都填时），防止把预计装配区间录反。
   */
  private assertDates(
    planStartDate: string | null,
    planDate: string | null,
    actualDate: string | null,
  ) {
    if (!planDate && !actualDate) {
      throw new BadRequestException('计划完成时间与实际完成时间至少填写一个');
    }
    if (planStartDate && planDate && planStartDate > planDate) {
      throw new BadRequestException(
        `计划开始时间（${planStartDate}）不能晚于计划完成时间（${planDate}）`,
      );
    }
  }

  /** 日期归一：空串/null/undefined → null；其余截到 YYYY-MM-DD */
  private normalizeDate(v: string | null | undefined): string | null {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, 10) : null;
  }

  /* ==================== 导出 ==================== */

  /**
   * 导出装配记录（计划员用）。两张表一次给全：
   *   Sheet1「装配汇总」——一行一个产品，对齐装配管理页的列（完成情况总览）；
   *   Sheet2「装配批次明细」——汇总表那些产品的逐批记录（谁哪天装完了多少支）。
   *
   * 四数不另写聚合 SQL：直接复用 `findList`（与页面、闸门同一口径）——
   * 另写一份迟早分叉，届时「页面 100、导出 98」最难查（§4.4）。
   */
  async exportExcel(query: QueryAssemblyDto): Promise<Buffer> {
    const all = await this.findList({ ...query, page: 1, pageSize: EXPORT_ROW_LIMIT + 1 });
    if (!all.list.length) {
      throw new BadRequestException('当前筛选条件下没有装配记录可导出，请调整筛选条件后重试');
    }
    if (all.list.length > EXPORT_ROW_LIMIT) {
      throw new BadRequestException(
        `当前筛选结果 ${all.total} 行，超过单次导出上限 ${EXPORT_ROW_LIMIT} 行，请缩小筛选范围后重试`,
      );
    }

    // 车间是字典值（workshop2 之类），导出必须落中文——车间拿表贴工位、对手工账（§4.4）
    const labeler = dictLabeler(await loadDictLabels(this.dataSource, ['assembly_workshop']));

    const wb = createWorkbook();

    /* ---------- Sheet1：装配汇总（一行一个产品） ---------- */
    const ws = wb.addWorksheet('装配汇总');
    ws.columns = [
      { header: '订单编号' },
      { header: '客户' },
      { header: '产品代码' },
      { header: '产品型号' },
      { header: '产品名称' },
      { header: '规格' },
      { header: '装配车间' },
      { header: '订单数(支)' },
      { header: '已排产(支)' },
      { header: '已完成(支)' },
      { header: '未装配(支)' },
      { header: '生产入库(支)' },
      { header: '销售出库(支)' },
      { header: '批次数' },
      { header: '装配进度' },
      { header: '待完成计划日' },
      { header: '最近完成日' },
      { header: '交期' },
      { header: '是否逾期' },
    ];
    for (const r of all.list) {
      ws.addRow([
        r.productionNo || r.orderNo || '',
        r.customerName || '',
        sanitizeItemCode(r.itemNo),
        r.productModel || '',
        r.productName || '',
        r.dimensionText || '',
        r.assemblyWorkshops.map((w) => labeler('assembly_workshop', w)).join('/'),
        r.qtyPcs,
        r.plannedQty,
        r.doneQty,
        r.pendingQty,
        r.inboundQty,
        r.outboundQty,
        r.batchCount,
        this.progressText(r),
        r.nextPlanDate || '',
        r.lastActualDate || '',
        r.deliveryDate || '',
        r.overdue ? '是' : '',
      ]);
    }
    styleSheet(ws, { centerColumns: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] });

    /* ---------- Sheet2：装配批次明细（汇总表那些产品的逐批记录） ---------- */
    const productIds = all.list.map((r) => r.orderProductId);
    const batches = await this.batchRepo
      .createQueryBuilder('b')
      .where('b.orderProductId IN (:...ids)', { ids: productIds })
      // 完成的排前面且按完成日期倒序（计划员最关心刚装完的），未完成的沉底按计划日
      .orderBy('b.actualDate', 'DESC')
      .addOrderBy('b.planDate', 'ASC')
      .addOrderBy('b.id', 'ASC')
      .getMany();
    const productMap = new Map(all.list.map((r) => [r.orderProductId, r]));

    const wsB = wb.addWorksheet('装配批次明细');
    wsB.columns = [
      { header: '订单编号' },
      { header: '客户' },
      { header: '产品型号' },
      { header: '规格' },
      { header: '边别' },
      { header: '装配车间' },
      { header: '计划开始' },
      { header: '计划完成' },
      { header: '实际完成' },
      { header: '装配数量(支)' },
      { header: '状态' },
      { header: '备注' },
      { header: '登记人' },
      { header: '登记时间' },
    ];
    for (const b of batches) {
      const p = productMap.get(b.orderProductId);
      wsB.addRow([
        p?.productionNo || p?.orderNo || '',
        p?.customerName || '',
        p?.productModel || '',
        p?.dimensionText || '',
        sideLabel(b.side) || '',
        labeler('assembly_workshop', b.workshop),
        this.dateText(b.planStartDate) || '',
        this.dateText(b.planDate) || '',
        this.dateText(b.actualDate) || '',
        b.qty,
        b.actualDate ? '已完成' : '计划中',
        b.remark || '',
        // 完成时间常由后来编辑补录，最后更新人即完成登记人（与装配批次页同口径）
        b.updaterName || b.creatorName || '',
        this.minuteText(b.updatedAt ?? b.createdAt),
      ]);
    }
    styleSheet(wsB, { centerColumns: [4, 5, 6, 7, 8, 9, 10, 11, 14] });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /** 产品级装配进度文案（与列表页 progressTag 同口径，超装配单独标注） */
  private progressText(r: AssemblyGroupRow): string {
    if (r.doneQty <= 0) return '未开始';
    if (r.pendingQty > 0) return `装配中 ${r.doneQty}/${r.qtyPcs}`;
    if (r.pendingQty < 0) return '已装完(超)';
    return '已装完';
  }

  /** 审计时间戳 → 到分钟（导出表里精确到秒没有意义，还占列宽） */
  private minuteText(v: any): string {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  private todayText(): string {
    return this.dateText(new Date()) as string;
  }

  /** GROUP_CONCAT 结果 → 去空字符串数组（无批次时 NULL，返回空数组） */
  private splitList(v: any): string[] {
    if (!v) return [];
    return String(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** 规格展示：走共享包唯一口径，禁止本地再写一份拼接 */
  private dimensionText(r: any): string | null {
    return formatDimension(r.dimension_raw, r.dimension_unit, r.dimension_mm) || null;
  }
}
