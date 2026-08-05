import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { ProcessInfo } from './entities/process-info.entity';
import {
  CreateProcessInfoDto,
  QueryProcessInfoDto,
  UpdateProcessInfoDto,
} from './dto/process-info.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';

/**
 * 导入/导出表格采用**手工工艺表格式**：一个图号一组、外/中/内轨各一行，
 * 图号/版本/客户/产品名称/生产机台/工艺更新说明/备注为组级列（Excel 中合并单元格或留空下沿），
 * 部件/长度要求/特殊要求/模具编号为行级列。工艺附图不支持 Excel 导入导出。
 */
const SHEET_HEADERS = [
  '图号',
  '版本',
  '客户',
  '产品名称',
  '生产机台',
  '部件',
  '长度要求',
  '特殊要求',
  '模具编号',
  '工艺更新说明',
  '备注',
] as const;

const SHEET_WIDTHS = [18, 8, 14, 18, 12, 8, 24, 40, 14, 20, 16];

/** 组级列 → 实体字段（组内取首个非空值） */
const GROUP_FIELDS: Array<{ header: string; field: keyof CreateProcessInfoDto }> = [
  { header: '图号', field: 'drawingNo' },
  { header: '版本', field: 'drawingVersion' },
  { header: '客户', field: 'customerName' },
  { header: '产品名称', field: 'productName' },
  { header: '生产机台', field: 'machines' },
  { header: '工艺更新说明', field: 'processUpdateNote' },
  { header: '备注', field: 'remark' },
];

/** 部件行 → 三列字段映射（含常见简写别名） */
const PART_ROW_FIELDS: Record<
  string,
  { length: keyof CreateProcessInfoDto; special: keyof CreateProcessInfoDto; mold: keyof CreateProcessInfoDto }
> = {
  外轨: { length: 'lengthReqOuter', special: 'specialReqOuter', mold: 'moldNoOuter' },
  中轨: { length: 'lengthReqMiddle', special: 'specialReqMiddle', mold: 'moldNoMiddle' },
  内轨: { length: 'lengthReqInner', special: 'specialReqInner', mold: 'moldNoInner' },
  外: { length: 'lengthReqOuter', special: 'specialReqOuter', mold: 'moldNoOuter' },
  中: { length: 'lengthReqMiddle', special: 'specialReqMiddle', mold: 'moldNoMiddle' },
  内: { length: 'lengthReqInner', special: 'specialReqInner', mold: 'moldNoInner' },
};

const PART_ORDER: Array<{ label: string; key: '外轨' | '中轨' | '内轨' }> = [
  { label: '外轨', key: '外轨' },
  { label: '中轨', key: '中轨' },
  { label: '内轨', key: '内轨' },
];

/** Excel 可导入的全部实体字段（组级 + 部件行级；覆盖更新按此清单取非空列） */
const IMPORTABLE_FIELDS: Array<keyof CreateProcessInfoDto> = [
  ...GROUP_FIELDS.map((g) => g.field),
  'lengthReqOuter', 'lengthReqMiddle', 'lengthReqInner',
  'specialReqOuter', 'specialReqMiddle', 'specialReqInner',
  'moldNoOuter', 'moldNoMiddle', 'moldNoInner',
];

/** ExcelJS 单元格值转纯文本（兼容富文本/公式/超链接对象） */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((t: any) => t.text).join('');
    }
    if ('text' in v) return String((v as any).text ?? '');
    if ('result' in v) return String((v as any).result ?? '');
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v);
}

/** 归一化表头文本：去除 * 与所有空白，便于匹配 */
function normalizeHeader(s: string): string {
  return s.replace(/[*＊]/g, '').replace(/\s/g, '').trim();
}

/**
 * 机台多值归一化：分隔符（/ 、 ； ; 空格 . ）统一为英文逗号存储
 * （如 89/90/91 → 89,90,91；手工表点分写法 16.15.5 → 16,15,5——机台号为整数编号，点号仅作分隔符）
 */
