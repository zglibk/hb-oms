import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Dict } from '../entities/dict.entity';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import {
  auditOnCreate,
  auditOnUpdate,
} from '../../../common/utils/audit.util';

/** 导入模板列定义（同时用于生成模板与解析导入，保证表头一致） */
interface ImportColumn {
  header: string;
  field: keyof ImportRow;
  required: boolean;
  width: number;
}

/** Excel 每行解析后的中间结构 */
interface ImportRow {
  dictType: string;
  dictLabel: string;
  dictValue: string;
  sort: string;
  status: string;
  parentValue: string;
  remark: string;
}

const IMPORT_COLUMNS: ImportColumn[] = [
  { header: '字典类型', field: 'dictType', required: true, width: 18 },
  { header: '标签', field: 'dictLabel', required: true, width: 18 },
  { header: '键值', field: 'dictValue', required: true, width: 16 },
  { header: '排序', field: 'sort', required: false, width: 8 },
  { header: '状态', field: 'status', required: false, width: 8 },
  { header: '上级键值', field: 'parentValue', required: false, width: 14 },
  { header: '备注', field: 'remark', required: false, width: 22 },
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
    if (v instanceof Date) {
      const y = v.getFullYear();
      const mo = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
    return '';
  }
  return String(v);
}

/** 归一化表头文本：去除 * 与所有空白，便于匹配 */
function normalizeHeader(s: string): string {
  return s.replace(/[*＊]/g, '').replace(/\s/g, '').trim();
}

@Injectable()
export class DictService {
  constructor(
    @InjectRepository(Dict) private readonly dictRepo: Repository<Dict>,
    private readonly dataSource: DataSource,
  ) {}

  /** 按类型取字典项（前端下拉用，公开给所有登录用户） */
  async byType(dictType: string) {
    return this.dictRepo.find({
      where: { dictType, status: 1 },
      order: { sort: 'ASC' },
    });
  }

  /** 全部字典（管理用，可按类型筛选） */
  async findList(dictType?: string) {
    const where: any = {};
    if (dictType) where.dictType = dictType;
    return this.dictRepo.find({
      where,
      order: { dictType: 'ASC', sort: 'ASC' },
    });
  }

  /** 所有字典类型 */
  async types() {
    const rows = await this.dictRepo
      .createQueryBuilder('d')
      .select('DISTINCT d.dict_type', 'dictType')
      .getRawMany();
    return rows.map((r) => r.dictType);
  }

  async create(data: Partial<Dict>, user: CurrentUserPayload) {
    const dict = this.dictRepo.create({
      ...auditOnCreate(user),
      dictType: data.dictType,
      dictLabel: data.dictLabel,
      dictValue: data.dictValue,
      sort: data.sort ?? 0,
      status: 1,
      remark: data.remark,
      parentValue: data.parentValue || null,
    });
    const saved = await this.dictRepo.save(dict);
    return { id: saved.id };
  }

  /**
   * 代码保留字典项：(dict_type, dict_value) 命中即禁止删除/修改值/停用。
   * surface_type.none 是外发必填逻辑的判断依据（共享包 SURFACE_NONE，§7.16）。
   */
  private static readonly RESERVED_DICT_ITEMS: Array<{ type: string; value: string }> = [
    { type: 'surface_type', value: 'none' },
  ];

  private assertNotReserved(dict: Dict, action: string, changingValue?: string) {
    const hit = DictService.RESERVED_DICT_ITEMS.some(
      (r) => r.type === dict.dictType && r.value === dict.dictValue,
    );
    if (hit && (changingValue === undefined || changingValue !== dict.dictValue)) {
      throw new BadRequestException(
        `「${dict.dictLabel}」是系统保留字典项（${dict.dictType}.${dict.dictValue}），不允许${action}`,
      );
    }
  }

  async update(id: number, data: Partial<Dict>, user: CurrentUserPayload) {
    const dict = await this.dictRepo.findOne({ where: { id } });
    if (!dict) throw new NotFoundException('字典项不存在');
    // 保留项：禁止改值与停用（改 label/排序/备注放行）
    if (data.dictValue !== undefined && data.dictValue !== dict.dictValue) {
      this.assertNotReserved(dict, '修改字典值', data.dictValue);
    }
    if (data.status !== undefined && data.status !== 1) {
      this.assertNotReserved(dict, '停用');
    }
    await this.dictRepo.update(id, {
      ...auditOnUpdate(user),
      dictLabel: data.dictLabel ?? dict.dictLabel,
      dictValue: data.dictValue ?? dict.dictValue,
      sort: data.sort ?? dict.sort,
      status: data.status ?? dict.status,
      remark: data.remark ?? dict.remark,
      // parentValue：显式传入时更新（空串视为清空），未传入时保留原值
      parentValue:
        data.parentValue !== undefined
          ? data.parentValue || null
          : dict.parentValue,
    });
    return { id };
  }

