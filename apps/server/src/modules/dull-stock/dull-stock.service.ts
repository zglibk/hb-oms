import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  STOCK_DIRECTION,
  UNIT_OPTIONS,
  formatProductModel,
  normalizeProductTypes,
  toPieces,
} from '@hb-oms/shared';
import { DullStock } from './entities/dull-stock.entity';
import { DullStockFlow } from './entities/dull-stock-flow.entity';
import {
  CreateDullStockDto,
  CreateDullStockFlowDto,
  QueryDullStockDto,
  QueryDullStockFlowDto,
  UpdateDullStockDto,
} from './dto/dull-stock.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate, auditDisplayName } from '../../common/utils/audit.util';

/** 单位中文名（用于报错文案） */
function unitLabel(unit: string): string {
  return UNIT_OPTIONS.find((o) => o.value === unit)?.label ?? '支';
}

/**
 * 呆滞品管理（2026-08-11 由「成品期初（不挂订单）」拆分独立）。
 *
 * **独立台账，与订单跟踪台账四数、成品库存完全不联动**——呆滞品是已完结订单剩下的成品，
 * 不再归属任何订单，它的出入库不影响任何订单的欠数，也不进 `/stock-balance`。
 *
 * 四个数：`结存数 = 期初数 + 入库数 − 出库数`。
 * 期初数在建档/编辑时录入；入库数与出库数**只由 `createFlow` / `removeFlow` 驱动**，
 * 任何地方都不得直接写这两列（§4.6「不直接改数无痕」）。
 *
 * 所有改数路径都在事务内先对档案行 `SELECT … FOR UPDATE`，再算新值、判负、落库，
 * 防并发累加丢失；结存为负一律整笔回滚。
 */
@Injectable()
export class DullStockService {
  constructor(
    @InjectRepository(DullStock) private readonly repo: Repository<DullStock>,
    @InjectRepository(DullStockFlow) private readonly flowRepo: Repository<DullStockFlow>,
    private readonly dataSource: DataSource,
  ) {}

  /* ==================== 查询 ==================== */

