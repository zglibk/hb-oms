import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  FINISHED_BIZ_TYPE,
  FINISHED_DOC_STATUS,
  ORDER_STATUS,
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
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import {
  PartGroupSnapshot,
  PartGroupSnapshotService,
} from '../../common/services/part-group-snapshot.service';
import { NumberGeneratorService } from '../../common/services/number-generator.service';

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
    private readonly partGroupSnapshot: PartGroupSnapshotService,
    private readonly numberGenerator: NumberGeneratorService,
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

  /** 库存查询：余额行 + 订单侧展示信息 */
  async findBalance(query: QueryBalanceDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: string[] = ['1 = 1'];
    const params: Array<string | number> = [];

    // 默认只看有结存；零结存行是历史痕迹，日常不看
    if (query.onlyInStock !== false) where.push('b.quantity <> 0');
    if (query.orderPartGroupId) {
      where.push('b.order_part_group_id = ?');
      params.push(query.orderPartGroupId);
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
                   OR o.order_no LIKE ? OR o.customer_name LIKE ? OR p.production_no LIKE ?)`);
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
              p.production_no AS productionNo
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
        orderPartGroupId: Number(r.order_part_group_id),
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
   * 可出入库的部件组选项：
   * - 入库（inbound）附「可入库量」= Σ已完成装配 − Σ已入库（§4.4 闸门口径）；
   * - 出库（sale_outbound）附当前结存，供选行时看清能发多少。
   */
  async findGroupOptions(query: QueryStockGroupOptionDto) {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
    const params: Array<string | number> = [ORDER_STATUS.CANCELLED];
    let where = ' WHERE o.status <> ?';
    if (query.keyword) {
      where += ` AND (o.order_no LIKE ? OR o.customer_name LIKE ? OR p.production_no LIKE ?
                      OR g.product_model LIKE ? OR p.item_no LIKE ?)`;
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw, kw, kw);
    }
    params.push(limit);

    const rows: any[] = await this.dataSource.query(
      `SELECT g.id AS groupId, g.order_id AS orderId, g.order_product_id AS orderProductId,
              g.group_type AS groupType, g.product_model AS productModel, g.qty_pcs AS qtyPcs,
              o.order_no AS orderNo, o.customer_name AS customerName,
              p.production_no AS productionNo, p.item_no AS itemNo, p.product_type AS productType,
              p.rail_section AS railSection, p.dimension_raw AS dimensionRaw,
              p.dimension_unit AS dimensionUnit, p.dimension_mm AS dimensionMm,
              p.surface_type AS surfaceType, p.color AS color
         FROM t_order_part_group g
         JOIN t_order_product p ON p.id = g.order_product_id
         JOIN t_order o         ON o.id = g.order_id
         ${where}
        ORDER BY g.id DESC
        LIMIT ?`,
      params,
    );
    if (!rows.length) return [];

    const groupIds = rows.map((r) => Number(r.groupId));
    const snaps = await this.partGroupSnapshot.load(null, groupIds);

    // 每个组按其卡口口径展开 side，附额度/结存
    const keys: Array<{ orderPartGroupId: number; side: string }> = [];
    rows.forEach((r) => {
      const socket = hasSocket(r.productType);
      (socket ? ['left', 'right'] : ['']).forEach((side) =>
        keys.push({ orderPartGroupId: Number(r.groupId), side }),
      );
    });
    const quota = await loadInboundQuota(this.dataSource.manager, keys);
    const balances = await this.loadBalanceMap(this.dataSource.manager, keys);

    return rows.map((r) => {
      const gid = Number(r.groupId);
      const socket = hasSocket(r.productType);
      const sides = (socket ? ['left', 'right'] : ['']).map((side) => {
        const q = quota.get(quotaKey(gid, side));
        return {
          side,
          sideLabel: sideLabel(side),
          assembledQty: q?.assembledQty ?? 0,
          inboundQty: q?.inboundQty ?? 0,
          /** 可入库量（入库时的硬上限） */
          quota: q?.quota ?? 0,
          /** 当前结存（出库时的硬上限） */
          stockQty: balances.get(quotaKey(gid, side))?.quantity ?? 0,
        };
      });
      return {
        orderPartGroupId: gid,
        orderId: Number(r.orderId),
        orderProductId: Number(r.orderProductId),
        orderNo: r.orderNo ?? null,
        customerName: r.customerName ?? null,
        productionNo: r.productionNo ?? null,
        itemNo: r.itemNo ?? null,
        productModel: r.productModel ?? null,
        productType: r.productType ?? null,
        groupType: r.groupType ?? null,
        dimensionText: snaps.get(gid)?.dimensionText ?? null,
        surfaceType: r.surfaceType ?? null,
        color: r.color ?? null,
        qtyPcs: Number(r.qtyPcs) || 0,
        socket,
        sides,
      };
    });
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
          machineNo: dto.machineNo ?? null,
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
        machineNo: dto.machineNo ?? null,
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
   * 1. **装配入库闸门**（仅 biz_type='inbound'）：按 (部件组, side) 校验
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
      return { id, status: FINISHED_DOC_STATUS.CONFIRMED };
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

      return { id: redDoc.id, docNo, originDocId: origin.id };
    });
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
      const key = this.balanceKey(it.orderPartGroupId, it.side, it.batchNo, this.attrKeyOf(it));
      const prev = merged.get(key);
      if (prev) prev.qty += it.quantity || 0;
      else merged.set(key, { item: it, qty: it.quantity || 0 });
    });

    // 1) 装配入库闸门：仅生产入库校验；期初与红字豁免（§4.5）
    if (doc.bizType === FINISHED_BIZ_TYPE.INBOUND) {
      const byGroupSide = new Map<
        string,
        { groupId: number; side: string; qty: number; item: FinishedItem }
      >();
      merged.forEach(({ item, qty }) => {
        if (item.orderPartGroupId <= 0) return;
        const k = quotaKey(item.orderPartGroupId, item.side);
        const cur = byGroupSide.get(k);
        if (cur) cur.qty += qty;
        else byGroupSide.set(k, { groupId: item.orderPartGroupId, side: item.side, qty, item });
      });
      if (byGroupSide.size) {
        const quota = await loadInboundQuota(
          mgr,
          [...byGroupSide.values()].map((v) => ({ orderPartGroupId: v.groupId, side: v.side })),
          { lock: true },
        );
        for (const v of byGroupSide.values()) {
          const q = quota.get(quotaKey(v.groupId, v.side));
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

  /** 取余额行并加行锁；不存在则先建一行 0 结存再锁（唯一键兜底并发重复插入） */
  private async lockOrCreateBalance(mgr: EntityManager, item: FinishedItem): Promise<FinishedBalance> {
    const attrKey = this.attrKeyOf(item);
    const where = {
      orderPartGroupId: item.orderPartGroupId,
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
          'b.orderPartGroupId = :g AND b.side = :s AND b.batchNo = :b AND b.attrKey = :a',
          { g: where.orderPartGroupId, s: where.side, b: where.batchNo, a: attrKey },
        )
        .getOne();

    const existing = await find();
    if (existing) return existing;

    try {
      await mgr.getRepository(FinishedBalance).insert({
        orderId: item.orderId,
        orderProductId: item.orderProductId,
        orderPartGroupId: item.orderPartGroupId,
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

  /**
   * 纯属性行（不挂订单）的属性指纹；挂订单的行恒为空串。
   * 供 M5 期初纯属性录入复用——挂订单的行靠部件组唯一，属性行只能靠属性唯一。
   */
  private attrKeyOf(item: FinishedItem): string {
    if (item.orderPartGroupId > 0) return '';
    return [
      item.itemNo ?? '',
      item.productType ?? '',
      item.groupType ?? '',
      item.railSection ?? '',
      String(item.dimensionMm ?? 0),
      item.surfaceType ?? '',
      item.color ?? '',
    ].join('|');
  }

  private balanceKey(groupId: number, side: string, batchNo: string, attrKey: string): string {
    return `${groupId}#${side ?? ''}#${batchNo ?? ''}#${attrKey}`;
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

  /** 按 (部件组, side) 取余额（batch 默认空串），供选项接口展示当前结存 */
  private async loadBalanceMap(
    mgr: EntityManager,
    keys: Array<{ orderPartGroupId: number; side: string }>,
  ) {
    const map = new Map<string, { quantity: number }>();
    const ids = [...new Set(keys.map((k) => k.orderPartGroupId))].filter((v) => v > 0);
    if (!ids.length) return map;
    const rows: any[] = await mgr.query(
      `SELECT order_part_group_id AS gid, side, SUM(quantity) AS qty
         FROM t_finished_balance
        WHERE order_part_group_id IN (${ids.map(() => '?').join(',')})
        GROUP BY order_part_group_id, side`,
      ids,
    );
    rows.forEach((r) =>
      map.set(quotaKey(Number(r.gid), r.side ?? ''), { quantity: Number(r.qty) || 0 }),
    );
    return map;
  }

  /* ==================== 内部：明细落库 ==================== */

  private async writeItems(
    mgr: EntityManager,
    docId: number,
    items: CreateFinishedDocDto['items'],
  ) {
    const groupIds = items.map((it) => it.orderPartGroupId);
    const snapshots = await this.partGroupSnapshot.load(mgr, groupIds);

    const seen = new Set<string>();
    const rows = items.map((it, i) => {
      const snap = snapshots.get(it.orderPartGroupId);
      if (!snap) {
        throw new BadRequestException(`第 ${i + 1} 行明细：订单部件组不存在或订单已作废`);
      }
      const side = this.assertSide(it.side, snap, i);
      const batchNo = (it.batchNo ?? '').trim();
      const key = `${it.orderPartGroupId}#${side}#${batchNo}`;
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
        orderPartGroupId: snap.orderPartGroupId,
        orderNo: snap.orderNo,
        customerName: snap.customerName,
        productionNo: snap.productionNo,
        itemNo: snap.itemNo,
        productModel: snap.productModel,
        productType: snap.productType,
        groupType: snap.groupType,
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
      orderPartGroupId: src.orderPartGroupId,
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

  private assertSide(side: string | undefined, snap: PartGroupSnapshot, index: number): string {
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
