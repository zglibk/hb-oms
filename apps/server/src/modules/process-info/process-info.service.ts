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

/** 导入列定义（与导入模板表头一一对应；工艺附图不支持 Excel 导入） */
const IMPORT_COLUMNS: Array<{
  header: string;
  field: keyof CreateProcessInfoDto;
  required: boolean;
  width: number;
}> = [
  { header: '生产图号', field: 'drawingNo', required: true, width: 18 },
  { header: '版本号', field: 'drawingVersion', required: false, width: 10 },
  { header: '客户名称', field: 'customerName', required: false, width: 20 },
  { header: '产品名称', field: 'productName', required: false, width: 20 },
  { header: '生产机台', field: 'machines', required: false, width: 14 },
  { header: '长度要求-外轨', field: 'lengthReqOuter', required: false, width: 16 },
  { header: '长度要求-中轨', field: 'lengthReqMiddle', required: false, width: 16 },
  { header: '长度要求-内轨', field: 'lengthReqInner', required: false, width: 16 },
  { header: '特殊要求-外轨', field: 'specialReqOuter', required: false, width: 20 },
  { header: '特殊要求-中轨', field: 'specialReqMiddle', required: false, width: 20 },
  { header: '特殊要求-内轨', field: 'specialReqInner', required: false, width: 20 },
  { header: '模具编号-外轨', field: 'moldNoOuter', required: false, width: 14 },
  { header: '模具编号-中轨', field: 'moldNoMiddle', required: false, width: 14 },
  { header: '模具编号-内轨', field: 'moldNoInner', required: false, width: 14 },
  { header: '工艺更新说明', field: 'processUpdateNote', required: false, width: 24 },
  { header: '备注', field: 'remark', required: false, width: 20 },
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

/** 机台多值归一化：分隔符（/ 、 ； ; 空格）统一为英文逗号存储（如 89/90/91 → 89,90,91） */
function normalizeMachines(s?: string): string | undefined {
  if (!s) return undefined;
  const parts = s
    .split(/[/、;；,，\s]+/)
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

  /** 生成导入模板（表头 + 示例行） */
  async buildImportTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('工艺信息导入模板');
    ws.columns = IMPORT_COLUMNS.map((c) => ({
      header: c.required ? `*${c.header}` : c.header,
      width: c.width,
    }));
    ws.getRow(1).font = { bold: true };
    ws.addRow([
      'HH-X5305A-ZT',
      'A/1',
      '示例客户',
      '53#普通滑轨',
      '89/90/91',
      '650±0.5',
      '640±0.5',
      '630±0.5',
      '外轨冲孔后去毛刺',
      '',
      '内轨压追溯码',
      'M-53-W',
      'M-53-Z',
      'M-53-N',
      '示例行，导入前请删除',
      '',
    ]);
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

    // 表头 → 列号映射
    const headerRow = ws.getRow(1);
    const colOf = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      colOf.set(normalizeHeader(cellText(cell.value)), colNumber);
    });
    for (const c of IMPORT_COLUMNS.filter((c) => c.required)) {
      if (!colOf.has(c.header)) {
        throw new BadRequestException(`模板缺少必填列「${c.header}」，请下载最新模板`);
      }
    }

    // 逐行解析
    const rows: Array<Partial<CreateProcessInfoDto> & { _row: number }> = [];
    const errors: string[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const get = (header: string) => {
        const col = colOf.get(header);
        return col ? cellText(row.getCell(col).value).trim() : '';
      };
      const record: any = { _row: rowNumber };
      for (const c of IMPORT_COLUMNS) record[c.field] = get(c.header) || undefined;
      // 全空行跳过
      if (!IMPORT_COLUMNS.some((c) => record[c.field])) return;
      record.machines = normalizeMachines(record.machines);
      if (!record.drawingNo) errors.push(`第 ${rowNumber} 行：生产图号不能为空`);
      rows.push(record);
    });
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
          for (const c of IMPORT_COLUMNS) {
            const v = (dto as any)[c.field];
            if (v !== undefined) (patch as any)[c.field] = v;
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
