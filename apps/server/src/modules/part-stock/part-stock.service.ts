import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  PART_ADJUST_SOURCE,
  PART_TYPE_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  RAIL_SECTION_OPTIONS,
  SIDE_OPTIONS,
  formatProductTypes,
  normalizeProductTypes,
} from '@hb-oms/shared';
import {
  EXPORT_ROW_LIMIT,
  addTipsSheet,
  cellString,
  createWorkbook,
  importRejected,
  labelOf,
  loadFirstSheet,
  parseTypeLabels,
  styleSheet,
} from '../../common/utils/excel.util';
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

  /* ==================== 导出 / 导入 ==================== */

  /** 导出当前筛选结果（列序对齐页面，便于逐列核对） */
  async exportExcel(query: QueryPartStockDto): Promise<Buffer> {
    const all = await this.findList({ ...query, page: 1, pageSize: EXPORT_ROW_LIMIT + 1 });
    if (!all.list.length) {
      throw new BadRequestException('当前筛选条件下没有数据可导出，请调整筛选条件后重试');
    }
    if (all.list.length > EXPORT_ROW_LIMIT) {
      throw new BadRequestException(
        `当前筛选结果 ${all.total} 行，超过单次导出上限 ${EXPORT_ROW_LIMIT} 行，请缩小筛选范围后重试`,
      );
    }

    const wb = createWorkbook();
    const ws = wb.addWorksheet('部件台账');
    ws.columns = [
      { header: '货号' },
      { header: '部件' },
      { header: '边别' },
      { header: '产品类型' },
      { header: '节数' },
      { header: '料厚' },
      { header: '规格(mm)' },
      { header: '余量(支)' },
      { header: '备注' },
    ];
    for (const r of all.list) {
      ws.addRow([
        r.itemNo || '',
        labelOf(PART_TYPE_OPTIONS, r.partType),
        labelOf(SIDE_OPTIONS, r.side),
        formatProductTypes(r.productType || ''),
        labelOf(RAIL_SECTION_OPTIONS, r.railSection),
        r.materialThickness || '',
        r.dimensionMm || 0,
        r.quantity || 0,
        r.remark || '',
      ]);
    }
    // 部件/边别/节数/规格/余量都是短列，居中比左对齐好看
    styleSheet(ws, { centerColumns: [2, 3, 5, 7, 8] });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * 导入模板：列是**调整量 + 调整原因**，不是「余量」。
   *
   * 部件台账余量的唯一写入口是「delta + 原因」的调整通道（§4.6 不直接改数无痕），
   * 模板若给一列「余量」让人填目标值，就等于绕开流水直接设数——账面能对上，
   * 但事后回答不了「这个数怎么来的」。故导入本质是**批量调整**。
   */
  async buildImportTemplate(): Promise<Buffer> {
    const wb = createWorkbook();
    const ws = wb.addWorksheet('部件台账导入');
    ws.columns = [
      { header: '货号*' },
      { header: '部件*' },
      { header: '边别' },
      { header: '产品类型' },
      { header: '节数' },
      { header: '料厚' },
      { header: '规格(mm)' },
      { header: '调整量(±)*' },
      { header: '调整原因*' },
      { header: '备注' },
    ];
    ws.addRow(['53#', '外轨', '', '普通,自锁', '三节轨', '1.2', 450, 200, '期初补录', '示例行，导入前请删除']);
    ws.addRow(['53#', '内轨', '左', '普通,卡口', '三节轨', '1.2', 450, -30, '盘盈盘亏', '负数表示扣减']);
    styleSheet(ws, { centerColumns: [2, 3, 5, 7, 8] });

    addTipsSheet(wb, [
      ['导入的性质', '本导入是**批量调整余量**，不是「设置余量」：每一行都会按「调整量」在现有余量上加减，并留下一条变动流水。'],
      ['为什么不能直接填余量', '部件台账要求「不直接改数无痕」，一切变动都必须带调整量与原因，否则事后无法回答「这个数怎么来的」。'],
      ['重复导入会怎样', '会**再加一遍**。同一份文件不要导入两次；导入失败时整批回滚，可以放心改完重来。'],
      ['货号', '必填。'],
      ['部件', `必填，只能是 ${PART_TYPE_OPTIONS.map((o) => o.label).join(' / ')}。`],
      ['边别', '产品类型含「卡口」时填 左 / 右；不含卡口请留空。'],
      ['产品类型', `可多选，用逗号分隔，如「普通,自锁」。可选值：${PRODUCT_TYPE_OPTIONS.map((o) => o.label).join(' / ')}。`],
      ['节数', `可填 ${RAIL_SECTION_OPTIONS.map((o) => o.label).join(' / ')}，留空表示不区分。`],
      ['料厚 / 规格(mm)', '留空按「不区分」处理。注意：货号、部件、边别、节数、产品类型、料厚、规格这 7 项共同决定是哪一行台账，任一项不同就是另一行。'],
      ['调整量(±)', '必填，整数。正数增加、负数扣减，**不能填 0**。调整后余量为负会被拒绝。'],
      ['调整原因', '必填，会记进流水，如 期初补录 / 盘盈盘亏 / 录错纠正。'],
      ['导入规则', '整批校验通过才落库；任一行有问题会列出逐行原因并**整批回滚**，不会导入一半。'],
    ]);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * 批量导入 = 批量调整。**整批全有全无**（同一个事务）。
   *
   * 部件台账是累加语义，部分成功后用户改完坏行重提整批，已成功的行会被加第二次，
   * 直接把账做错——这与期初录入的整批约定同源（§5.6）。
   */
  async importFromExcel(buffer: Buffer, user: CurrentUserPayload) {
    const ws = await loadFirstSheet(buffer);

    const partByLabel = new Map(PART_TYPE_OPTIONS.map((o) => [o.label, o.value]));
    const sideByLabel = new Map(SIDE_OPTIONS.map((o) => [o.label, o.value]));
    const railByLabel = new Map(RAIL_SECTION_OPTIONS.map((o) => [o.label, o.value]));

    const errors: string[] = [];
    const parsed: Array<{ rowNo: number; dto: AdjustPartStockDto }> = [];

    ws.eachRow((row, idx) => {
      if (idx === 1) return; // 表头
      const [itemNo, partLabel, sideLabel, typeText, railLabel, thickness, dimension, delta, reason, remark] =
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => cellString(row.getCell(c)));
      // 整行空则跳过（用户在模板尾部留了空行是常事，不该当成错误）
      if (![itemNo, partLabel, sideLabel, typeText, railLabel, thickness, dimension, delta, reason].some(Boolean)) return;

      const at = `第 ${idx} 行`;
      const rowErrors: string[] = [];

      if (!itemNo) rowErrors.push('货号必填');

      const partType = partByLabel.get(partLabel);
      if (!partLabel) rowErrors.push('部件必填');
      else if (!partType) {
        rowErrors.push(`部件「${partLabel}」无效，只能是 ${PART_TYPE_OPTIONS.map((o) => o.label).join(' / ')}`);
      }

      let side = '';
      if (sideLabel) {
        const hit = sideByLabel.get(sideLabel);
        if (!hit) rowErrors.push(`边别「${sideLabel}」无效，只能是 左 / 右`);
        else side = hit;
      }

      let railSection = '';
      if (railLabel) {
        const hit = railByLabel.get(railLabel);
        if (!hit) rowErrors.push(`节数「${railLabel}」无效，只能是 ${RAIL_SECTION_OPTIONS.map((o) => o.label).join(' / ')}`);
        else railSection = hit;
      }

      const { value: productType, invalid } = parseTypeLabels(typeText);
      if (invalid.length) rowErrors.push(`产品类型「${invalid.join('、')}」无效`);

      let dimensionMm = 0;
      if (dimension) {
        const n = Number(dimension);
        if (!Number.isInteger(n) || n < 0) rowErrors.push(`规格「${dimension}」必须是不小于 0 的整数`);
        else dimensionMm = n;
      }

      let deltaNum = 0;
      if (!delta) rowErrors.push('调整量必填');
      else {
        const n = Number(delta);
        if (!Number.isInteger(n)) rowErrors.push(`调整量「${delta}」必须是整数`);
        else if (n === 0) rowErrors.push('调整量不能为 0');
        else deltaNum = n;
      }

      if (!reason) rowErrors.push('调整原因必填');

      if (rowErrors.length) {
        errors.push(`${at}：${rowErrors.join('；')}`);
        return;
      }

      parsed.push({
        rowNo: idx,
        dto: {
          partType: partType as string,
          side,
          itemNo,
          railSection,
          productType,
          materialThickness: thickness,
          dimensionMm,
          delta: deltaNum,
          reason,
          remark: remark || undefined,
          source: PART_ADJUST_SOURCE.MANUAL,
        },
      });
    });

    if (errors.length) throw importRejected(errors, parsed.length + errors.length);
    if (!parsed.length) throw new BadRequestException('Excel 中没有可导入的数据行');

    // 整批一个事务：任一行失败（含「调整后余量为负」）都整批回滚
    return this.dataSource.transaction(async (mgr) => {
      let affected = 0;
      for (const p of parsed) {
        try {
          await this.adjustInTx(mgr, p.dto, user);
          affected += 1;
        } catch (e: any) {
          const why = e?.response?.message ?? e?.message ?? '未知错误';
          throw importRejected([`第 ${p.rowNo} 行：${why}`], parsed.length);
        }
      }
      return { total: parsed.length, affected };
    });
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
