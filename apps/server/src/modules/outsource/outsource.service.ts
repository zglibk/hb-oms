import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  BLANK_NO_WIDTH,
  ORDER_STATUS,
  OUTSOURCE_STATUS,
  SURFACE_NONE,
  deriveOutsourceStatus,
  formatDimension,
  needsOutsource,
} from '@hb-oms/shared';
import { OutsourceDoc } from './entities/outsource-doc.entity';
import { OutsourceItem } from './entities/outsource-item.entity';
import { OutsourceReturn } from './entities/outsource-return.entity';
import {
  CloseOutsourceDto,
  CreateOutsourceDto,
  CreateOutsourceReturnDto,
  QueryOutsourceDto,
  QueryPartGroupOptionDto,
  SendOutsourceDto,
  UpdateOutsourceDto,
  UpdateOutsourceItemDto,
} from './dto/outsource.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate, auditDisplayName } from '../../common/utils/audit.util';
import { NumberGeneratorService } from '../../common/services/number-generator.service';
import { PartGroupSnapshotService } from '../../common/services/part-group-snapshot.service';

/** 发坯单号采番 key：全局序号、不按日期重置（设计文档 §4.7） */
const BLANK_NO_SEQ_KEY = 'BLANK_NO';

/** 可发外部件组行（供表单选择器） */
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
  /** 组需求支数 */
  qtyPcs: number;
  /** 已发外支数（全部未作废发坯单合计） */
  sentQty: number;
  /** 剩余可发支数 = 组需求 − 已发外（可为 0，界面照常可选以支持超发场景） */
  remainQty: number;
  /** 单重（kg/支）：自部件信息（t_material.unit_weight）带出，无则 0 */
  unitWeight: number;
}

@Injectable()
export class OutsourceService {
  constructor(
    @InjectRepository(OutsourceDoc) private readonly docRepo: Repository<OutsourceDoc>,
    @InjectRepository(OutsourceItem) private readonly itemRepo: Repository<OutsourceItem>,
    @InjectRepository(OutsourceReturn) private readonly returnRepo: Repository<OutsourceReturn>,
    private readonly dataSource: DataSource,
    private readonly numberGenerator: NumberGeneratorService,
    private readonly partGroupSnapshot: PartGroupSnapshotService,
  ) {}

  /* ==================== 查询 ==================== */

