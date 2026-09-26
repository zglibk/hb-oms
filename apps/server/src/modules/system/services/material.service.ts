import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Material } from '../entities/material.entity';
import {
  CreateMaterialDto,
  UpdateMaterialDto,
  QueryMaterialDto,
} from '../dto/material.dto';
import { DictService } from './dict.service';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../../common/utils/audit.util';

/** 导入模板列定义（同时用于生成模板与解析导入，保证表头一致） */
interface ImportColumn {
  header: string;
  field: keyof ImportRow;
  required: boolean;
  width: number;
  /** 关联字典类型（填写中文标签，导入时转换为 dict_value） */
  dict?: string;
}

interface ImportRow {
  materialCode: string;
  itemNo: string | null;
  productName: string | null;
  spec: string | null;
  productType: string | null;
  railSection: string | null;
  partType: string | null;
  unit: string | null;
  sheetMaterial: string | null;
  materialThickness: string | null;
  unitWeight: string | null;
  drawingNo: string | null;
  remark: string | null;
}

const IMPORT_COLUMNS: ImportColumn[] = [
  { header: '部件代码', field: 'materialCode', required: true, width: 18 },
  { header: '产品代码', field: 'itemNo', required: true, width: 14 },
  { header: '产品名称', field: 'productName', required: false, width: 22 },
  { header: '规格', field: 'spec', required: false, width: 14 },
  { header: '产品类型', field: 'productType', required: false, width: 12, dict: 'product_type' },
  { header: '默认产品类别', field: 'railSection', required: false, width: 12, dict: 'rail_section' },
  { header: '部件', field: 'partType', required: false, width: 12, dict: 'part_type' },
  { header: '材质', field: 'sheetMaterial', required: false, width: 12 },
  { header: '料厚', field: 'materialThickness', required: false, width: 12 },
  { header: '单重(kg)', field: 'unitWeight', required: false, width: 10 },
  { header: '图号', field: 'drawingNo', required: false, width: 16 },
  { header: '备注', field: 'remark', required: false, width: 20 },
];

/** 单个字典类型的选项索引 */
interface DictOption {
  labels: string[];
  /** 中文标签 → dict_value */
  labelToValue: Record<string, string>;
  /** dict_value → 中文标签 */
  valueToLabel: Record<string, string>;
  /** 合法 dict_value 集合（允许直接填值） */
  values: Set<string>;
}

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

@Injectable()
export class MaterialService {
  constructor(
    @InjectRepository(Material)
    private readonly repo: Repository<Material>,
    private readonly dictService: DictService,
    private readonly dataSource: DataSource,
  ) {}

  /** 按部件代码精确查询（供订单录入带出） */
  async findByCode(materialCode: string) {
    return this.repo.findOne({ where: { materialCode, status: 1 } });
  }