  /**
   * 字典类型 → 引用校验配置（表名/列名口径，原生 SQL 探测）。
   * 业务表在后续里程碑陆续落地，表尚未建时该项校验自动跳过（try/catch 兜底）；
   * multi=true 表示多选组合串字段（如 product_type），用 FIND_IN_SET 判断包含。
   */
  private static readonly DICT_REF_CHECKS: {
    dictType: string;
    refs: { table: string; column: string; numeric?: boolean; multi?: boolean }[];
  }[] = [
    {
      dictType: 'product_type',
      refs: [
        { table: 't_order_product', column: 'product_type', multi: true },
        { table: 't_material', column: 'product_type', multi: true },
      ],
    },
    {
      dictType: 'rail_section',
      refs: [
        { table: 't_order_product', column: 'rail_section' },
        { table: 't_material', column: 'rail_section' },
      ],
    },
    {
      dictType: 'part_type',
      refs: [
        { table: 't_order_part', column: 'part_type' },
        { table: 't_material', column: 'part_type' },
      ],
    },
    {
      dictType: 'order_unit',
      refs: [
        { table: 't_order_product', column: 'unit' },
        { table: 't_material', column: 'unit' },
      ],
    },
    {
      // 表面处理为字符串字典值（决策 #4）；none 为代码保留值，删除在 remove() 中单独拦截
      dictType: 'surface_type',
      refs: [{ table: 't_order_product', column: 'surface_type' }],
    },
    {
      dictType: 'part_group_type',
      refs: [{ table: 't_order_part_group', column: 'group_type' }],
    },
    {
      dictType: 'assembly_workshop',
      refs: [
        { table: 't_order_product', column: 'assembly_workshop' },
        { table: 't_assembly_batch', column: 'workshop' },
      ],
    },
  ];

  async remove(id: number) {
    const dict = await this.dictRepo.findOne({ where: { id } });
    if (!dict) throw new NotFoundException('字典项不存在');

    // 代码保留项禁止删除（如 surface_type.none）
    this.assertNotReserved(dict, '删除');

    // 引用完整性校验：该字典项被业务记录引用时禁止删除，建议停用
    const refConfig = DictService.DICT_REF_CHECKS.find(
      (c) => c.dictType === dict.dictType,
    );
    if (refConfig) {
      for (const ref of refConfig.refs) {
        // 数值型字段（tinyint）：dictValue 转 number 比对；非法数值跳过
        const value: string | number = ref.numeric ? Number(dict.dictValue) : dict.dictValue;
        if (ref.numeric && !Number.isFinite(value as number)) continue;
        let count = 0;
        try {
          const where = ref.multi
            ? `FIND_IN_SET(?, ${ref.column})`
            : `${ref.column} = ?`;
          const rows: Array<{ cnt: string }> = await this.dataSource.query(
            `SELECT COUNT(*) AS cnt FROM ${ref.table} WHERE ${where}`,
            [value],
          );
          count = Number(rows?.[0]?.cnt ?? 0);
        } catch {
          count = 0; // 业务表尚未建（后续里程碑落地），视为无引用
        }
        if (count > 0) {
          throw new BadRequestException(
            `该字典项已被 ${count} 条业务记录引用，无法删除，建议改为「停用」`,
          );
        }
      }
    }

    await this.dictRepo.delete(id);
    return { id };
  }

  // ===================== 导出 / 导入 =====================

