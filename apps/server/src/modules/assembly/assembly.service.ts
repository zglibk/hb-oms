import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  ORDER_STATUS,
  assemblySides,
  deriveAssemblyStatus,
  formatDimension,
  hasSocket,
  isValidSide,
  sideLabel,
} from '@hb-oms/shared';
import { AssemblyBatch } from './entities/assembly-batch.entity';
import {
  CreateAssemblyBatchDto,
  QueryAssemblyBatchDto,
  QueryAssemblyDto,
  QueryInboundQuotaDto,
  UpdateAssemblyBatchDto,
} from './dto/assembly.dto';
import { InboundQuotaRow, loadInboundQuota, loadOneInboundQuota, quotaKey } from './assembly-quota.util';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { PartGroupSnapshotService } from '../../common/services/part-group-snapshot.service';

/** 装配管理列表行：按**部件组**一行，附该组的装配进度聚合 */
export interface AssemblyGroupRow {
  orderPartGroupId: number;
  orderId: number;
  orderProductId: number;
  orderNo: string | null;
  customerName: string | null;
  orderDate: string | null;
  productionNo: string | null;
  itemNo: string | null;
  materialCode: string | null;
  productModel: string | null;
  productType: string | null;
  groupType: string | null;
  railSection: string | null;
  dimensionText: string | null;
  /** 计划装配车间（产品行级） */
  assemblyWorkshop: string | null;
  deliveryDate: string | null;
  /** 组支数（台账「订单数」口径） */
  qtyPcs: number;
  /** 是否含卡口——含卡口的批次与闸门按左右分开核算 */
  socket: boolean;
  /** 批次数 */
  batchCount: number;
  /** 已录批次总量（含计划中）（支） */
  plannedQty: number;
  /** 已完成装配量（actual_date 非空）（支） */
  doneQty: number;
  /** 未装配量 = 组支数 − 已完成装配量，可为负（超装配） */
  pendingQty: number;
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
    private readonly partGroupSnapshot: PartGroupSnapshotService,
  ) {}

  /* ==================== 查询 ==================== */

  /**
   * 装配管理列表：按**部件组**一行（对齐台账粒度），聚合该组的批次数、
   * 已录量、已完成量、最早未完成计划日。已作废订单的组不进本页。
   */
  async findList(query: QueryAssemblyDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: string[] = ['o.status <> ?'];
    const params: Array<string | number> = [ORDER_STATUS.CANCELLED];

    if (query.keyword) {
      where.push(`(o.order_no LIKE ? OR o.customer_name LIKE ? OR p.production_no LIKE ?
                   OR g.product_model LIKE ? OR p.item_no LIKE ?)`);
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw, kw, kw);
    }
    if (query.workshop) {
      // 计划车间（产品行）或实际装配车间（批次覆写）命中其一即算该车间的活
      where.push(`(p.assembly_workshop = ?
                   OR EXISTS (SELECT 1 FROM t_assembly_batch b
                               WHERE b.order_part_group_id = g.id AND b.workshop = ?))`);
      params.push(query.workshop, query.workshop);
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
      where.push('COALESCE(a.done_qty, 0) < g.qty_pcs');
    }
    if (query.onlyOverdue) {
      where.push('a.next_plan_date IS NOT NULL AND a.next_plan_date < CURDATE()');
    }

    const fromSql = `
        FROM t_order_part_group g
        JOIN t_order_product p ON p.id = g.order_product_id
        JOIN t_order o         ON o.id = g.order_id
        LEFT JOIN (
              SELECT order_part_group_id                                        AS gid,
                     COUNT(*)                                                   AS batch_count,
                     SUM(qty)                                                   AS planned_qty,
                     SUM(CASE WHEN actual_date IS NOT NULL THEN qty ELSE 0 END) AS done_qty,
                     MIN(CASE WHEN actual_date IS NULL THEN plan_date END)      AS next_plan_date,
                     MAX(actual_date)                                           AS last_actual_date
                FROM t_assembly_batch
               GROUP BY order_part_group_id
             ) a ON a.gid = g.id
       WHERE ${where.join(' AND ')}`;

    const countRows: Array<{ cnt: number | string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt ${fromSql}`,
      params,
    );
    const total = Number(countRows?.[0]?.cnt ?? 0);

    const rows: any[] = await this.dataSource.query(
      `SELECT g.id                AS group_id,
              g.order_id          AS order_id,
              g.order_product_id  AS order_product_id,
              g.group_type        AS group_type,
              g.product_model     AS product_model,
              g.qty_pcs           AS qty_pcs,
              o.order_no          AS order_no,
              o.customer_name     AS customer_name,
              o.order_date        AS order_date,
              p.production_no     AS production_no,
              p.item_no           AS item_no,
              p.material_code     AS material_code,
              p.product_type      AS product_type,
              p.rail_section      AS rail_section,
              p.dimension_raw     AS dimension_raw,
              p.dimension_unit    AS dimension_unit,
              p.dimension_mm      AS dimension_mm,
              p.assembly_workshop AS assembly_workshop,
              p.delivery_date     AS delivery_date,
              COALESCE(a.batch_count, 0) AS batch_count,
              COALESCE(a.planned_qty, 0) AS planned_qty,
              COALESCE(a.done_qty, 0)    AS done_qty,
              a.next_plan_date           AS next_plan_date,
              a.last_actual_date         AS last_actual_date
       ${fromSql}
       ORDER BY (p.delivery_date IS NULL), p.delivery_date ASC, g.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    const today = this.todayText();
    const list: AssemblyGroupRow[] = rows.map((r) => {
      const qtyPcs = Number(r.qty_pcs) || 0;
      const doneQty = Number(r.done_qty) || 0;
      const nextPlanDate = this.dateText(r.next_plan_date);
      return {
        orderPartGroupId: Number(r.group_id),
        orderId: Number(r.order_id),
        orderProductId: Number(r.order_product_id),
        orderNo: r.order_no ?? null,
        customerName: r.customer_name ?? null,
        orderDate: this.dateText(r.order_date),
        productionNo: r.production_no ?? null,
        itemNo: r.item_no ?? null,
        materialCode: r.material_code ?? null,
        productModel: r.product_model ?? null,
        productType: r.product_type ?? null,
        groupType: r.group_type ?? null,
        railSection: r.rail_section ?? null,
        dimensionText: this.dimensionText(r),
        assemblyWorkshop: r.assembly_workshop ?? null,
        deliveryDate: this.dateText(r.delivery_date),
        qtyPcs,
        socket: hasSocket(r.product_type),
        batchCount: Number(r.batch_count) || 0,
        plannedQty: Number(r.planned_qty) || 0,
        doneQty,
        pendingQty: qtyPcs - doneQty,
        nextPlanDate,
        lastActualDate: this.dateText(r.last_actual_date),
        overdue: !!nextPlanDate && nextPlanDate < today,
      };
    });

    return { list, total, page, pageSize };
  }

  /**
   * 某部件组的装配批次明细 + 分边别小计与可入库量。
   * 供装配管理页的批次弹窗与 M4 入库表单下钻使用。
   */
  async findBatches(query: QueryAssemblyBatchDto) {
    if (!query.orderPartGroupId && !query.orderProductId) {
      throw new BadRequestException('请指定部件组或产品行');
    }

    const qb = this.batchRepo.createQueryBuilder('b');
    if (query.orderPartGroupId) {
      qb.andWhere('b.orderPartGroupId = :gid', { gid: query.orderPartGroupId });
    }
    if (query.orderProductId) {
      qb.andWhere('b.orderProductId = :pid', { pid: query.orderProductId });
    }
    if (query.side != null) qb.andWhere('b.side = :side', { side: query.side });
    // 按预计装配区间排：先计划开始、再计划完成，未填计划的沉到最后按录入序
    qb.orderBy('b.planStartDate', 'ASC').addOrderBy('b.planDate', 'ASC').addOrderBy('b.id', 'ASC');
    const list = await qb.getMany();

    // 分边别小计：含卡口按左右各算一份额度，非卡口只有空串一份
    let sides: Array<InboundQuotaRow & { plannedQty: number; sideLabel: string }> = [];
    let group: Awaited<ReturnType<PartGroupSnapshotService['loadOne']>> = null;
    if (query.orderPartGroupId) {
      group = await this.partGroupSnapshot.loadOne(null, query.orderPartGroupId, {
        includeCancelledOrder: true,
      });
      const socket = hasSocket(group?.productType);
      const keys = assemblySides(socket).map((side) => ({
        orderPartGroupId: query.orderPartGroupId as number,
        side,
      }));
      const quota = await loadInboundQuota(this.dataSource.manager, keys);
      sides = keys.map((k) => {
        const row = quota.get(quotaKey(k.orderPartGroupId, k.side)) ?? {
          orderPartGroupId: k.orderPartGroupId,
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
      });
    }

    return {
      group: group
        ? {
            ...group,
            socket: hasSocket(group.productType),
          }
        : null,
      sides,
      list,
    };
  }

  /** 可入库量查询（§4.4 闸门口径，M4 入库表单前置展示；只读不加锁） */
  async findInboundQuota(query: QueryInboundQuotaDto): Promise<InboundQuotaRow> {
    return loadOneInboundQuota(
      this.dataSource.manager,
      query.orderPartGroupId,
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
      const snap = await this.partGroupSnapshot.loadOne(mgr, dto.orderPartGroupId);
      if (!snap) throw new BadRequestException('订单部件组不存在，或所属订单已作废');

      const side = this.assertSide(dto.side, snap.productType, snap.productModel);
      const planStartDate = this.normalizeDate(dto.planStartDate);
      const planDate = this.normalizeDate(dto.planDate);
      const actualDate = this.normalizeDate(dto.actualDate);
      this.assertDates(planStartDate, planDate, actualDate);

      const saved = await mgr.getRepository(AssemblyBatch).save(
        mgr.getRepository(AssemblyBatch).create({
          orderId: snap.orderId,
          orderProductId: snap.orderProductId,
          orderPartGroupId: snap.orderPartGroupId,
          side,
          workshop: dto.workshop?.trim() || snap.assemblyWorkshop || null,
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
      return { id: saved.id, orderPartGroupId: snap.orderPartGroupId, side };
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
      // 统一锁顺序「先锁部件组全部批次行、再改本行」，与 M4 入库确认一致，避免交叉等待死锁
      await loadInboundQuota(
        mgr,
        [{ orderPartGroupId: pre.orderPartGroupId, side: pre.side }],
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
      await this.assertQuotaNonNegative(mgr, batch.orderPartGroupId, batch.side, '修改本批次');
      return { id, orderPartGroupId: batch.orderPartGroupId, side: batch.side };
    });
  }

  /** 删除装配批次：已被成品入库消耗的完成量不得被删掉（§7.14），删后可入库量为负则回滚 */
  async removeBatch(id: number, user: CurrentUserPayload) {
    void user; // 删除动作的审计由 @OperationLog 记录，行本身已物理删除无处落更新人
    return this.dataSource.transaction(async (mgr) => {
      const pre = await mgr.getRepository(AssemblyBatch).findOne({ where: { id } });
      if (!pre) throw new NotFoundException('装配批次不存在');
      await loadInboundQuota(
        mgr,
        [{ orderPartGroupId: pre.orderPartGroupId, side: pre.side }],
        { lock: true },
      );
      const batch = await mgr.getRepository(AssemblyBatch).findOne({ where: { id } });
      if (!batch) throw new NotFoundException('装配批次不存在');

      await mgr.getRepository(AssemblyBatch).delete(id);
      await this.assertQuotaNonNegative(mgr, batch.orderPartGroupId, batch.side, '删除本批次');
      return { id, orderPartGroupId: batch.orderPartGroupId, side: batch.side };
    });
  }

  /* ==================== 校验工具 ==================== */

  /**
   * 闸门复核：可入库量不得为负（§7.14）。
   * 调用前上层已在同事务内对该部件组批次行加锁，此处 lock=false 不重复加锁。
   */
  private async assertQuotaNonNegative(
    mgr: EntityManager,
    orderPartGroupId: number,
    side: string,
    action: string,
  ) {
    const row = await loadOneInboundQuota(mgr, orderPartGroupId, side);
    if (row.quota < 0) {
      const st = side ? `（${sideLabel(side)}边）` : '';
      throw new BadRequestException(
        `${action}后该部件组${st}已完成装配 ${row.assembledQty} 支、已入库 ${row.inboundQty} 支，` +
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

  /** 规格展示：走共享包唯一口径，禁止本地再写一份拼接 */
  private dimensionText(r: any): string | null {
    return formatDimension(r.dimension_raw, r.dimension_unit, r.dimension_mm) || null;
  }
}