  /** 分页列表 */
  async findList(query: QueryMaterialDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.repo.createQueryBuilder('m');
    if (query.status != null) qb.andWhere('m.status = :s', { s: query.status });
    if (query.itemNo) qb.andWhere('m.itemNo = :itemNo', { itemNo: query.itemNo });
    if (query.keyword) {
      qb.andWhere(
        '(m.material_code LIKE :kw OR m.product_name LIKE :kw OR m.itemNo LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }
    qb.orderBy('m.itemNo', 'ASC').addOrderBy('m.materialCode', 'ASC');
    qb.skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /** 所有货号（用于筛选下拉） */
  async itemNumbers() {
    const rows = await this.repo
      .createQueryBuilder('m')
      .select('DISTINCT m.itemNo', 'itemNo')
      .where('m.itemNo IS NOT NULL')
      .getRawMany();
    return rows.map((r) => r.itemNo).filter(Boolean);
  }

  async create(dto: CreateMaterialDto, user: CurrentUserPayload) {
    const exists = await this.repo.findOne({ where: { materialCode: dto.materialCode } });
    if (exists) throw new ConflictException(`部件代码 ${dto.materialCode} 已存在`);
    const saved = await this.repo.save(
      this.repo.create({ ...dto, ...auditOnCreate(user) }),
    );
    return { id: saved.id };
  }

  async update(id: number, dto: UpdateMaterialDto, user: CurrentUserPayload) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('部件不存在');
    await this.repo.update(id, { ...dto, ...auditOnUpdate(user) });
    return { id };
  }

  async remove(id: number) {
    const material = await this.repo.findOne({ where: { id } });
    if (!material) throw new NotFoundException('部件不存在');

    // 引用完整性校验：部件被订单产品引用时禁止删除，建议停用。
    // 订单模块（t_order_product）在 M2 里程碑落地，此处用原生 SQL 探测，表尚未建时视为无引用。
    let refCount = 0;
    try {
      const rows: Array<{ cnt: string }> = await this.dataSource.query(
        'SELECT COUNT(*) AS cnt FROM t_order_product WHERE material_id = ? OR material_code = ?',
        [id, material.materialCode ?? ''],
      );
      refCount = Number(rows?.[0]?.cnt ?? 0);
    } catch {
      refCount = 0;
    }
    if (refCount > 0) {
      throw new BadRequestException(
        `该部件已被 ${refCount} 条订单产品引用，无法删除，建议改为「停用」`,
      );
    }

    await this.repo.delete(id);
    return { id };
  }

  // ===================== 批量导入 / 模板 =====================

  /** 读取字典选项（产品类型/部件/单位），用于模板下拉与导入时标签→值转换 */
  private async loadDictOptions(): Promise<Record<string, DictOption>> {
    const types = Array.from(
      new Set(IMPORT_COLUMNS.map((c) => c.dict).filter(Boolean) as string[]),
    );
    const result: Record<string, DictOption> = {};
    for (const t of types) {
      const rows = await this.dictService.byType(t);
      const labels: string[] = [];
      const labelToValue: Record<string, string> = {};
      const valueToLabel: Record<string, string> = {};
      const values = new Set<string>();
      rows.forEach((r) => {
        if (r.dictLabel) labels.push(r.dictLabel);
        if (r.dictLabel) labelToValue[r.dictLabel] = r.dictValue;
        if (r.dictValue != null) {
          values.add(String(r.dictValue));
          if (r.dictLabel) valueToLabel[String(r.dictValue)] = r.dictLabel;
        }
      });
      result[t] = { labels, labelToValue, valueToLabel, values };
    }
    return result;
  }

  /** 生成带基础美化的导入模板 xlsx（标题、说明、表头着色、下拉、参照表） */
  async buildImportTemplate(): Promise<Buffer> {
    const dictOptions = await this.loadDictOptions();
    const cols = IMPORT_COLUMNS;
    const colCount = cols.length;

    const wb = new ExcelJS.Workbook();
    wb.creator = '海宝五金 OMS';
    wb.created = new Date();

    const ws = wb.addWorksheet('部件导入', {
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
    titleCell.value = '部件信息批量导入模板';
    titleCell.font = { name: '微软雅黑', bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    ws.getRow(1).height = 30;

    // 第 2 行：填写说明
    ws.mergeCells(2, 1, 2, colCount);
    const noteCell = ws.getCell(2, 1);
    noteCell.value =
      '填写说明：① 表头带 * 为必填；② 部件代码需全局唯一，与系统已有或本表内重复的行将被跳过；' +
      '③「产品类型/默认产品类别/部件/单位」请点击单元格从下拉选择；④ 默认产品类别为二节轨/三节轨，订单录入时可自动带出；⑤ 请从第 4 行开始逐行填写，请勿修改或删除表头。';
    noteCell.font = { name: '微软雅黑', size: 10, color: { argb: 'FFB45309' } };
    noteCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    ws.getRow(2).height = 36;

    // 第 3 行：表头
    const headerRow = ws.getRow(3);
    headerRow.height = 24;
    cols.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.required ? `${c.header} *` : c.header;
      cell.font = { name: '微软雅黑', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: c.required ? 'FFDC2626' : 'FF3B82F6' },
      };
      cell.border = thin('FFBFBFBF');
    });

    // 第 4 行起：预置空白数据行（含边框与下拉），方便直接填写
    const dataRows = 100;
    for (let r = 4; r < 4 + dataRows; r++) {
      const row = ws.getRow(r);
      row.height = 20;
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.border = thin('FFE5E7EB');
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: '微软雅黑', size: 10, color: { argb: 'FF374151' } };
        if (c.dict) {
          const labels = dictOptions[c.dict]?.labels ?? [];
          const joined = labels.join(',');
          // Excel 内联列表长度上限约 255，且标签不含逗号时才用下拉
          if (labels.length && joined.length < 250 && !joined.includes('"')) {
            cell.dataValidation = {
              type: 'list',
              allowBlank: true,
              formulae: [`"${joined}"`],
              showErrorMessage: true,
              errorStyle: 'warning',
              errorTitle: '提示',
              error: '建议从下拉列表中选择，如需自定义可忽略此提示',
            };
          }
        }
      });
    }