  /** 导出字典到 xlsx（可按类型筛选，或按 ids 导出指定记录） */
  async exportToExcel(dictType?: string, ids?: number[]): Promise<Buffer> {
    let list: Dict[];
    if (ids && ids.length) {
      list = await this.dictRepo.find({
        where: { id: In(ids) },
        order: { dictType: 'ASC', sort: 'ASC' },
      });
    } else {
      list = await this.findList(dictType);
    }
    // 空结果拒绝而不是给一张只有表头的空表（与其余导出同口径）
    if (!list.length) {
      throw new BadRequestException('当前条件下没有字典项可导出，请调整筛选条件后重试');
    }
    const cols = IMPORT_COLUMNS;

    const wb = new ExcelJS.Workbook();
    wb.creator = '海宝五金 MES';
    wb.created = new Date();

    const ws = wb.addWorksheet('数据字典', {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }],
    });
    ws.columns = cols.map((c) => ({ key: c.field as string, width: c.width }));

    const thin = (argb: string): Partial<ExcelJS.Borders> => ({
      top: { style: 'thin', color: { argb } },
      bottom: { style: 'thin', color: { argb } },
      left: { style: 'thin', color: { argb } },
      right: { style: 'thin', color: { argb } },
    });

    // 表头
    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    cols.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { name: '微软雅黑', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      cell.border = thin('FFBFBFBF');
    });

    // 数据行
    list.forEach((item, rowIdx) => {
      const row = ws.getRow(rowIdx + 2);
      row.height = 20;
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        let val: any = '';
        if (c.field === 'dictType') val = item.dictType;
        else if (c.field === 'dictLabel') val = item.dictLabel;
        else if (c.field === 'dictValue') val = item.dictValue;
        else if (c.field === 'sort') val = item.sort;
        else if (c.field === 'status') val = item.status === 1 ? '启用' : '停用';
        else if (c.field === 'parentValue') val = item.parentValue ?? '';
        else if (c.field === 'remark') val = item.remark ?? '';
        cell.value = val;
        cell.border = thin('FFE5E7EB');
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: '微软雅黑', size: 10, color: { argb: 'FF374151' } };
      });
    });

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** 生成带基础美化的导入模板 xlsx */
  async buildImportTemplate(): Promise<Buffer> {
    const cols = IMPORT_COLUMNS;
    const colCount = cols.length;

    const wb = new ExcelJS.Workbook();
    wb.creator = '海宝五金 MES';
    wb.created = new Date();

    const ws = wb.addWorksheet('字典导入', {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 3 }],
    });
    ws.columns = cols.map((c) => ({ key: c.field as string, width: c.width }));

    const thin = (argb: string): Partial<ExcelJS.Borders> => ({
      top: { style: 'thin', color: { argb } },
      bottom: { style: 'thin', color: { argb } },
      left: { style: 'thin', color: { argb } },
      right: { style: 'thin', color: { argb } },
    });

    // 第 1 行：标题
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = '数据字典批量导入模板';
    titleCell.font = { name: '微软雅黑', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    ws.getRow(1).height = 26;

    // 第 2 行：填写说明
    ws.mergeCells(2, 1, 2, colCount);
    const noteCell = ws.getCell(2, 1);
    noteCell.value =
      '填写说明：\n' +
      '① 表头带 * 为必填；② 字典类型+键值 组合需全局唯一，重复的行将被跳过；③ 状态填「启用」或「停用」，默认启用；④ 请从第 4 行开始逐行填写，请勿修改或删除表头。';
    noteCell.font = { name: '微软雅黑', size: 10, color: { argb: 'FFB45309' } };
    noteCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    ws.getRow(2).height = 56;

    // 第 3 行：表头
    const headerRow = ws.getRow(3);
    headerRow.height = 22;
    cols.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.required ? `${c.header} *` : c.header;
      cell.font = { name: '微软雅黑', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: c.required ? 'FFDC2626' : 'FF3B82F6' },
      };
      cell.border = thin('FFBFBFBF');
    });

    // 第 4 行起：预置空白数据行
    const dataRows = 100;
    for (let r = 4; r < 4 + dataRows; r++) {
      const row = ws.getRow(r);
      row.height = 20;
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.border = thin('FFE5E7EB');
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: '微软雅黑', size: 10, color: { argb: 'FF374151' } };
      });
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** 解析上传的 xlsx 并批量入库（严格预校验：发现任何错误即终止，不入库） */
  async importFromExcel(buffer: Buffer, user: CurrentUserPayload) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('无法解析 Excel 文件，请使用下载的模板另存为 .xlsx 后再上传');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel 中未找到工作表');

    // 定位表头行（前 10 行内查找含「字典类型」的行）
    let headerRowNo = -1;
    const maxScan = Math.min(ws.rowCount, 10);
    for (let r = 1; r <= maxScan; r++) {
      let found = false;
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        if (normalizeHeader(cellText(cell.value)) === '字典类型') found = true;
      });
      if (found) {
        headerRowNo = r;
        break;
      }
    }
    if (headerRowNo === -1) {
      throw new BadRequestException('未找到表头（缺少「字典类型」列），请使用下载的模板填写');
    }

    // 建立 表头字段 → 列号 映射
    const colMap: Partial<Record<keyof ImportRow, number>> = {};
    ws.getRow(headerRowNo).eachCell({ includeEmpty: false }, (cell, colNo) => {
      const h = normalizeHeader(cellText(cell.value));
      const col = IMPORT_COLUMNS.find((c) => c.header === h);
      if (col) colMap[col.field] = colNo;
    });

    const errors: { row: number; message: string }[] = [];
    const rows: any[] = [];

    // ===================== 阶段一：解析 + 逐行校验 =====================
    for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (field: keyof ImportRow): string => {
        const colNo = colMap[field];
        return colNo ? cellText(row.getCell(colNo).value).trim() : '';
      };

      // 跳过整行空白
      const hasAny = IMPORT_COLUMNS.some((c) => get(c.field) !== '');
      if (!hasAny) continue;

      const rowErrors: string[] = [];

      const dictType = get('dictType');
      if (!dictType) rowErrors.push('「字典类型」必填');

      const dictLabel = get('dictLabel');
      if (!dictLabel) rowErrors.push('「标签」必填');

      const dictValue = get('dictValue');
      if (!dictValue) rowErrors.push('「键值」必填');

      // 排序：可选，必须为非负整数
      const sortRaw = get('sort');
      let sortNum = 0;
      if (sortRaw) {
        sortNum = Number(sortRaw);
        if (isNaN(sortNum) || !Number.isInteger(sortNum) || sortNum < 0) {
          rowErrors.push(`「排序」必须为非负整数，当前值「${sortRaw}」无效`);
        }
      }

      // 状态：可选，启用/停用，默认启用
      const statusRaw = get('status');
      let status = 1;
      if (statusRaw) {
        if (statusRaw === '启用' || statusRaw === '1') status = 1;
        else if (statusRaw === '停用' || statusRaw === '0') status = 0;
        else rowErrors.push(`「状态」只能为「启用」或「停用」，当前值「${statusRaw}」无效`);
      }

      if (rowErrors.length) {
        errors.push({ row: r, message: rowErrors.join('；') });
        continue;
      }

      rows.push({
        dictType,
        dictLabel,
        dictValue,
        sort: sortNum,
        status,
        parentValue: get('parentValue') || null,
        remark: get('remark') || null,
      });
    }

    if (!rows.length) {
      throw new BadRequestException('Excel 中未找到任何数据行，请填写后再上传');
    }

    // ===== 本批次内 唯一性校验（字典类型+键值 不可重复） =====
    const seenKeys = new Set<string>();
    for (const row of rows) {
      const key = `${row.dictType}||${row.dictValue}`;
      if (seenKeys.has(key)) {
        errors.push({ row: (rows.indexOf(row) + headerRowNo + 1), message: `「字典类型+键值」组合「${row.dictType}/${row.dictValue}」与本批次内其他行重复` });
      } else {
        seenKeys.add(key);
      }
    }

    // ===== 库内已存在 唯一性校验 =====
    const dictTypes = Array.from(new Set(rows.map((r) => r.dictType)));
    if (dictTypes.length) {
      const existRows = await this.dictRepo.find({
        where: { dictType: In(dictTypes) },
        select: ['dictType', 'dictValue'],
      });
      const existKeys = new Set(existRows.map((r) => `${r.dictType}||${r.dictValue}`));
      rows.forEach((row, idx) => {
        const key = `${row.dictType}||${row.dictValue}`;
        if (existKeys.has(key)) {
          errors.push({ row: idx + headerRowNo + 1, message: `「字典类型+键值」组合「${row.dictType}/${row.dictValue}」已存在于系统中` });
        }
      });
    }

    // ===== 预校验不通过：终止导入 =====
    if (errors.length) {
      errors.sort((a, b) => a.row - b.row);
      return {
        total: rows.length,
        success: 0,
        failed: errors.length,
        aborted: true,
        errors: errors.slice(0, 500),
      };
    }

    // ===================== 阶段二：全部校验通过，执行入库 =====================
    const entities = rows.map((r) =>
      this.dictRepo.create({
        ...auditOnCreate(user),
        dictType: r.dictType,
        dictLabel: r.dictLabel,
        dictValue: r.dictValue,
        sort: r.sort,
        status: r.status,
        parentValue: r.parentValue,
        remark: r.remark,
      }),
    );
    const saved = await this.dictRepo.save(entities);

    return {
      total: saved.length,
      success: saved.length,
      failed: 0,
      aborted: false,
      errors: [],
    };
  }
}