  async findList(query: QueryDullStockDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repo.createQueryBuilder('d');

    // 默认只看有结存；清空的呆滞品是历史痕迹，日常不看但要能查出来
    if (query.onlyInStock !== false) qb.andWhere('d.balanceQty <> 0');
    if (query.surfaceType) qb.andWhere('d.surfaceType = :st', { st: query.surfaceType });
    if (query.side != null) qb.andWhere('d.side = :sd', { sd: query.side });
    if (query.keyword) {
      qb.andWhere(
        `(d.itemNo LIKE :kw OR d.productModel LIKE :kw
          OR d.customerName LIKE :kw OR d.productionNo LIKE :kw)`,
        { kw: `%${query.keyword}%` },
      );
    }
    qb.orderBy('d.itemNo', 'ASC')
      .addOrderBy('d.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 当前筛选条件下的行数与结存合计（页面汇总用）。
   *
   * 各行单位可能不同（套/支），直接相加没有意义，故一律用共享包 `toPieces`
   * **折成支**再汇总——§5.3「全局数量以支为准」在汇总口径上仍然成立。
   */
  async findSummary(query: QueryDullStockDto) {
    const all = await this.findList({ ...query, page: 1, pageSize: 100000 });
    return {
      rows: all.total,
      totalBalancePcs: all.list.reduce((s, r) => s + toPieces(r.balanceQty, r.unit), 0),
    };
  }

  /**
   * 某档案的出入库流水（最新在前），逐行附「变动后结存」。
   *
   * **变动后结存刻意不落库**：流水允许整条删除，存了快照就会在删掉中间一笔后
   * 让后续所有行的快照集体失真、还得回填。改为在这里按 `id ASC`
   * 从档案期初数累计推导，永远与档案的四个数自洽。
   * 一个档案的流水数以十计，全量取回再推导的开销可以忽略。
   */
  async findFlowList(query: QueryDullStockFlowDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    if (!query.dullId) throw new BadRequestException('请指定要查看流水的呆滞品');
    const doc = await this.mustGet(query.dullId);

    const asc = await this.flowRepo.find({ where: { dullId: doc.id }, order: { id: 'ASC' } });
    let running = doc.openingQty || 0;
    const derived = asc.map((f) => {
      running += f.direction * f.quantity;
      return Object.assign(f, { balanceAfter: running });
    });

    const list = derived.reverse();
    return {
      list: list.slice((page - 1) * pageSize, page * pageSize),
      total: list.length,
      page,
      pageSize,
    };
  }

  async findOne(id: number) {
    return this.mustGet(id);
  }

  /* ==================== 档案 ==================== */

  async create(dto: CreateDullStockDto, user: CurrentUserPayload) {
    const attrs = this.normalizeAttrs(dto);
    const row = await this.repo.save(
      this.repo.create({
        ...attrs,
        unit: dto.unit,
        openingQty: dto.openingQty,
        inboundQty: 0,
        outboundQty: 0,
        // 建档时还没有任何流水，结存即期初
        balanceQty: dto.openingQty,
        ...auditOnCreate(user),
      }),
    );
    return { id: row.id, balanceQty: row.balanceQty };
  }

  /**
   * 编辑档案：属性与期初数可改，入库数/出库数不在此列（它们是流水累计值）。
   * 改了期初数要重算结存并复核不得为负。
   */
  async update(id: number, dto: UpdateDullStockDto, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const row = await this.lockRow(mgr, id);
      const flowCount = await mgr.getRepository(DullStockFlow).count({ where: { dullId: id } });

      // 单位一改，历史流水记的数含义就变了（20 套 ≠ 20 支），故有流水后锁死
      if (dto.unit !== row.unit && flowCount > 0) {
        throw new BadRequestException(
          `该呆滞品已有 ${flowCount} 笔出入库流水，单位不能再改；` +
            `如需换单位请先删除流水，或另建一条呆滞品记录`,
        );
      }

      const balanceQty = dto.openingQty + (row.inboundQty || 0) - (row.outboundQty || 0);
      if (balanceQty < 0) {
        throw new BadRequestException(
          `期初数改为 ${dto.openingQty} 后结存为 ${balanceQty}（入库 ${row.inboundQty}、出库 ${row.outboundQty}），结存不能为负`,
        );
      }

      await mgr.getRepository(DullStock).update(id, {
        ...this.normalizeAttrs(dto),
        unit: dto.unit,
        openingQty: dto.openingQty,
        balanceQty,
        ...auditOnUpdate(user),
      });
      return { id, balanceQty };
    });
  }

  /**
   * 删除档案：**有出入库流水时禁止**（照 §5.5「被业务引用后限制删除」）。
   * 直接连流水一起删会让已发生的出入库凭空消失，账对不上还查不出所以然。
   */
  async remove(id: number) {
    const row = await this.mustGet(id);
    const flowCount = await this.flowRepo.count({ where: { dullId: id } });
    if (flowCount > 0) {
      throw new BadRequestException(
        `呆滞品「${row.itemNo}」已有 ${flowCount} 笔出入库流水，不能删除；请先在展开行里删除这些流水`,
      );
    }
    await this.repo.delete(id);
    return { id };
  }

  /* ==================== 出入库流水（入库数/出库数的唯一写入口） ==================== */

