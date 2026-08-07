import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PART_ADJUST_SOURCE, normalizeProductTypes } from '@hb-oms/shared';
import { PartBalance } from './entities/part-balance.entity';
import { PartAdjust } from './entities/part-adjust.entity';
import {
  AdjustPartStockDto,
  PartDimensionDto,
  QueryPartAdjustDto,
  QueryPartStockDto,
} from './dto/part-stock.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate, auditDisplayName } from '../../common/utils/audit.util';

/** 归一化后的 7 维，可直接用于唯一键定位 */
interface PartDimension {
  partType: string;
  side: string;
  itemNo: string;
  railSection: string;
  productType: string;
  materialThickness: string;
  dimensionMm: number;
}

@Injectable()
export class PartStockService {
  constructor(
    @InjectRepository(PartBalance) private readonly balanceRepo: Repository<PartBalance>,
    @InjectRepository(PartAdjust) private readonly adjustRepo: Repository<PartAdjust>,
    private readonly dataSource: DataSource,
  ) {}

  /* ==================== 查询 ==================== */

  async findList(query: QueryPartStockDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.balanceRepo.createQueryBuilder('b');

    // 默认只看有余量；归零行是历史痕迹，日常不看但要能查出来
    if (query.onlyInStock !== false) qb.andWhere('b.quantity <> 0');
    if (query.partType) qb.andWhere('b.partType = :pt', { pt: query.partType });
    if (query.side != null) qb.andWhere('b.side = :sd', { sd: query.side });
    if (query.railSection) qb.andWhere('b.railSection = :rs', { rs: query.railSection });
    if (query.dimensionMm != null) qb.andWhere('b.dimensionMm = :dm', { dm: query.dimensionMm });
    // 产品类型组合串按包含匹配，传单值即可命中「普通,自锁」这类组合
    if (query.productType) {
      qb.andWhere('FIND_IN_SET(:ptp, b.productType)', { ptp: query.productType });
    }
    if (query.keyword) {
      qb.andWhere('(b.itemNo LIKE :kw OR b.materialThickness LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    qb.orderBy('b.itemNo', 'ASC')
      .addOrderBy('b.partType', 'ASC')
      .addOrderBy('b.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /** 变动流水：可按余量行下钻，也可按货号全局查 */
  async findAdjustList(query: QueryPartAdjustDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.adjustRepo.createQueryBuilder('a');
    if (query.balanceId) qb.andWhere('a.balanceId = :bid', { bid: query.balanceId });
    if (query.source) qb.andWhere('a.source = :src', { src: query.source });
    if (query.keyword) qb.andWhere('a.itemNo LIKE :kw', { kw: `%${query.keyword}%` });
    qb.orderBy('a.id', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /** 当前筛选条件下的余量合计（不受分页影响，供页面汇总） */
  async findSummary(query: QueryPartStockDto) {
    const all = await this.findList({ ...query, page: 1, pageSize: 100000 });
    return {
      rows: all.total,
      totalQty: all.list.reduce((s, r) => s + (r.quantity || 0), 0),
    };
  }

  /* ==================== 调整（唯一的写入口） ==================== */

  /**
   * 按 7 维定位余量行并累加 delta，同时写一条流水（设计文档 §4.6）。
   *
   * 刻意**不提供「直接设置余量」的接口**：文档要求「不直接改数无痕」，
   * 一切变动都必须带 delta 与原因走流水，否则事后无法回答「这个数怎么来的」。
   *
   * 期初录入（source=opening）与手工调整（manual）走同一入口，只是来源标记不同。
   * 全程在事务内对余量行加悲观锁，防并发累加丢失。
   */
  async adjust(dto: AdjustPartStockDto, user: CurrentUserPayload) {
    return this.dataSource.transaction((mgr) => this.adjustInTx(mgr, dto, user));
  }

  /**
   * 调整的事务内实现：供批量场景（期初录入）把多行放进**同一个事务**。
   * 批量必须全有全无——部件台账是累加语义，部分成功后用户改完坏行重提整批，
   * 已成功的行会被加第二次，直接把账做错。
   */
  async adjustInTx(mgr: EntityManager, dto: AdjustPartStockDto, user: CurrentUserPayload) {
    const dim = this.normalizeDimension(dto);
    {
      const balance = await this.lockOrCreateBalance(mgr, dim, user);
      const next = (balance.quantity || 0) + dto.delta;
      if (next < 0) {
        throw new BadRequestException(
          `调整后余量为 ${next} 支（当前 ${balance.quantity} 支，本次 ${dto.delta > 0 ? '+' : ''}${dto.delta} 支），部件台账余量不能为负`,
        );
      }

      await mgr.getRepository(PartBalance).update(balance.id, {
        quantity: next,
        ...(dto.remark !== undefined ? { remark: dto.remark || null } : {}),
        ...auditOnUpdate(user),
      });

      await mgr.getRepository(PartAdjust).save(
        mgr.getRepository(PartAdjust).create({
          balanceId: balance.id,
          ...dim,
          source: dto.source ?? PART_ADJUST_SOURCE.MANUAL,
          delta: dto.delta,
          quantityAfter: next,
          reason: dto.reason,
          creatorId: user.id,
          creatorName: auditDisplayName(user) || null,
        }),
      );

      return { id: balance.id, quantity: next, delta: dto.delta };
    }
  }

  /* ==================== 内部 ==================== */

  /**
   * 7 维归一：未填的维度一律落空串 / 0。
   * 留 null 会让 MySQL 唯一键失效（多 NULL 不去重），同一档部件分裂成多行——
   * 这是本表最容易出错的地方，故集中在这里处理，禁止调用方自行拼。
   */
  private normalizeDimension(dto: PartDimensionDto): PartDimension {
    return {
      partType: (dto.partType ?? '').trim(),
      side: (dto.side ?? '').trim(),
      itemNo: (dto.itemNo ?? '').trim(),
      railSection: (dto.railSection ?? '').trim(),
      // 组合串必须经共享包规范化（排序+去重），否则「普通,自锁」与「自锁,普通」会分裂成两行
      productType: normalizeProductTypes(dto.productType ?? ''),
      materialThickness: (dto.materialThickness ?? '').trim(),
      dimensionMm: Number(dto.dimensionMm) || 0,
    };
  }

  /** 取余量行并加行锁；不存在则先建 0 余量行再锁（唯一键兜底并发重复插入） */
  private async lockOrCreateBalance(
    mgr: EntityManager,
    dim: PartDimension,
    user: CurrentUserPayload,
  ): Promise<PartBalance> {
    const find = () =>
      mgr
        .getRepository(PartBalance)
        .createQueryBuilder('b')
        .setLock('pessimistic_write')
        .where(
          `b.partType = :partType AND b.side = :side AND b.itemNo = :itemNo
           AND b.railSection = :railSection AND b.productType = :productType
           AND b.materialThickness = :materialThickness AND b.dimensionMm = :dimensionMm`,
          dim,
        )
        .getOne();

    const existing = await find();
    if (existing) return existing;

    try {
      await mgr.getRepository(PartBalance).insert({
        ...dim,
        quantity: 0,
        remark: null,
        ...auditOnCreate(user),
      });
    } catch {
      // 并发下另一事务已插入同键行，忽略后重取（7 维唯一键保证只会有一行）
    }
    const created = await find();
    if (!created) throw new BadRequestException('部件台账行创建失败，请重试');
    return created;
  }
}