    // 参照表：列出各字典可选项，作为下拉不可用时的备选参考
    const refWs = wb.addWorksheet('字典参照', {
      views: [{ showGridLines: false }],
    });
    refWs.columns = [
      { key: 'type', width: 16 },
      { key: 'label', width: 22 },
    ];
    refWs.mergeCells(1, 1, 1, 2);
    const refTitle = refWs.getCell(1, 1);
    refTitle.value = '可选项参照（填写「产品类型/产品类别/部件/单位」时对应中文）';
    refTitle.font = { name: '微软雅黑', bold: true, size: 12, color: { argb: 'FF1F2937' } };
    refTitle.alignment = { vertical: 'middle', horizontal: 'left' };
    refWs.getRow(1).height = 26;
    const refHeader = refWs.getRow(2);
    ['字段', '可选值'].forEach((h, i) => {
      const cell = refHeader.getCell(i + 1);
      cell.value = h;
      cell.font = { name: '微软雅黑', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      cell.border = thin('FFBFBFBF');
    });
    const dictColMeta = cols.filter((c) => c.dict);
    let refRowNo = 3;
    dictColMeta.forEach((c) => {
      const labels = dictOptions[c.dict as string]?.labels ?? [];
      const startRow = refRowNo;
      (labels.length ? labels : ['（暂无字典项，请先在字典管理维护）']).forEach((label) => {
        const row = refWs.getRow(refRowNo);
        row.getCell(2).value = label;
        row.getCell(1).border = thin('FFE5E7EB');
        row.getCell(2).border = thin('FFE5E7EB');
        row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(2).font = { name: '微软雅黑', size: 10, color: { argb: 'FF374151' } };
        refRowNo++;
      });
      // 合并字段名单元格
      refWs.mergeCells(startRow, 1, refRowNo - 1, 1);
      const nameCell = refWs.getCell(startRow, 1);
      nameCell.value = c.header;
      nameCell.font = { name: '微软雅黑', bold: true, size: 10, color: { argb: 'FF1F2937' } };
      nameCell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** 解析上传的 xlsx 并批量入库，返回逐行结果汇总 */
  async importFromExcel(buffer: Buffer, user: CurrentUserPayload) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('无法解析 Excel 文件，请使用下载的模板另存为 .xlsx 后再上传');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel 中未找到工作表');

    // 定位表头行（前 10 行内查找含「部件代码」的行）
    let headerRowNo = -1;
    const maxScan = Math.min(ws.rowCount, 10);
    for (let r = 1; r <= maxScan; r++) {
      let found = false;
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        if (normalizeHeader(cellText(cell.value)) === '部件代码') found = true;
      });
      if (found) {
        headerRowNo = r;
        break;
      }
    }
    if (headerRowNo === -1) {
      throw new BadRequestException('未找到表头（缺少「部件代码」列），请使用下载的模板填写');
    }

    // 建立 表头字段 → 列号 映射（兼容旧表头「默认节数」「产品类别」）
    const headerAliases: Record<string, keyof ImportRow> = {
      默认节数: 'railSection',
      产品类别: 'railSection',
      // 2026-09-25「货号」改名「产品代码」：用户手上已下载的旧模板仍是「货号」表头，照认
      货号: 'itemNo',
    };
    const colMap: Partial<Record<keyof ImportRow, number>> = {};
    ws.getRow(headerRowNo).eachCell({ includeEmpty: false }, (cell, colNo) => {
      const h = normalizeHeader(cellText(cell.value));
      const col = IMPORT_COLUMNS.find((c) => c.header === h);
      if (col) colMap[col.field] = colNo;
      else if (headerAliases[h] && !colMap[headerAliases[h]]) {
        colMap[headerAliases[h]] = colNo;
      }
    });

    const dictOptions = await this.loadDictOptions();
    const errors: { row: number; materialCode: string; message: string }[] = [];
    const candidates: { rowNo: number; data: Partial<Material> }[] = [];
    const seenCodes = new Map<string, number>();

    const mapDict = (raw: string, type: string): string | null => {
      if (!raw) return null;
      const dm = dictOptions[type];
      if (!dm) return raw;
      if (dm.values.has(raw)) return raw; // 已是字典值
      // 标签精确匹配
      if (dm.labelToValue[raw] !== undefined) return dm.labelToValue[raw];
      // 大小写不敏感匹配（PCS/pcs）
      const lower = raw.toLowerCase();
      for (const value of dm.values) {
        if (String(value).toLowerCase() === lower) return value;
      }
      for (const [label, value] of Object.entries(dm.labelToValue)) {
        if (String(label).toLowerCase() === lower) return value;
      }
      // 订单单位 / 产品类别必须可解析；其余字典仍宽松保留，避免整表阻断
      if (type === 'order_unit' || type === 'rail_section') return null;
      return raw;
    };

    for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (field: keyof ImportRow): string => {
        const colNo = colMap[field];
        return colNo ? cellText(row.getCell(colNo).value).trim() : '';
      };

      // 跳过整行空白
      const hasAny = IMPORT_COLUMNS.some((c) => get(c.field) !== '');
      if (!hasAny) continue;

      const materialCode = get('materialCode');
      const itemNo = get('itemNo');
      const rowErrors: string[] = [];
      if (!materialCode) rowErrors.push('部件代码必填');
      if (!itemNo) rowErrors.push('产品代码必填');

      if (materialCode) {
        const first = seenCodes.get(materialCode);
        if (first) rowErrors.push(`部件代码与第 ${first} 行重复`);
        else seenCodes.set(materialCode, r);
      }

      const unitRaw = get('unit');
      const unit = mapDict(unitRaw, 'order_unit');
      if (unitRaw && !unit) {
        rowErrors.push('单位无效，请填写字典「订单单位」中的标签（如 支/套）');
      }
      const railRaw = get('railSection');
      const railSection = mapDict(railRaw, 'rail_section');
      if (railRaw && !railSection) {
        rowErrors.push('默认产品类别无效，请填写二节轨或三节轨');
      }

      if (rowErrors.length) {
        errors.push({ row: r, materialCode, message: rowErrors.join('；') });
        continue;
      }

      candidates.push({
        rowNo: r,
        data: {
          materialCode,
          itemNo: itemNo || null,
          productName: get('productName') || null,
          spec: get('spec') || null,
          productType: mapDict(get('productType'), 'product_type'),
          railSection,
          partType: mapDict(get('partType'), 'part_type'),
          unit,
          drawingNo: get('drawingNo') || null,
          remark: get('remark') || null,
        },
      });
    }