  /** 登记一笔出入库：锁档案行 → 算新结存 → 判负 → 更新累计数 → 落流水 */
  async createFlow(dullId: number, dto: CreateDullStockFlowDto, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const row = await this.lockRow(mgr, dullId);
      const delta = dto.direction * dto.quantity;
      const next = (row.balanceQty || 0) + delta;
      if (next < 0) {
        const u = unitLabel(row.unit);
        throw new BadRequestException(
          `呆滞品「${row.itemNo}」当前结存 ${row.balanceQty} ${u}，本次出库 ${dto.quantity} ${u}，结存不足`,
        );
      }

      const isIn = dto.direction === STOCK_DIRECTION.IN;
      await mgr.getRepository(DullStock).update(dullId, {
        inboundQty: (row.inboundQty || 0) + (isIn ? dto.quantity : 0),
        outboundQty: (row.outboundQty || 0) + (isIn ? 0 : dto.quantity),
        balanceQty: next,
        ...auditOnUpdate(user),
      });

      const flow = await mgr.getRepository(DullStockFlow).save(
        mgr.getRepository(DullStockFlow).create({
          dullId,
          direction: dto.direction,
          quantity: dto.quantity,
          flowDate: dto.flowDate,
          reason: dto.reason,
          remark: dto.remark ?? null,
          creatorId: user.id,
          creatorName: auditDisplayName(user) || null,
        }),
      );
      return { id: flow.id, dullId, balanceQty: next };
    });
  }

  /**
   * 删除录错的流水：同事务把这笔对累计数的影响原样回滚。
   *
   * 删入库流水会让结存**减少**，若这批货已经出掉了就会算成负数——那说明删错了对象
   * （该删的是那笔出库），故一律拒绝而不是把结存压到负数。
   */
  async removeFlow(flowId: number, user: CurrentUserPayload) {
    return this.dataSource.transaction(async (mgr) => {
      const flow = await mgr.getRepository(DullStockFlow).findOne({ where: { id: flowId } });
      if (!flow) throw new NotFoundException('出入库流水不存在');
      const row = await this.lockRow(mgr, flow.dullId);

      // 回滚 = 反向应用这笔流水
      const next = (row.balanceQty || 0) - flow.direction * flow.quantity;
      if (next < 0) {
        const u = unitLabel(row.unit);
        throw new BadRequestException(
          `删除这笔入库 ${flow.quantity} ${u} 后结存为 ${next} ${u}，结存不能为负；` +
            `请先删除其后的出库流水，或改删那笔出库记录`,
        );
      }

      const isIn = flow.direction === STOCK_DIRECTION.IN;
      await mgr.getRepository(DullStock).update(row.id, {
        inboundQty: (row.inboundQty || 0) - (isIn ? flow.quantity : 0),
        outboundQty: (row.outboundQty || 0) - (isIn ? 0 : flow.quantity),
        balanceQty: next,
        ...auditOnUpdate(user),
      });
      await mgr.getRepository(DullStockFlow).delete(flowId);
      return { id: flowId, dullId: row.id, balanceQty: next };
    });
  }

  /* ==================== 内部 ==================== */

  /**
   * 属性归一：未填的一律落空串 / 0（列均为 NOT NULL DEFAULT ''）。
   * 产品类型组合串必须经共享包规范化，否则「普通,自锁」与「自锁,普通」
   * 在筛选与型号拼接时表现不一致；型号未填则按「货号+类型组合」自动拼。
   */
  private normalizeAttrs(dto: CreateDullStockDto) {
    const itemNo = (dto.itemNo ?? '').trim();
    const productType = normalizeProductTypes(dto.productType ?? '');
    const dimensionMm = Number(dto.dimensionMm) || 0;
    return {
      itemNo,
      customerName: (dto.customerName ?? '').trim(),
      productionNo: (dto.productionNo ?? '').trim(),
      productModel: (dto.productModel ?? '').trim() || formatProductModel(itemNo, productType),
      productType,
      railSection: (dto.railSection ?? '').trim(),
      dimensionMm,
      dimensionText: (dto.dimensionText ?? '').trim() || (dimensionMm ? `${dimensionMm}mm` : ''),
      surfaceType: (dto.surfaceType ?? '').trim(),
      color: (dto.color ?? '').trim(),
      side: (dto.side ?? '').trim(),
      remark: dto.remark?.trim() || null,
    };
  }

  /** 取档案行并加行锁（改数路径统一走它，防并发累加丢失） */
  private async lockRow(mgr: EntityManager, id: number): Promise<DullStock> {
    const row = await mgr
      .getRepository(DullStock)
      .createQueryBuilder('d')
      .setLock('pessimistic_write')
      .where('d.id = :id', { id })
      .getOne();
    if (!row) throw new NotFoundException('呆滞品记录不存在');
    return row;
  }

  private async mustGet(id: number): Promise<DullStock> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('呆滞品记录不存在');
    return row;
  }
}