  async findList(query: QueryOutsourceDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.docRepo.createQueryBuilder('d');
    if (query.status != null) qb.andWhere('d.status = :st', { st: query.status });
    if (query.surfaceType) qb.andWhere('d.surfaceType = :sf', { sf: query.surfaceType });
    if (query.dateFrom) qb.andWhere('d.planSendDate >= :df', { df: query.dateFrom });
    if (query.dateTo) qb.andWhere('d.planSendDate <= :dt', { dt: query.dateTo });
    if (query.keyword) {
      // 生产单号/产品型号在明细行，用子查询命中后回联单头
      qb.andWhere(
        `(d.blankNo LIKE :kw OR d.processorName LIKE :kw OR d.color LIKE :kw
          OR d.id IN (SELECT i.doc_id FROM t_outsource_item i
                      WHERE i.production_no LIKE :kw OR i.product_model LIKE :kw OR i.order_no LIKE :kw))`,
        { kw: `%${query.keyword}%` },
      );
    }
    qb.orderBy('d.id', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [docs, total] = await qb.getManyAndCount();

    // 批量挂明细汇总（列表展开行与进度列用）
    const docIds = docs.map((d) => d.id);
    const items = docIds.length
      ? await this.itemRepo.find({ where: { docId: In(docIds) }, order: { sort: 'ASC', id: 'ASC' } })
      : [];
    const itemsByDoc = new Map<number, OutsourceItem[]>();
    items.forEach((it) => {
      const arr = itemsByDoc.get(it.docId) ?? [];
      arr.push(it);
      itemsByDoc.set(it.docId, arr);
    });

    return {
      list: docs.map((d) => {
        const its = itemsByDoc.get(d.id) ?? [];
        return Object.assign(d, {
          items: its,
          itemCount: its.length,
          totalSendQty: its.reduce((s, it) => s + (it.sendQty || 0), 0),
          totalReturnedQty: its.reduce((s, it) => s + (it.returnedQty || 0), 0),
          totalSendWeight: this.sumDecimal(its.map((it) => it.sendWeight)),
        });
      }),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: number) {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('发坯单不存在');
    const items = await this.itemRepo.find({ where: { docId: id }, order: { sort: 'ASC', id: 'ASC' } });
    const returns = await this.returnRepo.find({ where: { docId: id }, order: { backDate: 'ASC', id: 'ASC' } });
    const returnsByItem = new Map<number, OutsourceReturn[]>();
    returns.forEach((r) => {
      const arr = returnsByItem.get(r.itemId) ?? [];
      arr.push(r);
      returnsByItem.set(r.itemId, arr);
    });
    // 组需求量与「他单已发数」：编辑表单需要这两个数才能对照超发，
    // 口径与选择器 findPartGroupOptions 一致（排除本单，已作废单不占额度）
    const quota = await this.loadGroupSendQuota(
      items.map((it) => it.orderPartGroupId),
      id,
    );
    return Object.assign(doc, {
      items: items.map((it) => {
        const q = quota.get(it.orderPartGroupId);
        return Object.assign(it, {
          returns: returnsByItem.get(it.id) ?? [],
          qtyPcs: q?.qtyPcs ?? 0,
          sentQty: q?.sentQty ?? 0,
        });
      }),
    });
  }

  /**
   * 部件组的「组需求支数」与「他单已发支数」。
   * excludeDocId 排除本单自身的明细，避免编辑时自己挤占自己的额度
   * （与 findPartGroupOptions 的 excludeDocId 同一口径）。
   */
  private async loadGroupSendQuota(groupIds: number[], excludeDocId?: number) {
    const map = new Map<number, { qtyPcs: number; sentQty: number }>();
    const ids = [...new Set(groupIds.filter((v) => Number.isInteger(v) && v > 0))];
    if (!ids.length) return map;
    const params: Array<number | string> = [OUTSOURCE_STATUS.CANCELLED];
    let excludeSql = '';
    if (excludeDocId) {
      excludeSql = ' AND oi.doc_id <> ?';
      params.push(excludeDocId);
    }
    params.push(...ids);
    const rows: any[] = await this.dataSource.query(
      `SELECT g.id      AS group_id,
              g.qty_pcs AS qty_pcs,
              COALESCE((SELECT SUM(oi.send_qty) FROM t_outsource_item oi
                         JOIN t_outsource_doc od ON od.id = oi.doc_id
                        WHERE oi.order_part_group_id = g.id AND od.status <> ?${excludeSql}), 0)
                        AS sent_qty
         FROM t_order_part_group g
        WHERE g.id IN (${ids.map(() => '?').join(',')})`,
      params,
    );
    rows.forEach((r) => {
      map.set(Number(r.group_id), {
        qtyPcs: Number(r.qty_pcs) || 0,
        sentQty: Number(r.sent_qty) || 0,
      });
    });
    return map;
  }

  /**
   * 可发外部件组：表面处理非 none 的订单产品行下的部件组，
   * 附已发外数量（全部未作废发坯单合计）与剩余可发数、单重（自部件信息带出）。
   * 已作废单（status=9）不占用额度；编辑时可用 excludeDocId 排除本单旧明细。
   */
  async findPartGroupOptions(query: QueryPartGroupOptionDto): Promise<PartGroupOption[]> {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
    const params: any[] = [OUTSOURCE_STATUS.CANCELLED];
    let excludeSql = '';
    if (query.excludeDocId) {
      excludeSql = ' AND oi.doc_id <> ?';
      params.push(query.excludeDocId);
    }
    // 订单状态：仅进行中/已完结可发外，已作废订单排除
    params.push(ORDER_STATUS.CANCELLED);
    let where = ' WHERE o.status <> ? AND p.surface_type <> ?';
    params.push(SURFACE_NONE);
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
      `SELECT g.id                AS orderPartGroupId,
              g.order_id          AS orderId,
              g.order_product_id  AS orderProductId,
              o.order_no          AS orderNo,
              o.customer_name     AS customerName,
              o.production_no     AS productionNo,
              g.product_model     AS productModel,
              p.dimension_raw     AS dimensionRaw,
              p.dimension_unit    AS dimensionUnit,
              p.dimension_mm      AS dimensionMm,
              p.surface_type      AS surfaceType,
              p.color             AS color,
              g.qty_pcs           AS qtyPcs,
              m.unit_weight       AS unitWeight,
              (SELECT MIN(pt.cycle_code) FROM t_order_part pt
                WHERE pt.part_group_id = g.id AND pt.cycle_code IS NOT NULL AND pt.cycle_code <> '')
                                  AS cycleCode,
              COALESCE((SELECT SUM(oi.send_qty) FROM t_outsource_item oi
                         JOIN t_outsource_doc od ON od.id = oi.doc_id
                        WHERE oi.order_part_group_id = g.id AND od.status <> ?${excludeSql}), 0)
                                  AS sentQty
         FROM t_order_part_group g
         JOIN t_order_product p ON p.id = g.order_product_id
         JOIN t_order o         ON o.id = g.order_id
         LEFT JOIN t_material m ON m.id = p.material_id
         ${where}
        ORDER BY g.id DESC
        LIMIT ?`,
      params,
    );

    return rows.map((r) => {
      const qtyPcs = Number(r.qtyPcs) || 0;
      const sentQty = Number(r.sentQty) || 0;
      return {
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
        qtyPcs,
        sentQty,
        remainQty: Math.max(qtyPcs - sentQty, 0),
        unitWeight: Number(r.unitWeight) || 0,
      };
    });
  }

  /** 打印数据：单头 + 明细 + 合计（前端 A4 排版渲染） */
  async findPrintData(id: number) {
    const doc = await this.findOne(id);
    const items = (doc as any).items as OutsourceItem[];
    return Object.assign(doc, {
      totalSendQty: items.reduce((s, it) => s + (it.sendQty || 0), 0),
      totalSendWeight: this.sumDecimal(items.map((it) => it.sendWeight)),
    });
  }

  /* ==================== 建单 / 编辑 ==================== */

  async create(dto: CreateOutsourceDto, user: CurrentUserPayload) {
    this.assertSurfaceType(dto.surfaceType);
    return this.dataSource.transaction(async (mgr) => {
      const blankNo = await this.numberGenerator.generatePaddedSequence(
        BLANK_NO_SEQ_KEY,
        BLANK_NO_WIDTH,
        mgr,
      );
      const doc = await mgr.getRepository(OutsourceDoc).save(
        mgr.getRepository(OutsourceDoc).create({
          blankNo,
          processorName: dto.processorName,
          surfaceType: dto.surfaceType,
          color: dto.color ?? null,
          planSendDate: dto.planSendDate ?? null,
          requireBackDate: dto.requireBackDate ?? null,
          actualSendDate: null,
          status: OUTSOURCE_STATUS.PENDING,
          remark: dto.remark ?? null,
          ...auditOnCreate(user),
        }),
      );
      await this.writeItems(mgr, doc.id, dto.items, auditOnCreate(user));
      return { id: doc.id, blankNo };
    });
  }

  /**
   * 编辑：仅「待发出」可改（已发出后明细数量变动会破坏回货口径，须先作废重开单）。
   * 明细整体重建，故已有回货登记的单不可能走到这里（有回货必已发出）。
   */
  async update(id: number, dto: UpdateOutsourceDto, user: CurrentUserPayload) {
    const doc = await this.mustGet(id);
    if (doc.status !== OUTSOURCE_STATUS.PENDING) {
      throw new BadRequestException('仅「待发出」状态的发坯单可编辑；已发出的单请先作废后重新建单');
    }
    this.assertSurfaceType(dto.surfaceType);
    return this.dataSource.transaction(async (mgr) => {
      await mgr.getRepository(OutsourceDoc).update(id, {
        processorName: dto.processorName,
        surfaceType: dto.surfaceType,
        color: dto.color ?? null,
        planSendDate: dto.planSendDate ?? null,
        requireBackDate: dto.requireBackDate ?? null,
        remark: dto.remark ?? null,
        ...auditOnUpdate(user),
      });
      await mgr.getRepository(OutsourceItem).delete({ docId: id });
      // 明细整体重建：创建人沿用单头（谁开的这张单），更新人记本次编辑者
      await this.writeItems(mgr, id, dto.items, {
        creatorId: doc.creatorId,
        creatorName: doc.creatorName,
        ...auditOnUpdate(user),
      });
      return { id };
    });
  }

  /**
   * 发出明细数量修正（设计文档 §7.3）：已发出后磅秤复核、折算纠错的场景。
   * 只改数量口径与备注（不动锚点、不增删行），改完立即重算回齐状态——
   * 下调发出数可能使原「部分回货」变为「已回齐」，上调则反向回退。
   */
  async updateItem(itemId: number, dto: UpdateOutsourceItemDto, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const item = await mgr
        .getRepository(OutsourceItem)
        .createQueryBuilder('i')
        .setLock('pessimistic_write')
        .where('i.id = :id', { id: itemId })
        .getOne();
      if (!item) throw new NotFoundException('发出明细行不存在');

      const doc = await this.mustGet(item.docId, mgr);
      if (doc.status === OUTSOURCE_STATUS.CANCELLED) {
        throw new BadRequestException('发坯单已作废，不能修改发出数量');
      }
      // 行级人工改数：只动更新人（这行是谁修正的），保留原录入人
      await mgr.getRepository(OutsourceItem).update(itemId, {
        ...auditOnUpdate(user),
        sendWeight: String(dto.sendWeight ?? 0),
        unitWeight: String(dto.unitWeight ?? 0),
        sendQty: dto.sendQty,
        remark: dto.remark ?? null,
      });
      await this.refreshItemAndDoc(mgr, item.docId, itemId, user);
      return { docId: item.docId, itemId };
    });
  }

  /** 明细落库：展示快照一律服务端从订单侧读取，不采信客户端传值 */
  private async writeItems(
    mgr: EntityManager,
    docId: number,
    items: CreateOutsourceDto['items'],
    audit: {
      creatorId: number | null;
      creatorName: string | null;
      updaterId: number;
      updaterName: string | null;
    },
  ) {
    const groupIds = items.map((it) => it.orderPartGroupId);
    const dupe = groupIds.find((gid, i) => groupIds.indexOf(gid) !== i);
    if (dupe) {
      throw new BadRequestException('同一张发坯单内同一部件组不能重复添加，请合并该行数量');
    }
    const snapshots = await this.partGroupSnapshot.load(mgr, groupIds);
    const rows = items.map((it, i) => {
      const snap = snapshots.get(it.orderPartGroupId);
      if (!snap) {
        throw new BadRequestException(`第 ${i + 1} 行明细：订单部件组不存在或订单已作废`);
      }
      // 表面处理为空/none 均视为不外发（共享包 needsOutsource 唯一口径）
      if (!needsOutsource(snap.surfaceType)) {
        throw new BadRequestException(
          `第 ${i + 1} 行明细：产品「${snap.productModel ?? ''}」表面处理为「无」，无需外发`,
        );
      }
      return mgr.getRepository(OutsourceItem).create({
        ...audit,
        docId,
        orderId: snap.orderId,
        orderProductId: snap.orderProductId,
        orderPartGroupId: it.orderPartGroupId,
        orderNo: snap.orderNo,
        customerName: snap.customerName,
        productionNo: snap.productionNo,
        productModel: snap.productModel,
        dimensionText: snap.dimensionText,
        cycleCode: snap.cycleCode,
        sendWeight: String(it.sendWeight ?? 0),
        unitWeight: String(it.unitWeight ?? 0),
        sendQty: it.sendQty,
        returnedQty: 0,
        remark: it.remark ?? null,
        sort: it.sort ?? i,
      });
    });
    await mgr.getRepository(OutsourceItem).save(rows);
  }

  private assertSurfaceType(surfaceType: string) {
    if (!surfaceType || surfaceType === SURFACE_NONE) {
      throw new BadRequestException('表面处理不能为「无」，外发单必须指定表面处理方式');
    }
  }

  /* ==================== 状态机 ==================== */

  /** 登记实际发外日期：1待发出 → 2已发出 */
  async send(id: number, dto: SendOutsourceDto, user: CurrentUserPayload) {
    const doc = await this.mustGet(id);
    if (doc.status === OUTSOURCE_STATUS.CANCELLED) {
      throw new BadRequestException('发坯单已作废，不能登记发出');
    }
    if (doc.status !== OUTSOURCE_STATUS.PENDING) {
      throw new BadRequestException('该发坯单已登记发出，不能重复登记');
    }
    const itemCount = await this.itemRepo.count({ where: { docId: id } });
    if (!itemCount) throw new BadRequestException('发坯单没有发出明细，不能登记发出');
    await this.docRepo.update(id, {
      actualSendDate: dto.actualSendDate,
      status: OUTSOURCE_STATUS.SENT,
      ...auditOnUpdate(user),
    });
    return { id, status: OUTSOURCE_STATUS.SENT };
  }

  /** 手工关闭：3部分回货 → 4已回齐（尾数不回/损耗核销），原因必填 */
  async close(id: number, dto: CloseOutsourceDto, user: CurrentUserPayload) {
    const doc = await this.mustGet(id);
    if (doc.status !== OUTSOURCE_STATUS.PARTIAL_RETURNED) {
      throw new BadRequestException('仅「部分回货」状态的发坯单可手工关闭为已回齐');
    }
    await this.docRepo.update(id, {
      status: OUTSOURCE_STATUS.RETURNED_ALL,
      closeReason: dto.closeReason,
      ...auditOnUpdate(user),
    });
    return { id, status: OUTSOURCE_STATUS.RETURNED_ALL };
  }

  /** 作废：仅未发出且无回货登记时允许（§7.3） */
  async cancel(id: number, user: CurrentUserPayload) {
    const doc = await this.mustGet(id);
    if (doc.status === OUTSOURCE_STATUS.CANCELLED) {
      throw new BadRequestException('发坯单已作废');
    }
    const returnCount = await this.returnRepo.count({ where: { docId: id } });
    if (returnCount > 0) {
      throw new BadRequestException(
        `该发坯单已有 ${returnCount} 条回货登记，禁止作废；请先撤销全部回货登记`,
      );
    }
    if (doc.status !== OUTSOURCE_STATUS.PENDING) {
      throw new BadRequestException('已发出的发坯单不能作废；如需处理尾数请使用「关闭」');
    }
    await this.docRepo.update(id, { status: OUTSOURCE_STATUS.CANCELLED, ...auditOnUpdate(user) });
    return { id, status: OUTSOURCE_STATUS.CANCELLED };
  }

  /* ==================== 回货登记 ==================== */

  /**
   * 登记一条回货：写流水 → 回写明细累计回货数 → 重算单头状态（2→3→4）。
   * 回货数允许超过发出数（重量折算误差，§7.6），后端不拦截，由界面提示。
   * 全程在事务内并对明细行加锁，防并发重复登记导致累计数错乱。
   */
  async createReturn(itemId: number, dto: CreateOutsourceReturnDto, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const item = await mgr
        .getRepository(OutsourceItem)
        .createQueryBuilder('i')
        .setLock('pessimistic_write')
        .where('i.id = :id', { id: itemId })
        .getOne();
      if (!item) throw new NotFoundException('发出明细行不存在');

      const doc = await this.mustGet(item.docId, mgr);
      if (doc.status === OUTSOURCE_STATUS.CANCELLED) {
        throw new BadRequestException('发坯单已作废，不能登记回货');
      }
      if (doc.status === OUTSOURCE_STATUS.PENDING) {
        throw new BadRequestException('发坯单尚未登记发出，不能登记回货');
      }

      await mgr.getRepository(OutsourceReturn).save(
        mgr.getRepository(OutsourceReturn).create({
          docId: item.docId,
          itemId: item.id,
          backDate: dto.backDate,
          returnWeight: String(dto.returnWeight ?? 0),
          unitWeight: String(dto.unitWeight ?? 0),
          returnQty: dto.returnQty,
          remark: dto.remark ?? null,
          creatorId: user.id,
          creatorName: auditDisplayName(user) || null,
        }),
      );
      await this.refreshItemAndDoc(mgr, item.docId, item.id, user);
      return { docId: item.docId, itemId: item.id };
    });
  }

  /** 撤销回货登记：删流水 → 回写累计数 → 状态自动回退（§7.6） */
  async removeReturn(returnId: number, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const row = await mgr.getRepository(OutsourceReturn).findOne({ where: { id: returnId } });
      if (!row) throw new NotFoundException('回货登记不存在');
      const doc = await this.mustGet(row.docId, mgr);
      if (doc.status === OUTSOURCE_STATUS.CANCELLED) {
        throw new BadRequestException('发坯单已作废，不能撤销回货登记');
      }
      await mgr.getRepository(OutsourceReturn).delete(returnId);
      await this.refreshItemAndDoc(mgr, row.docId, row.itemId, user);
      return { docId: row.docId, itemId: row.itemId };
    });
  }

  /**
   * 重算明细累计回货数与单头状态。
   * 单头状态一律由共享包 deriveOutsourceStatus 派生（前后端同一口径）；
   * 手工关闭（closeReason 非空）时不因回货撤销而回退到部分回货——
   * 关闭是人工决定的终态，只有回货被全部撤销到零才解除。
   */
  private async refreshItemAndDoc(
    mgr: EntityManager,
    docId: number,
    itemId: number,
    user: CurrentUserPayload,
  ) {
    const sum: Array<{ total: string | null }> = await mgr.query(
      'SELECT SUM(return_qty) AS total FROM t_outsource_return WHERE item_id = ?',
      [itemId],
    );
    const returnedQty = Number(sum?.[0]?.total ?? 0) || 0;
    await mgr.getRepository(OutsourceItem).update(itemId, { returnedQty });

    const doc = await mgr.getRepository(OutsourceDoc).findOne({ where: { id: docId } });
    if (!doc) return;
    const items = await mgr.getRepository(OutsourceItem).find({ where: { docId } });
    const derived = deriveOutsourceStatus(
      !!doc.actualSendDate,
      items.map((it) => ({ sendQty: it.sendQty, returnedQty: it.returnedQty })),
    );
    const hadManualClose = !!doc.closeReason;
    // 人工关闭后又新增回货：仍保持已回齐；回货全撤销（派生回落已发出）才清除关闭原因
    const nextStatus =
      hadManualClose && derived === OUTSOURCE_STATUS.PARTIAL_RETURNED
        ? OUTSOURCE_STATUS.RETURNED_ALL
        : derived;
    const clearClose = hadManualClose && derived === OUTSOURCE_STATUS.SENT;
    await mgr.getRepository(OutsourceDoc).update(docId, {
      status: nextStatus,
      ...(clearClose ? { closeReason: null } : {}),
      ...auditOnUpdate(user),
    });
  }

  /* ==================== 工具 ==================== */

  private async mustGet(id: number, mgr?: EntityManager): Promise<OutsourceDoc> {
    const repo = mgr ? mgr.getRepository(OutsourceDoc) : this.docRepo;
    const doc = await repo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('发坯单不存在');
    return doc;
  }

  /** decimal 列（TypeORM 返回字符串）求和，保留两位小数 */
  private sumDecimal(values: Array<string | number | null | undefined>): number {
    const sum = values.reduce<number>((s, v) => s + (Number(v) || 0), 0);
    return Math.round(sum * 100) / 100;
  }
}