function normalizeMachines(s?: string): string | undefined {
  if (!s) return undefined;
  const parts = s
    .split(/[/、;；,，.\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts.join(',') : undefined;
}

@Injectable()
export class ProcessInfoService {
  constructor(
    @InjectRepository(ProcessInfo)
    private readonly repo: Repository<ProcessInfo>,
    private readonly dataSource: DataSource,
  ) {}

  async findList(query: QueryProcessInfoDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repo.createQueryBuilder('p');
    if (query.keyword) {
      qb.andWhere(
        '(p.drawingNo LIKE :kw OR p.customerName LIKE :kw OR p.productName LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }
    qb.orderBy('p.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /** 按生产图号精确匹配（订单表单自动带入用；未命中返回 null 不报错） */
  async findByDrawingNo(drawingNo: string) {
    if (!drawingNo?.trim()) return null;
    return this.repo.findOne({ where: { drawingNo: drawingNo.trim() } });
  }

  async findOne(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('工艺信息不存在');
    return item;
  }

  async create(dto: CreateProcessInfoDto, user: CurrentUserPayload) {
    const exists = await this.repo.findOne({ where: { drawingNo: dto.drawingNo } });
    if (exists) throw new ConflictException(`生产图号「${dto.drawingNo}」已存在工艺记录`);
    const saved = await this.repo.save(this.repo.create({ ...dto, ...auditOnCreate(user) }));
    return { id: saved.id };
  }

  async update(id: number, dto: UpdateProcessInfoDto, user: CurrentUserPayload) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('工艺信息不存在');
    if (dto.drawingNo && dto.drawingNo !== item.drawingNo) {
      const exists = await this.repo.findOne({ where: { drawingNo: dto.drawingNo } });
      if (exists) throw new ConflictException(`生产图号「${dto.drawingNo}」已存在工艺记录`);
    }
    await this.repo.update(id, { ...dto, ...auditOnUpdate(user) });
    return { id };
  }

  async remove(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('工艺信息不存在');

    // 订单引用的是图号快照，删除工艺不影响历史订单；仅提示性校验是否仍有订单部件组引用该图号。
    // t_order_part_group（图号锚点，设计文档 §4.2）在 M2 里程碑落地，表尚未建时视为无引用。
    const refMap = await this.countDrawingRefs([item.drawingNo]);
    const refCount = refMap.get(item.drawingNo) ?? 0;
    if (refCount > 0) {
      throw new BadRequestException(
        `生产图号「${item.drawingNo}」已被 ${refCount} 条订单部件组引用，删除前请确认（历史订单保留快照不受影响）；如需强制删除请先联系管理员`,
      );
    }
    await this.repo.delete(id);
    return { id };
  }

  /**
   * 批量删除：整批校验口径与客户资料一致——任一图号被订单部件组引用则整批拒绝并返回逐条原因，
   * 不做部分删除；已不存在的 id 静默跳过（幂等）。
   */
  async batchRemove(ids: number[]) {
    const uniqIds = [...new Set(ids)];
    const items = await this.repo.find({ where: { id: In(uniqIds) } });
    if (!items.length) throw new NotFoundException('所选工艺记录均不存在（可能已被删除），请刷新列表');

    const refMap = await this.countDrawingRefs(items.map((i) => i.drawingNo));
    const blocked = items.filter((i) => (refMap.get(i.drawingNo) ?? 0) > 0);
    if (blocked.length) {
      throw new BadRequestException({
        message: `批量删除未执行：${blocked.length} 条工艺已被订单部件组引用`,
        errors: blocked.map(
          (i) => `生产图号「${i.drawingNo}」已被 ${refMap.get(i.drawingNo)} 条订单部件组引用`,
        ),
      });
    }

    await this.repo.delete(items.map((i) => i.id));
    return { deleted: items.length, skipped: uniqIds.length - items.length };
  }

  /** 图号 → 订单部件组引用数（t_order_part_group 未建表时视为无引用，与单删同口径） */
  private async countDrawingRefs(drawingNos: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!drawingNos.length) return map;
    try {
      const rows: Array<{ drawing_no: string; cnt: string }> = await this.dataSource.query(
        `SELECT drawing_no, COUNT(*) AS cnt FROM t_order_part_group WHERE drawing_no IN (${drawingNos
          .map(() => '?')
          .join(',')}) GROUP BY drawing_no`,
        drawingNos,
      );
      rows.forEach((r) => map.set(r.drawing_no, Number(r.cnt)));
    } catch {
      /* t_order_part_group 未建表（M2 落地）：无引用 */
    }
    return map;
  }

  /** 工作表通用装饰：表头加粗 + 列宽 + 全边框 */
  private decorateSheet(ws: ExcelJS.Worksheet) {
    ws.columns = SHEET_HEADERS.map((h, i) => ({
      header: h === '图号' ? `*${h}` : h,
      width: SHEET_WIDTHS[i],
    }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  }

  /** 追加一条工艺记录 = 外/中/内轨三行，组级列纵向合并 */
  private appendRecordRows(ws: ExcelJS.Worksheet, p: Partial<ProcessInfo>) {
    const start = ws.rowCount + 1;
    for (const part of PART_ORDER) {
      const f = PART_ROW_FIELDS[part.key];
      ws.addRow([
        p.drawingNo ?? '',
        p.drawingVersion ?? '',
        p.customerName ?? '',
        p.productName ?? '',
        (p.machines ?? '').replace(/,/g, '/'),
        part.label,
        (p as any)[f.length] ?? '',
        (p as any)[f.special] ?? '',
        (p as any)[f.mold] ?? '',
        p.processUpdateNote ?? '',
        p.remark ?? '',
      ]);
    }
    const end = ws.rowCount;
    // 组级列合并（图号/版本/客户/产品名称/生产机台/工艺更新说明/备注）
    for (const col of [1, 2, 3, 4, 5, 10, 11]) {
      ws.mergeCells(start, col, end, col);
      ws.getCell(start, col).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
    for (let r = start; r <= end; r++) {
      ws.getCell(r, 6).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(r, 7).alignment = { vertical: 'middle', wrapText: true };
      ws.getCell(r, 8).alignment = { vertical: 'middle', wrapText: true };
    }
  }

  /** 生成导入模板（手工工艺表格式：一图号三行 + 合并单元格示例） */
  async buildImportTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('工艺信息导入模板');
    this.decorateSheet(ws);
    this.appendRecordRows(ws, {
      drawingNo: 'HH-4502B-2',
      drawingVersion: '1.1',
      customerName: '示例客户',
      productName: '45#普通滑轨',
      machines: '16,15,5',
      lengthReqOuter: '正常长度（不变）',
      lengthReqMiddle: '外轨正常长度-17MM',
      lengthReqInner: '外轨正常长度-2MM',
      specialReqOuter: '中轨从20寸以上不能排在69号机……（示例）',
      specialReqInner: '光板不弯尾在外轨正常长度+5',
      moldNoOuter: 'M-45-W',
      processUpdateNote: '',
      remark: '示例组（三行一组），导入前请删除',
    } as Partial<ProcessInfo>);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** 导出（手工工艺表格式，与导入模板同构；按查询条件全量导出，不分页） */
  async exportExcel(query: QueryProcessInfoDto): Promise<Buffer> {
    const qb = this.repo.createQueryBuilder('p');
    if (query.keyword) {
      qb.andWhere(
        '(p.drawingNo LIKE :kw OR p.customerName LIKE :kw OR p.productName LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }
    qb.orderBy('p.updatedAt', 'DESC');
    const items = await qb.getMany();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('工艺信息');
    this.decorateSheet(ws);
    for (const p of items) this.appendRecordRows(ws, p);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * Excel 批量导入（口径与客户资料一致）：
   * - 整批校验全部通过才落库，任一行出错返回逐行错误清单，不部分入库；
   * - 判重按生产图号：默认已存在即报错；overwrite=true 时按图号 upsert 非空列；
   * - 生产机台多值分隔符（/ 、 ; 空格）归一化为逗号存储；工艺附图不支持 Excel 导入。
   */
  async importFromExcel(buffer: Buffer, overwrite: boolean, user: CurrentUserPayload) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel 文件中没有工作表');

    // 表头 → 列号映射（兼容旧列名别名：生产图号=图号、版本号=版本、客户名称=客户）
    const HEADER_ALIASES: Record<string, string> = { 生产图号: '图号', 版本号: '版本', 客户名称: '客户' };
    const headerRow = ws.getRow(1);
    const colOf = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      let h = normalizeHeader(cellText(cell.value));
      h = HEADER_ALIASES[h] ?? h;
      colOf.set(h, colNumber);
    });
    for (const required of ['图号', '部件']) {
      if (!colOf.has(required)) {
        throw new BadRequestException(`模板缺少必填列「${required}」，请下载最新模板（一图号三行格式）`);
      }
    }

    /**
     * 分组解析：一图号一组、外/中/内轨各一行。
     * 合并单元格在 ExcelJS 中仅首行有值（或手工表未合并时逐行重复同图号），
     * 故图号列「空值或与当前组相同」均归入当前组，出现新图号则开新组。
     */
    interface ParsedGroup extends Partial<CreateProcessInfoDto> {
      _row: number; // 组起始行
      _parts: Set<string>;
    }
    const rows: ParsedGroup[] = [];
    const errors: string[] = [];
    let current: ParsedGroup | null = null;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const get = (header: string) => {
        const col = colOf.get(header);
        return col ? cellText(row.getCell(col).value).trim() : '';
      };
      const drawingNo = get('图号');
      const partRaw = get('部件');
      const lengthReq = get('长度要求');
      const specialReq = get('特殊要求');
      const moldNo = get('模具编号');
      const groupCells = GROUP_FIELDS.map((g) => ({ g, v: get(g.header) }));
      // 全空行跳过
      if (!drawingNo && !partRaw && !lengthReq && !specialReq && !moldNo && groupCells.every((x) => !x.v)) return;

      if (drawingNo && (!current || drawingNo !== current.drawingNo)) {
        current = { _row: rowNumber, _parts: new Set(), drawingNo };
        rows.push(current);
      }
      if (!current) {
        errors.push(`第 ${rowNumber} 行：图号为空且上方没有所属图号组`);
        return;
      }
      // 组级列取组内首个非空值
      for (const { g, v } of groupCells) {
        if (v && !(current as any)[g.field]) (current as any)[g.field] = v;
      }
      // 部件行
      if (partRaw) {
        const key = partRaw.replace(/轨$/, '') + '轨';
        const f = PART_ROW_FIELDS[partRaw] ?? PART_ROW_FIELDS[key];
        if (!f) {
          errors.push(`第 ${rowNumber} 行：无法识别的部件「${partRaw}」（应为 外轨/中轨/内轨）`);
          return;
        }
        const partKey = key in PART_ROW_FIELDS ? key : partRaw;
        if (current._parts.has(partKey)) {
          errors.push(`第 ${rowNumber} 行：图号「${current.drawingNo}」的部件「${partKey}」重复`);
          return;
        }
        current._parts.add(partKey);
        if (lengthReq) (current as any)[f.length] = lengthReq;
        if (specialReq) (current as any)[f.special] = specialReq;
        if (moldNo) (current as any)[f.mold] = moldNo;
      } else if (lengthReq || specialReq || moldNo) {
        errors.push(`第 ${rowNumber} 行：填写了长度/特殊要求/模具编号但「部件」列为空`);
      }
    });

    for (const r of rows) {
      r.machines = normalizeMachines(r.machines as string | undefined);
      delete (r as any)._parts;
    }
    if (!rows.length && !errors.length) throw new BadRequestException('Excel 中没有可导入的数据行');

    // 批内判重（图号唯一）
    const seen = new Map<string, number>();
    for (const r of rows) {
      if (!r.drawingNo) continue;
      if (seen.has(r.drawingNo)) {
        errors.push(`第 ${r._row} 行：生产图号「${r.drawingNo}」与第 ${seen.get(r.drawingNo)} 行重复`);
      } else seen.set(r.drawingNo, r._row);
    }

    // 与库内判重
    const existing = await this.repo.find();
    const byDrawing = new Map(existing.map((p) => [p.drawingNo, p]));
    for (const r of rows) {
      if (!overwrite && r.drawingNo && byDrawing.has(r.drawingNo)) {
        errors.push(`第 ${r._row} 行：生产图号「${r.drawingNo}」已存在（可开启「覆盖更新」）`);
      }
    }

    if (errors.length) {
      throw new BadRequestException({ message: '导入校验未通过，本次未导入任何数据', errors });
    }

    // 整批落库（同一事务）
    let created = 0;
    let updated = 0;
    await this.dataSource.transaction(async (mgr) => {
      for (const r of rows) {
        const { _row, ...dto } = r;
        const hit = byDrawing.get(dto.drawingNo as string);
        if (hit) {
          // 覆盖更新：仅更新非空列
          const patch: Partial<ProcessInfo> = { ...auditOnUpdate(user) };
          for (const field of IMPORTABLE_FIELDS) {
            const v = (dto as any)[field];
            if (v !== undefined) (patch as any)[field] = v;
          }
          await mgr.getRepository(ProcessInfo).update(hit.id, patch);
          updated += 1;
        } else {
          await mgr.getRepository(ProcessInfo).save(
            mgr.getRepository(ProcessInfo).create({ ...(dto as CreateProcessInfoDto), ...auditOnCreate(user) }),
          );
          created += 1;
        }
      }
    });
    return { created, updated, total: rows.length };
  }
}