    // 与库内已有部件代码比对（一次 IN 查询）
    let existingSet = new Set<string>();
    const codes = candidates.map((c) => c.data.materialCode as string);
    if (codes.length) {
      const existRows = await this.repo.find({
        where: { materialCode: In(codes) },
        select: ['materialCode'],
      });
      existingSet = new Set(existRows.map((r) => r.materialCode));
    }

    const audit = auditOnCreate(user);
    const toInsert: Partial<Material>[] = [];
    for (const c of candidates) {
      if (existingSet.has(c.data.materialCode as string)) {
        errors.push({
          row: c.rowNo,
          materialCode: c.data.materialCode as string,
          message: '部件代码已存在，已跳过',
        });
      } else {
        toInsert.push({ ...c.data, ...audit });
      }
    }

    let success = 0;
    if (toInsert.length) {
      const saved = await this.repo.save(this.repo.create(toInsert));
      success = saved.length;
    }

    errors.sort((a, b) => a.row - b.row);
    return {
      total: success + errors.length,
      success,
      failed: errors.length,
      errors: errors.slice(0, 200),
    };
  }

  // ===================== 导出 Excel =====================

  /** 导出部件清单（不分页；有 ids 时仅导出指定记录，否则按筛选条件导出全部匹配行） */
  async exportList(query: QueryMaterialDto, ids?: number[]): Promise<Buffer> {
    const qb = this.repo.createQueryBuilder('m');
    if (ids && ids.length) {
      qb.andWhere('m.id IN (:...ids)', { ids });
    } else {
      if (query.status != null) qb.andWhere('m.status = :s', { s: query.status });
      if (query.itemNo) qb.andWhere('m.itemNo = :itemNo', { itemNo: query.itemNo });
      if (query.keyword) {
        qb.andWhere(
          '(m.material_code LIKE :kw OR m.product_name LIKE :kw OR m.itemNo LIKE :kw)',
          { kw: `%${query.keyword}%` },
        );
      }
    }
    qb.orderBy('m.itemNo', 'ASC').addOrderBy('m.materialCode', 'ASC');
    const list = await qb.getMany();
    // 空结果拒绝而不是给一张只有表头的空表（与其余导出同口径）
    if (!list.length) {
      throw new BadRequestException('当前筛选条件下没有部件可导出，请调整筛选条件后重试');
    }

    const dictOptions = await this.loadDictOptions();
    const toLabel = (type: string, val: string | null): string => {
      if (!val) return '';
      return dictOptions[type]?.valueToLabel[String(val)] ?? String(val);
    };

    const cols: { header: string; get: (m: Material) => any }[] = [
      { header: '部件代码', get: (m) => m.materialCode ?? '' },
      { header: '产品代码', get: (m) => m.itemNo ?? '' },
      { header: '产品名称', get: (m) => m.productName ?? '' },
      { header: '规格', get: (m) => m.spec ?? '' },
      { header: '产品类型', get: (m) => toLabel('product_type', m.productType) },
      { header: '默认产品类别', get: (m) => toLabel('rail_section', m.railSection) },
      { header: '部件', get: (m) => toLabel('part_type', m.partType) },
      { header: '材质', get: (m) => m.sheetMaterial ?? '' },
      { header: '料厚', get: (m) => m.materialThickness ?? '' },
      { header: '单重(kg)', get: (m) => m.unitWeight ?? '' },
      { header: '图号', get: (m) => m.drawingNo ?? '' },
      { header: '备注', get: (m) => m.remark ?? '' },
    ];

    // 自动列宽：按「表头 + 全部单元格」中最长内容估算，中文/全角字符按 2 个宽度单位计
    const displayWidth = (v: any): number => {
      const s = v == null ? '' : String(v);
      let w = 0;
      for (const ch of s) {
        // 中日韩、全角符号等按 2 单位；其余按 1 单位
        w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch)
          ? 2
          : 1;
      }
      return w;
    };
    const MIN_WIDTH = 8;
    const MAX_WIDTH = 50;
    const LAST_COL_FIXED_WIDTH = 22; // 末列（备注）可能整列为空，固定较宽以保持美观
    const colWidths = cols.map((c, idx) => {
      // 末列固定宽度，避免整列为空时过窄
      if (idx === cols.length - 1) return LAST_COL_FIXED_WIDTH;
      let maxLen = displayWidth(c.header);
      for (const m of list) maxLen = Math.max(maxLen, displayWidth(c.get(m)));
      // +2 作为左右留白
      return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, maxLen + 2));
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = '海宝五金 OMS';
    wb.created = new Date();
    const ws = wb.addWorksheet('部件清单', {
      views: [{ showGridLines: false }], // 取消表格网格线显示
    });
    ws.columns = colWidths.map((w) => ({ width: w }));

    // 表头行
    ws.getRow(1).values = cols.map((c) => c.header);
    // 数据行
    list.forEach((m) => {
      ws.addRow(cols.map((c) => c.get(m)));
    });

    // 样式：10 号字、表头浅灰、数据隔行更浅灰、浅色表格线、水平居中
    const maxCol = cols.length;
    const maxRow = list.length + 1; // 含表头
    const borderColor = 'FFD9D9D9'; // 浅色表格线
    const border: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: borderColor } },
      bottom: { style: 'thin', color: { argb: borderColor } },
      left: { style: 'thin', color: { argb: borderColor } },
      right: { style: 'thin', color: { argb: borderColor } },
    };

    ws.properties.defaultRowHeight = 20;
    for (let rowNo = 1; rowNo <= maxRow; rowNo++) {
      const row = ws.getRow(rowNo);
      row.height = rowNo === 1 ? 22 : 20;
      for (let colNo = 1; colNo <= maxCol; colNo++) {
        const cell = row.getCell(colNo);
        cell.border = { ...border };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        if (rowNo === 1) {
          // 表头行：浅灰填充 + 加粗
          cell.font = { name: 'Bahnschrift', bold: true, size: 10, color: { argb: 'FF1F2937' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        } else {
          cell.font = { name: 'Bahnschrift', size: 10, color: { argb: 'FF374151' } };
          // 记录号隔行变色：更浅的灰色填充
          if (rowNo % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
          }
        }
      }
    }
    // 不冻结表头，仅保持网格线隐藏
    ws.views = [{ showGridLines: false }];

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
