import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  RAIL_SECTION_OPTIONS,
  SIDE_OPTIONS,
  STOCK_DIRECTION,
  UNIT,
  UNIT_OPTIONS,
  formatProductModel,
  formatProductTypes,
  normalizeProductTypes,
  toPieces,
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

  /* ==================== 导出 / 导入 ==================== */

  /** 导出当前筛选结果（列序对齐页面，四个数一并带出便于对账） */
  async exportExcel(query: QueryDullStockDto): Promise<Buffer> {
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
    const ws = wb.addWorksheet('呆滞品');
    ws.columns = [
      { header: '货号' },
      { header: '客户' },
      { header: '生产单号' },
      { header: '产品型号' },
      { header: '产品类型' },
      { header: '节数' },
      { header: '规格(mm)' },
      { header: '表面处理' },
      { header: '颜色' },
      { header: '边别' },
      { header: '单位' },
      { header: '期初数' },
      { header: '入库数' },
      { header: '出库数' },
      { header: '结存数' },
      { header: '备注' },
    ];
    for (const r of all.list as any[]) {
      ws.addRow([
        r.itemNo || '',
        r.customerName || '',
        r.productionNo || '',
        r.productModel || '',
        formatProductTypes(r.productType || ''),
        labelOf(RAIL_SECTION_OPTIONS, r.railSection),
        r.dimensionMm || 0,
        r.surfaceType || '',
        r.color || '',
        labelOf(SIDE_OPTIONS, r.side),
        unitLabel(r.unit),
        r.openingQty || 0,
        r.inboundQty || 0,
        r.outboundQty || 0,
        r.balanceQty || 0,
        r.remark || '',
      ]);
    }
    styleSheet(ws, { centerColumns: [6, 7, 10, 11, 12, 13, 14, 15] });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * 导入模板：只含**建档**字段（含期初数），不含入库数/出库数。
   * 那两个数是流水累计值，唯一写入口是「登记出入库」（§4.6），
   * 模板给列让人填，填了也不会生效，反而误导。
   */
  async buildImportTemplate(): Promise<Buffer> {
    const wb = createWorkbook();
    const ws = wb.addWorksheet('呆滞品导入');
    ws.columns = [
      { header: '货号*' },
      { header: '客户' },
      { header: '生产单号' },
      { header: '产品型号' },
      { header: '产品类型' },
      { header: '节数' },
      { header: '规格(mm)' },
      { header: '表面处理' },
      { header: '颜色' },
      { header: '边别' },
      { header: '单位*' },
      { header: '期初数*' },
      { header: '备注' },
    ];
    ws.addRow(['53#', '海尔', 'SC2508001', '', '普通,自锁', '三节轨', 450, '电泳', '黑色', '', '支', 200, '示例行，导入前请删除']);
    styleSheet(ws, { centerColumns: [6, 7, 10, 11, 12] });

    addTipsSheet(wb, [
      ['一行 = 一批货', '呆滞品**刻意不设唯一键**：同货号同客户先后剩下的几批要各建各的档，所以导入的每一行都会**新建一条记录**，不会合并、不会覆盖。'],
      ['重复导入会怎样', '会**重复建档**。同一份文件不要导入两次；导入失败时整批回滚，可以放心改完重来。'],
      ['货号', '必填。'],
      ['客户 / 生产单号', '**两者至少填一项**。呆滞品脱离了订单，这两项是日后认领这批货的仅有线索，都空着事后没人说得清是谁的货。'],
      ['产品型号', '留空会按「货号 + 产品类型」自动拼。'],
      ['产品类型', '可多选，用逗号分隔，如「普通,自锁」。'],
      ['节数', `可填 ${RAIL_SECTION_OPTIONS.map((o) => o.label).join(' / ')}，留空表示不区分。`],
      ['表面处理 / 颜色', '按实物填，如 电泳 / 黑色。这两项是认货的主要依据，建议填全。'],
      ['边别', '产品类型含「卡口」时填 左 / 右；不含卡口请留空。'],
      ['单位', `必填，${UNIT_OPTIONS.map((o) => o.label).join(' / ')}。本行的四个数量都按这个单位计（1 套 = 2 支），页面顶部合计会统一折成支。`],
      ['期初数', '必填，不小于 0 的整数，指这批货一开始有多少。'],
      ['入库数 / 出库数', '**不能导入**：它们是出入库流水的累计值，只能在页面上逐笔「登记出入库」，这样每一笔进出才有据可查。'],
      ['导入规则', '整批校验通过才落库；任一行有问题会列出逐行原因并**整批回滚**，不会导入一半。'],
    ]);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * 批量导入建档。**整批全有全无**（同一个事务）。
   *
   * 这里的全有全无与部件台账的理由不同：呆滞品每行都是新建，部分成功不会把数加错，
   * 但用户改完坏行重提整批时，成功的那些会**再建一遍**，留下一堆重复档案。
   */
  async importFromExcel(buffer: Buffer, user: CurrentUserPayload) {
    const ws = await loadFirstSheet(buffer);

    const sideByLabel = new Map(SIDE_OPTIONS.map((o) => [o.label, o.value]));
    const railByLabel = new Map(RAIL_SECTION_OPTIONS.map((o) => [o.label, o.value]));
    const unitByLabel = new Map(UNIT_OPTIONS.map((o) => [o.label, o.value]));

    const errors: string[] = [];
    const parsed: Array<{ rowNo: number; dto: CreateDullStockDto }> = [];

    ws.eachRow((row, idx) => {
      if (idx === 1) return; // 表头
      const [itemNo, customerName, productionNo, productModel, typeText, railLabel,
        dimension, surfaceType, color, sideLabel, unitLabelText, openingQty, remark] =
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((c) => cellString(row.getCell(c)));
      if (![itemNo, customerName, productionNo, typeText, unitLabelText, openingQty].some(Boolean)) return;

      const at = `第 ${idx} 行`;
      const rowErrors: string[] = [];

      if (!itemNo) rowErrors.push('货号必填');
      // 与建档/编辑同一条规则（服务端 normalizeAttrs 也会再拦一次）
      if (!customerName && !productionNo) rowErrors.push('客户与生产单号至少填写一项');

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

      let unit = UNIT.PIECE as string;
      if (!unitLabelText) rowErrors.push('单位必填');
      else {
        const hit = unitByLabel.get(unitLabelText)
          ?? (UNIT_OPTIONS.some((o) => o.value === unitLabelText) ? unitLabelText : undefined);
        if (!hit) rowErrors.push(`单位「${unitLabelText}」无效，只能是 ${UNIT_OPTIONS.map((o) => o.label).join(' / ')}`);
        else unit = hit;
      }

      let opening = 0;
      if (!openingQty) rowErrors.push('期初数必填');
      else {
        const n = Number(openingQty);
        if (!Number.isInteger(n) || n < 0) rowErrors.push(`期初数「${openingQty}」必须是不小于 0 的整数`);
        else opening = n;
      }

      if (rowErrors.length) {
        errors.push(`${at}：${rowErrors.join('；')}`);
        return;
      }

      parsed.push({
        rowNo: idx,
        dto: {
          itemNo,
          customerName: customerName || undefined,
          productionNo: productionNo || undefined,
          productModel: productModel || undefined,
          productType,
          railSection,
          dimensionMm,
          surfaceType: surfaceType || undefined,
          color: color || undefined,
          side,
          unit,
          openingQty: opening,
          remark: remark || undefined,
        } as CreateDullStockDto,
      });
    });

    if (errors.length) throw importRejected(errors, parsed.length + errors.length);
    if (!parsed.length) throw new BadRequestException('Excel 中没有可导入的数据行');

    return this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(DullStock);
      let created = 0;
      for (const p of parsed) {
        try {
          const attrs = this.normalizeAttrs(p.dto);
          await repo.save(
            repo.create({
              ...attrs,
              unit: p.dto.unit,
              openingQty: p.dto.openingQty,
              inboundQty: 0,
              outboundQty: 0,
              // 建档时还没有任何流水，结存即期初
              balanceQty: p.dto.openingQty,
              ...auditOnCreate(user),
            }),
          );
          created += 1;
        } catch (e: any) {
          const why = e?.response?.message ?? e?.message ?? '未知错误';
          throw importRejected([`第 ${p.rowNo} 行：${why}`], parsed.length);
        }
      }
      return { total: parsed.length, created };
    });
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

    // 客户 / 生产单号至少填一项：呆滞品脱离了订单，这两项是日后认领这批货的
    // 仅有线索，两个都空的档案事后没人说得清是谁的货。前端也校验，此处防 API 直调。
    const customerName = (dto.customerName ?? '').trim();
    const productionNo = (dto.productionNo ?? '').trim();
    if (!customerName && !productionNo) {
      throw new BadRequestException('客户与生产单号至少填写一项，否则日后无法追溯这批货的来源');
    }

    return {
      itemNo,
      customerName,
      productionNo,
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
