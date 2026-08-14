import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { normalizeVersion } from '@hb-oms/shared';
import { ProductionBom } from './entities/production-bom.entity';
import { ProductionBomItem } from './entities/production-bom-item.entity';
import { ProcessInfo } from '../process-info/entities/process-info.entity';
import { Material } from '../system/entities/material.entity';
import {
  ProductionBomItemDto,
  QueryProductionBomDto,
  SaveProductionBomDto,
} from './dto/production-bom.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditDisplayName, auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import {
  EXPORT_ROW_LIMIT,
  addTipsSheet,
  cellString,
  createWorkbook,
  importRejected,
  styleSheet,
} from '../../common/utils/excel.util';

const BOM_EXPORT_LIMIT = 100;

interface NormalizedBomItem {
  materialId: number | null;
  itemName: string;
  itemCode: string | null;
  spec: string | null;
  quantityPerSet: number | null;
  quantityUnit: string;
  splitLeftRight: number;
  materialThickness: string | null;
  unitConsumption: number | null;
  surfaceTreatment: string | null;
  sheetMaterial: string | null;
  supplierId: number | null;
  supplierName: string | null;
  remark: string | null;
  sort: number;
}

interface NormalizedBomData {
  header: {
    processInfoId: number | null;
    drawingNo: string;
    customerId: number | null;
    customerName: string | null;
    productName: string;
    version: string;
    preparedBy: string;
    preparedDate: string;
  };
  items: NormalizedBomItem[];
}

interface ImportColumn {
  header: string;
  required?: boolean;
  width: number;
}

const IMPORT_COLUMNS: ImportColumn[] = [
  { header: '生产图号', required: true, width: 22 },
  { header: '客户', width: 16 },
  { header: '产品名称', required: true, width: 22 },
  { header: '版本号', required: true, width: 10 },
  { header: '制表人', width: 12 },
  { header: '制表日期', width: 13 },
  { header: '序号', width: 8 },
  { header: '零件名称', required: true, width: 16 },
  { header: '图号（编号）', width: 20 },
  { header: '规格', width: 18 },
  { header: '数量/套', width: 12 },
  { header: '单位', width: 10 },
  { header: '是否分左右', width: 13 },
  { header: '材料厚度', width: 12 },
  { header: '单耗kg/支', width: 13 },
  { header: '表面处理', width: 15 },
  { header: '材质', width: 12 },
  { header: '供应商', width: 16 },
  { header: '备注', width: 24 },
];

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF8D99A8' } },
  left: { style: 'thin', color: { argb: 'FF8D99A8' } },
  bottom: { style: 'thin', color: { argb: 'FF8D99A8' } },
  right: { style: 'thin', color: { argb: 'FF8D99A8' } },
};

function todayText(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function cleanText(v: unknown): string {
  return String(v ?? '').trim();
}

function nullableText(v: unknown): string | null {
  const s = cleanText(v);
  return s || null;
}

function normalizedKey(drawingNo: string, version: string): string {
  return `${drawingNo.trim().toLocaleLowerCase()}\u0000${version.trim().toLocaleLowerCase()}`;
}

function normalizeHeader(v: string): string {
  return v.replace(/[*＊]/g, '').replace(/\s/g, '').trim();
}

function excelCellText(cell: ExcelJS.Cell): string {
  if (cell.value instanceof Date) {
    const d = cell.value;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return cellString(cell).trim();
}

function safeSheetBase(name: string): string {
  return cleanText(name)
    .replace(/[\\/?*:]/g, '_')
    .replace(/\[/g, '_')
    .replace(/]/g, '_')
    .replace(/^'+|'+$/g, '') || 'BOM';
}

function safeFileBase(name: string): string {
  return cleanText(name).replace(/[\\/:*?"<>|]/g, '_') || 'BOM';
}

@Injectable()
export class ProductionBomService {
  constructor(
    @InjectRepository(ProductionBom)
    private readonly bomRepo: Repository<ProductionBom>,
    @InjectRepository(ProductionBomItem)
    private readonly itemRepo: Repository<ProductionBomItem>,
    @InjectRepository(ProcessInfo)
    private readonly processRepo: Repository<ProcessInfo>,
    @InjectRepository(Material)
    private readonly materialRepo: Repository<Material>,
    private readonly dataSource: DataSource,
  ) {}

  private listQuery(query: QueryProductionBomDto): SelectQueryBuilder<ProductionBom> {
    const qb = this.bomRepo.createQueryBuilder('b');
    if (query.keyword?.trim()) {
      qb.andWhere(
        `(b.drawingNo LIKE :kw OR b.productName LIKE :kw OR b.customerName LIKE :kw
          OR EXISTS (
            SELECT 1 FROM t_production_bom_item bi
            WHERE bi.bom_id = b.id AND (bi.item_name LIKE :kw OR bi.item_code LIKE :kw)
          ))`,
        { kw: `%${query.keyword.trim()}%` },
      );
    }
    if (query.customerId != null) qb.andWhere('b.customerId = :customerId', { customerId: query.customerId });
    if (query.version?.trim()) qb.andWhere('b.version = :version', { version: query.version.trim() });
    return qb;
  }

  async findList(query: QueryProductionBomDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const qb = this.listQuery(query)
      .orderBy('b.updatedAt', 'DESC')
      .addOrderBy('b.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    const counts = await this.itemCounts(list.map((b) => b.id));
    return {
      list: list.map((b) => ({ ...b, itemCount: counts.get(b.id) ?? 0 })),
      total,
      page,
      pageSize,
    };
  }

  private async itemCounts(ids: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (!ids.length) return map;
    const rows: Array<{ bomId: string; count: string }> = await this.itemRepo
      .createQueryBuilder('i')
      .select('i.bomId', 'bomId')
      .addSelect('COUNT(*)', 'count')
      .where('i.bomId IN (:...ids)', { ids })
      .groupBy('i.bomId')
      .getRawMany();
    rows.forEach((r) => map.set(Number(r.bomId), Number(r.count)));
    return map;
  }

  async findOne(id: number) {
    const bom = await this.bomRepo.findOne({ where: { id } });
    if (!bom) throw new NotFoundException('生产BOM不存在');
    const items = await this.itemRepo.find({
      where: { bomId: id },
      order: { sort: 'ASC', id: 'ASC' },
    });
    return {
      ...bom,
      items: items.map((i) => ({
        ...i,
        quantityPerSet: i.quantityPerSet == null ? null : Number(i.quantityPerSet),
        unitConsumption: i.unitConsumption == null ? null : Number(i.unitConsumption),
        splitLeftRight: i.splitLeftRight === 1,
      })),
    };
  }

  async processOptions(keyword?: string) {
    const qb = this.processRepo
      .createQueryBuilder('p')
      .select([
        'p.id',
        'p.drawingNo',
        'p.customerId',
        'p.customerName',
        'p.productName',
        'p.dimension',
      ]);
    if (keyword?.trim()) {
      qb.where('(p.drawingNo LIKE :kw OR p.customerName LIKE :kw OR p.productName LIKE :kw)', {
        kw: `%${keyword.trim()}%`,
      });
    }
    return qb.orderBy('p.updatedAt', 'DESC').take(30).getMany();
  }

  async materialOptions(keyword?: string) {
    const qb = this.materialRepo
      .createQueryBuilder('m')
      .select([
        'm.id',
        'm.materialCode',
        'm.itemNo',
        'm.productName',
        'm.spec',
        'm.drawingNo',
        'm.materialThickness',
        'm.unitWeight',
        'm.sheetMaterial',
      ])
      .where('m.status = 1');
    if (keyword?.trim()) {
      qb.andWhere(
        '(m.materialCode LIKE :kw OR m.itemNo LIKE :kw OR m.productName LIKE :kw OR m.drawingNo LIKE :kw)',
        { kw: `%${keyword.trim()}%` },
      );
    }
    return qb.orderBy('m.itemNo', 'ASC').addOrderBy('m.materialCode', 'ASC').take(50).getMany();
  }

  private normalizePayload(dto: SaveProductionBomDto): NormalizedBomData {
    const drawingNo = cleanText(dto.drawingNo);
    const productName = cleanText(dto.productName);
    const version = normalizeVersion(dto.version) ?? '';
    const preparedBy = cleanText(dto.preparedBy);
    const preparedDate = cleanText(dto.preparedDate);
    if (!drawingNo) throw new BadRequestException('生产图号必填');
    if (!productName) throw new BadRequestException('产品名称必填');
    if (!version) throw new BadRequestException('版本号必填');
    if (!preparedBy) throw new BadRequestException('制表人必填');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(preparedDate) || Number.isNaN(new Date(`${preparedDate}T00:00:00`).getTime())) {
      throw new BadRequestException('制表日期格式应为YYYY-MM-DD');
    }
    if (!Array.isArray(dto.items) || !dto.items.length) throw new BadRequestException('至少添加一条BOM明细');
    if (dto.items.length > EXPORT_ROW_LIMIT) throw new BadRequestException(`单份BOM不能超过${EXPORT_ROW_LIMIT}条明细`);

    const assertLength = (value: string | null, max: number, label: string) => {
      if (value && value.length > max) throw new BadRequestException(`${label}不能超过${max}字符`);
    };
    assertLength(drawingNo, 128, '生产图号');
    assertLength(productName, 128, '产品名称');
    assertLength(version, 32, '版本号');
    assertLength(preparedBy, 64, '制表人');

    const items = dto.items.map((raw: ProductionBomItemDto, index): NormalizedBomItem => {
      const itemName = cleanText(raw.itemName);
      if (!itemName) throw new BadRequestException(`第${index + 1}条明细：零件名称必填`);
      const qty = raw.quantityPerSet === null || raw.quantityPerSet === undefined || raw.quantityPerSet === ('' as any)
        ? null
        : Number(raw.quantityPerSet);
      const consumption = raw.unitConsumption === null || raw.unitConsumption === undefined || raw.unitConsumption === ('' as any)
        ? null
        : Number(raw.unitConsumption);
      if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
        throw new BadRequestException(`第${index + 1}条明细：数量/套必须是不小于0的数字`);
      }
      if (consumption !== null && (!Number.isFinite(consumption) || consumption < 0)) {
        throw new BadRequestException(`第${index + 1}条明细：单耗必须是不小于0的数字`);
      }
      if (!(qty != null && qty > 0) && !(consumption != null && consumption > 0)) {
        throw new BadRequestException(`第${index + 1}条明细：数量/套和单耗kg/支至少填写一项且必须大于0`);
      }
      const result: NormalizedBomItem = {
        materialId: raw.materialId ?? null,
        itemName,
        itemCode: nullableText(raw.itemCode),
        spec: nullableText(raw.spec),
        quantityPerSet: qty,
        quantityUnit: cleanText(raw.quantityUnit) || 'PCS',
        splitLeftRight: raw.splitLeftRight ? 1 : 0,
        materialThickness: nullableText(raw.materialThickness),
        unitConsumption: consumption,
        surfaceTreatment: nullableText(raw.surfaceTreatment),
        sheetMaterial: nullableText(raw.sheetMaterial),
        supplierId: raw.supplierId ?? null,
        supplierName: nullableText(raw.supplierName),
        remark: nullableText(raw.remark),
        sort: index,
      };
      assertLength(result.itemName, 128, `第${index + 1}条明细零件名称`);
      assertLength(result.itemCode, 128, `第${index + 1}条图号（编号）`);
      assertLength(result.spec, 128, `第${index + 1}条规格`);
      assertLength(result.quantityUnit, 16, `第${index + 1}条单位`);
      assertLength(result.materialThickness, 32, `第${index + 1}条材料厚度`);
      assertLength(result.surfaceTreatment, 64, `第${index + 1}条表面处理`);
      assertLength(result.sheetMaterial, 64, `第${index + 1}条材质`);
      assertLength(result.supplierName, 128, `第${index + 1}条供应商`);
      assertLength(result.remark, 255, `第${index + 1}条备注`);
      return result;
    });

    return {
      header: {
        processInfoId: dto.processInfoId ?? null,
        drawingNo,
        customerId: dto.customerId ?? null,
        customerName: nullableText(dto.customerName),
        productName,
        version,
        preparedBy,
        preparedDate,
      },
      items,
    };
  }

  private async assertUnique(drawingNo: string, version: string, excludeId?: number) {
    const qb = this.bomRepo
      .createQueryBuilder('b')
      .where('b.drawingNo = :drawingNo AND b.version = :version', { drawingNo, version });
    if (excludeId) qb.andWhere('b.id <> :excludeId', { excludeId });
    if (await qb.getOne()) {
      throw new ConflictException(`生产图号「${drawingNo}」版本「${version}」已存在`);
    }
  }

  private async saveItems(manager: EntityManager, bomId: number, items: NormalizedBomItem[]) {
    const repo = manager.getRepository(ProductionBomItem);
    await repo.save(items.map((i) => repo.create({
      ...i,
      bomId,
      quantityPerSet: i.quantityPerSet == null ? null : String(i.quantityPerSet),
      unitConsumption: i.unitConsumption == null ? null : String(i.unitConsumption),
    })));
  }

  async create(dto: SaveProductionBomDto, user: CurrentUserPayload) {
    const data = this.normalizePayload(dto);
    await this.assertUnique(data.header.drawingNo, data.header.version);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductionBom);
      const saved = await repo.save(repo.create({ ...data.header, ...auditOnCreate(user) }));
      await this.saveItems(manager, saved.id, data.items);
      return { id: saved.id };
    });
  }

  async update(id: number, dto: SaveProductionBomDto, user: CurrentUserPayload) {
    const current = await this.bomRepo.findOne({ where: { id } });
    if (!current) throw new NotFoundException('生产BOM不存在');
    const data = this.normalizePayload(dto);
    await this.assertUnique(data.header.drawingNo, data.header.version, id);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ProductionBom).update(id, { ...data.header, ...auditOnUpdate(user) });
      await manager.getRepository(ProductionBomItem).delete({ bomId: id });
      await this.saveItems(manager, id, data.items);
    });
    return { id };
  }

  async remove(id: number) {
    if (!(await this.bomRepo.findOne({ where: { id } }))) throw new NotFoundException('生产BOM不存在');
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ProductionBomItem).delete({ bomId: id });
      await manager.getRepository(ProductionBom).delete(id);
    });
    return { id };
  }

  async buildImportTemplate(): Promise<Buffer> {
    const wb = createWorkbook();
    const ws = wb.addWorksheet('生产BOM导入');
    ws.columns = IMPORT_COLUMNS.map((c) => ({ width: c.width }));
    ws.mergeCells(1, 1, 1, IMPORT_COLUMNS.length);
    ws.getCell(1, 1).value = '生产 BOM 批量导入模板';
    ws.mergeCells(2, 1, 2, IMPORT_COLUMNS.length);
    ws.getCell(2, 1).value =
      '同一BOM的生产图号、版本号等表头字段可只在首行填写，后续行留空会自动继承；红色*列必填。数量/套与单耗kg/支至少填写一项。示例行导入前请删除。';
    const header = ws.getRow(3);
    IMPORT_COLUMNS.forEach((c, index) => {
      header.getCell(index + 1).value = c.required ? `${c.header} *` : c.header;
    });
    const sample = [
      ['HH-T4502Q-TDK-K', '海福乐', '45#450缓冲滑轨', '1.0', '示例制表人', todayText(), 1, '外轨', 'HH-T4502Q-TDK-K', '450mm', 2, 'PCS', '否', '1.0', '', '按订单', 'Q235B', '钢带卷料', '示例行，导入前请删除'],
      ['', '', '', '', '', '', 2, '中轨', 'HH-T4502Q-TDK-K', '343mm', 2, 'PCS', '否', '1.0', '', '按订单', 'Q235B', '钢带卷料', ''],
      ['', '', '', '', '', '', 3, '润滑油', '', '', '', '', '否', '', 0.003, '淡黄色', '', '', ''],
    ];
    sample.forEach((r) => ws.addRow(r));

    // 预留并美化 100 行填写区，同时提供常用单位与是/否下拉。
    for (let rowNo = 4; rowNo <= 103; rowNo += 1) {
      const row = ws.getRow(rowNo);
      row.height = 20;
      for (let col = 1; col <= IMPORT_COLUMNS.length; col += 1) {
        const cell = row.getCell(col);
        cell.border = BORDER;
        cell.font = { name: '等线', size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: [7, 11, 12, 13, 15].includes(col) ? 'center' : 'left' };
        if ((rowNo - 4) % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FB' } };
        }
      }
      row.getCell(12).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"PCS,KG,G,ML,L"'],
        showErrorMessage: true, errorStyle: 'warning', errorTitle: '单位提示', error: '可从列表选择，也可按实际情况自行填写',
      };
      row.getCell(13).dataValidation = {
        type: 'list', allowBlank: false, formulae: ['"否,是"'],
        showErrorMessage: true, errorStyle: 'stop', errorTitle: '填写错误', error: '请选择“是”或“否”',
      };
      row.getCell(11).numFmt = '0.####';
      row.getCell(15).numFmt = '0.######';
      row.getCell(4).numFmt = '@';
    }
    ws.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 103, column: IMPORT_COLUMNS.length } };
    ws.getRow(1).height = 32;
    ws.getCell(1, 1).font = { name: '微软雅黑', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    ws.getRow(2).height = 38;
    ws.getCell(2, 1).font = { name: '微软雅黑', size: 10, color: { argb: 'FF8A4B08' } };
    ws.getCell(2, 1).alignment = { vertical: 'middle', wrapText: true };
    ws.getCell(2, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    header.height = 26;
    header.eachCell((cell, col) => {
      cell.font = { name: '微软雅黑', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: IMPORT_COLUMNS[col - 1]?.required ? 'FFC0392B' : 'FF4472C4' },
      };
      cell.border = BORDER;
    });
    addTipsSheet(wb, [
      ['版本规则', '同一生产图号可以有多个版本；生产图号+版本号不得重复。纯整数版本会规范为“1.0”形式。'],
      ['分组规则', '同一BOM的表头字段可以每行重复，也可以只在第一条明细填写，下面空白会继承。'],
      ['数量规则', '数量/套表示一套成品的总用量；数量/套和单耗kg/支至少填写一项且必须大于0。'],
      ['是否分左右', '只表示物料特征，不会把数量乘2；请填写“是”或“否”。'],
      ['覆盖更新', '默认拒绝库内已有版本；在页面勾选“覆盖更新”后，将整份替换该版本的表头和明细。'],
      ['导入事务', `单次最多${EXPORT_ROW_LIMIT}条明细；任一行有问题会整批回滚，不写入任何数据。`],
    ]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async importFromExcel(buffer: Buffer, overwrite: boolean, user: CurrentUserPayload) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('无法解析Excel文件，请使用下载的模板另存为.xlsx后再上传');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel中没有工作表');

    let headerRowNo = 0;
    for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
      let hasDrawingHeader = false;
      ws.getRow(r).eachCell((cell) => {
        if (normalizeHeader(excelCellText(cell)) === '生产图号') hasDrawingHeader = true;
      });
      if (hasDrawingHeader) {
        headerRowNo = r;
        break;
      }
    }
    if (!headerRowNo) throw new BadRequestException('未找到“生产图号”表头，请下载最新模板填写');
    const colOf = new Map<string, number>();
    ws.getRow(headerRowNo).eachCell((cell, col) => colOf.set(normalizeHeader(excelCellText(cell)), col));
    // 兼容已下载的旧模板：新表头统一为「零件名称」，旧「名称」仍可回导。
    if (!colOf.has('零件名称') && colOf.has('名称')) colOf.set('零件名称', colOf.get('名称')!);
    for (const required of ['生产图号', '产品名称', '版本号', '零件名称']) {
      if (!colOf.has(required)) throw new BadRequestException(`模板缺少必填列“${required}”，请下载最新模板`);
    }

    interface ParsedGroup {
      row: number;
      drawingNo: string;
      customerName: string;
      productName: string;
      version: string;
      preparedBy: string;
      preparedDate: string;
      items: ProductionBomItemDto[];
    }
    const groups = new Map<string, ParsedGroup>();
    const errors: string[] = [];
    let currentDrawing = '';
    let currentVersion = '';
    let currentGroupKey = '';
    const closedGroupKeys = new Set<string>();
    const repeatedGroupKeys = new Set<string>();
    let totalItems = 0;
    const get = (row: ExcelJS.Row, headerName: string) => {
      const col = colOf.get(headerName);
      return col ? excelCellText(row.getCell(col)) : '';
    };
    const setGroupField = (g: ParsedGroup, field: 'customerName' | 'productName' | 'preparedBy' | 'preparedDate', value: string, label: string, rowNo: number) => {
      if (!value) return;
      if (g[field] && g[field] !== value) errors.push(`第${rowNo}行：同一BOM的${label}与第${g.row}行不一致`);
      else g[field] = value;
    };

    for (let rowNo = headerRowNo + 1; rowNo <= ws.rowCount; rowNo += 1) {
      const row = ws.getRow(rowNo);
      const values = IMPORT_COLUMNS.map((c) => get(row, c.header));
      if (values.every((v) => !v)) continue;
      const drawingRaw = get(row, '生产图号');
      const versionRaw = get(row, '版本号');
      if (drawingRaw) {
        if (drawingRaw !== currentDrawing) currentVersion = '';
        currentDrawing = drawingRaw;
      }
      if (versionRaw) currentVersion = normalizeVersion(versionRaw) ?? '';
      if (!currentDrawing || !currentVersion) {
        errors.push(`第${rowNo}行：生产图号或版本号为空，且上方没有可继承的BOM表头`);
        continue;
      }
      const key = normalizedKey(currentDrawing, currentVersion);
      if (currentGroupKey && currentGroupKey !== key) closedGroupKeys.add(currentGroupKey);
      if (closedGroupKeys.has(key) && !repeatedGroupKeys.has(key)) {
        errors.push(`第${rowNo}行：生产图号“${currentDrawing}”版本“${currentVersion}”在本文件中重复分组，请将同一BOM的明细连续填写`);
        repeatedGroupKeys.add(key);
      }
      currentGroupKey = key;
      let group = groups.get(key);
      if (!group) {
        group = {
          row: rowNo,
          drawingNo: currentDrawing,
          customerName: '',
          productName: '',
          version: currentVersion,
          preparedBy: '',
          preparedDate: '',
          items: [],
        };
        groups.set(key, group);
      }
      setGroupField(group, 'customerName', get(row, '客户'), '客户', rowNo);
      setGroupField(group, 'productName', get(row, '产品名称'), '产品名称', rowNo);
      setGroupField(group, 'preparedBy', get(row, '制表人'), '制表人', rowNo);
      setGroupField(group, 'preparedDate', get(row, '制表日期'), '制表日期', rowNo);

      const itemName = get(row, '零件名称');
      const itemFields = ['图号（编号）', '规格', '数量/套', '单位', '是否分左右', '材料厚度', '单耗kg/支', '表面处理', '材质', '供应商', '备注'];
      if (!itemName) {
        if (itemFields.some((h) => !!get(row, h))) errors.push(`第${rowNo}行：填写了明细内容但“零件名称”为空`);
        continue;
      }
      const qtyRaw = get(row, '数量/套');
      const consumptionRaw = get(row, '单耗kg/支');
      const parseDecimal = (raw: string, label: string): number | null => {
        if (!raw) return null;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          errors.push(`第${rowNo}行：${label}必须是不小于0的数字`);
          return null;
        }
        return n;
      };
      const quantityPerSet = parseDecimal(qtyRaw, '数量/套');
      const unitConsumption = parseDecimal(consumptionRaw, '单耗kg/支');
      if (!(quantityPerSet != null && quantityPerSet > 0) && !(unitConsumption != null && unitConsumption > 0)) {
        errors.push(`第${rowNo}行：数量/套和单耗kg/支至少填写一项且必须大于0`);
      }
      const splitRaw = get(row, '是否分左右').toLocaleLowerCase();
      let splitLeftRight = false;
      if (['是', '1', 'true', 'yes', 'y'].includes(splitRaw)) splitLeftRight = true;
      else if (splitRaw && !['否', '0', 'false', 'no', 'n'].includes(splitRaw)) {
        errors.push(`第${rowNo}行：是否分左右应填写“是”或“否”`);
      }
      group.items.push({
        itemName,
        itemCode: get(row, '图号（编号）') || null,
        spec: get(row, '规格') || null,
        quantityPerSet,
        quantityUnit: get(row, '单位') || 'PCS',
        splitLeftRight,
        materialThickness: get(row, '材料厚度') || null,
        unitConsumption,
        surfaceTreatment: get(row, '表面处理') || null,
        sheetMaterial: get(row, '材质') || null,
        supplierName: get(row, '供应商') || null,
        remark: get(row, '备注') || null,
      });
      totalItems += 1;
    }

    if (!groups.size && !errors.length) throw new BadRequestException('Excel中没有可导入的数据');
    if (totalItems > EXPORT_ROW_LIMIT) errors.push(`本次共${totalItems}条明细，超过单次导入上限${EXPORT_ROW_LIMIT}条`);

    const normalized: Array<{ row: number; data: NormalizedBomData }> = [];
    const actor = auditDisplayName(user) || user.username;
    for (const group of groups.values()) {
      if (!group.productName) errors.push(`第${group.row}行：产品名称必填`);
      if (!group.items.length) errors.push(`第${group.row}行：该BOM没有有效明细`);
      try {
        normalized.push({
          row: group.row,
          data: this.normalizePayload({
            drawingNo: group.drawingNo,
            customerName: group.customerName || null,
            productName: group.productName,
            version: group.version,
            preparedBy: group.preparedBy || actor,
            preparedDate: group.preparedDate || todayText(),
            items: group.items,
          }),
        });
      } catch (e: any) {
        const msg = e?.response?.message ?? e?.message ?? 'BOM数据不合法';
        errors.push(`第${group.row}行：${msg}`);
      }
    }

    const drawings = [...new Set(normalized.map((n) => n.data.header.drawingNo))];
    const existing = drawings.length ? await this.bomRepo.find({ where: { drawingNo: In(drawings) } }) : [];
    const existingByKey = new Map(existing.map((b) => [normalizedKey(b.drawingNo, b.version), b]));
    if (!overwrite) {
      for (const n of normalized) {
        if (existingByKey.has(normalizedKey(n.data.header.drawingNo, n.data.header.version))) {
          errors.push(`第${n.row}行：生产图号“${n.data.header.drawingNo}”版本“${n.data.header.version}”已存在（可开启覆盖更新）`);
        }
      }
    }
    if (errors.length) throw importRejected(errors, totalItems);

    const processRows = drawings.length ? await this.processRepo.find({ where: { drawingNo: In(drawings) } }) : [];
    const processByDrawing = new Map(processRows.map((p) => [p.drawingNo.toLocaleLowerCase(), p]));
    let created = 0;
    let updated = 0;
    await this.dataSource.transaction(async (manager) => {
      const bomRepo = manager.getRepository(ProductionBom);
      const itemRepo = manager.getRepository(ProductionBomItem);
      for (const n of normalized) {
        const data = n.data;
        const process = processByDrawing.get(data.header.drawingNo.toLocaleLowerCase());
        if (process) data.header.processInfoId = process.id;
        const hit = existingByKey.get(normalizedKey(data.header.drawingNo, data.header.version));
        let bomId: number;
        if (hit) {
          await bomRepo.update(hit.id, { ...data.header, ...auditOnUpdate(user) });
          await itemRepo.delete({ bomId: hit.id });
          bomId = hit.id;
          updated += 1;
        } else {
          const saved = await bomRepo.save(bomRepo.create({ ...data.header, ...auditOnCreate(user) }));
          bomId = saved.id;
          created += 1;
        }
        await itemRepo.save(data.items.map((i) => itemRepo.create({
          ...i,
          bomId,
          quantityPerSet: i.quantityPerSet == null ? null : String(i.quantityPerSet),
          unitConsumption: i.unitConsumption == null ? null : String(i.unitConsumption),
        })));
      }
    });
    return { created, updated, total: normalized.length, itemTotal: totalItems };
  }

  private async exportRows(query: QueryProductionBomDto): Promise<Array<ProductionBom & { items: ProductionBomItem[] }>> {
    let ids: number[] = [];
    if (query.ids?.trim()) {
      ids = [...new Set(query.ids.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      if (!ids.length) throw new BadRequestException('未选择有效的生产BOM记录');
    }
    const qb = this.listQuery(query).orderBy('b.drawingNo', 'ASC').addOrderBy('b.version', 'ASC');
    if (ids.length) qb.andWhere('b.id IN (:...ids)', { ids });
    const total = await qb.getCount();
    if (!total) throw new BadRequestException('当前范围没有生产BOM可导出');
    if (total > BOM_EXPORT_LIMIT) {
      throw new BadRequestException(`本次共${total}个BOM，超过单次导出上限${BOM_EXPORT_LIMIT}个，请缩小范围`);
    }
    const boms = await qb.getMany();
    const items = await this.itemRepo.find({
      where: { bomId: In(boms.map((b) => b.id)) },
      order: { bomId: 'ASC', sort: 'ASC', id: 'ASC' },
    });
    if (items.length > EXPORT_ROW_LIMIT) {
      throw new BadRequestException(`本次共${items.length}条BOM明细，超过单次导出上限${EXPORT_ROW_LIMIT}条，请缩小范围`);
    }
    const byBom = new Map<number, ProductionBomItem[]>();
    for (const item of items) {
      const arr = byBom.get(item.bomId) ?? [];
      arr.push(item);
      byBom.set(item.bomId, arr);
    }
    return boms.map((b) => Object.assign(b, { items: byBom.get(b.id) ?? [] }));
  }

  async exportExcel(query: QueryProductionBomDto): Promise<Buffer> {
    const rows = await this.exportRows(query);
    const wb = createWorkbook();
    const summary = wb.addWorksheet('BOM汇总');
    summary.addRow(IMPORT_COLUMNS.map((c) => c.header));
    for (const bom of rows) {
      bom.items.forEach((item, index) => {
        summary.addRow([
          bom.drawingNo,
          bom.customerName ?? '',
          bom.productName,
          bom.version,
          bom.preparedBy,
          bom.preparedDate,
          index + 1,
          item.itemName,
          item.itemCode ?? '',
          item.spec ?? '',
          item.quantityPerSet == null ? '' : Number(item.quantityPerSet),
          item.quantityUnit,
          item.splitLeftRight ? '是' : '否',
          item.materialThickness ?? '',
          item.unitConsumption == null ? '' : Number(item.unitConsumption),
          item.surfaceTreatment ?? '',
          item.sheetMaterial ?? '',
          item.supplierName ?? '',
          item.remark ?? '',
        ]);
      });
    }
    styleSheet(summary, {
      centerColumns: [4, 6, 7, 11, 12, 13, 14, 15],
      minWidth: 8,
      maxWidth: 32,
    });
    summary.autoFilter = { from: 'A1', to: `S${Math.max(1, summary.rowCount)}` };
    summary.getColumn(4).numFmt = '@';
    summary.getColumn(11).numFmt = '0.####';
    summary.getColumn(15).numFmt = '0.######';

    const usedNames = new Set<string>(['BOM汇总']);
    for (const bom of rows) this.appendFormalSheet(wb, bom, usedNames);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** 记录行单份导出：只生成适合打印的正式 BOM 表，不附带汇总页。 */
  async exportSingleExcel(id: number): Promise<{ buffer: Buffer; fileName: string }> {
    const rows = await this.exportRows({ ids: String(id) });
    const bom = rows[0];
    if (!bom) throw new NotFoundException('生产BOM不存在');
    const wb = createWorkbook();
    this.appendFormalSheet(wb, bom, new Set<string>());
    return {
      buffer: Buffer.from(await wb.xlsx.writeBuffer()),
      fileName: `${safeFileBase(`${bom.drawingNo}_${bom.version}`)}_BOM.xlsx`,
    };
  }

  private appendFormalSheet(
    wb: ExcelJS.Workbook,
    bom: ProductionBom & { items: ProductionBomItem[] },
    usedNames: Set<string>,
  ) {
    const base = safeSheetBase(`${bom.drawingNo}_${bom.version}`).slice(0, 31);
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) {
      const tail = `_${suffix++}`;
      name = `${base.slice(0, 31 - tail.length)}${tail}`;
    }
    usedNames.add(name);
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
    ws.columns = [
      { width: 7 }, { width: 14 }, { width: 20 }, { width: 14 },
      { width: 11 }, { width: 8 }, { width: 11 }, { width: 11 },
      { width: 12 }, { width: 13 }, { width: 11 }, { width: 15 }, { width: 20 },
    ];
    const title = `${bom.customerName ?? ''}${bom.productName}BOM物料清单`;
    ws.mergeCells('A1:M1');
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { name: '微软雅黑', size: 18, bold: true, color: { argb: 'FF1F2937' } };
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 34;

    ws.mergeCells('A2:B2');
    ws.getCell('A2').value = '生产图号：';
    ws.mergeCells('C2:F2');
    ws.getCell('C2').value = bom.drawingNo;
    ws.mergeCells('G2:H2');
    ws.getCell('G2').value = '客户名称：';
    ws.mergeCells('I2:M2');
    ws.getCell('I2').value = bom.customerName ?? '';
    ['A2', 'G2'].forEach((ref) => {
      ws.getCell(ref).font = { name: '等线', size: 11, bold: true };
      ws.getCell(ref).alignment = { horizontal: 'right', vertical: 'middle' };
    });
    ['C2', 'I2'].forEach((ref) => {
      ws.getCell(ref).font = { name: '等线', size: 11 };
      ws.getCell(ref).alignment = { horizontal: 'left', vertical: 'middle' };
    });
    ws.getRow(2).height = 24;

    const headers = ['序号', '零件名称', '图号（编号）', '规格', '数量/套', '单位', '是否分左右', '材料厚度', '单耗kg/支', '表面处理', '材质', '供应商', '备注'];
    const head = ws.getRow(3);
    headers.forEach((h, i) => { head.getCell(i + 1).value = h; });
    head.height = 28;
    head.eachCell((cell) => {
      cell.font = { name: '微软雅黑', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = BORDER;
    });
    bom.items.forEach((item, index) => {
      const row = ws.addRow([
        index + 1,
        item.itemName,
        item.itemCode ?? '',
        item.spec ?? '',
        item.quantityPerSet == null ? '' : Number(item.quantityPerSet),
        item.quantityUnit,
        item.splitLeftRight ? '是' : '否',
        item.materialThickness ?? '',
        item.unitConsumption == null ? '' : Number(item.unitConsumption),
        item.surfaceTreatment ?? '',
        item.sheetMaterial ?? '',
        item.supplierName ?? '',
        item.remark ?? '',
      ]);
      row.height = 25;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: '等线', size: 10 };
        cell.border = BORDER;
        cell.alignment = {
          horizontal: [1, 5, 6, 7, 8, 9, 10, 11].includes(col) ? 'center' : 'left',
          vertical: 'middle',
          wrapText: true,
        };
        if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FB' } };
      });
      row.getCell(5).numFmt = '0.####';
      row.getCell(9).numFmt = '0.######';
    });

    const footer1 = ws.rowCount + 1;
    ws.mergeCells(footer1, 1, footer1, 2);
    ws.getCell(footer1, 1).value = '发件部门：';
    ws.mergeCells(footer1, 3, footer1, 4);
    ws.mergeCells(footer1, 5, footer1, 6);
    ws.getCell(footer1, 5).value = '到达部门：';
    ws.mergeCells(footer1, 7, footer1, 9);
    ws.mergeCells(footer1, 10, footer1, 11);
    ws.getCell(footer1, 10).value = '版本号：';
    ws.mergeCells(footer1, 12, footer1, 13);
    ws.getCell(footer1, 12).value = bom.version;
    ws.getCell(footer1, 12).numFmt = '@';

    const footer2 = footer1 + 1;
    ws.mergeCells(footer2, 1, footer2, 2);
    ws.getCell(footer2, 1).value = '制表：';
    ws.mergeCells(footer2, 3, footer2, 5);
    ws.getCell(footer2, 3).value = `${bom.preparedBy}  ${bom.preparedDate}`;
    ws.mergeCells(footer2, 6, footer2, 7);
    ws.getCell(footer2, 6).value = '审核：';
    ws.mergeCells(footer2, 8, footer2, 9);
    ws.mergeCells(footer2, 10, footer2, 11);
    ws.getCell(footer2, 10).value = '批准：';
    ws.mergeCells(footer2, 12, footer2, 13);

    for (let r = footer1; r <= footer2; r += 1) {
      ws.getRow(r).height = 25;
      for (let c = 1; c <= 13; c += 1) {
        const cell = ws.getCell(r, c);
        cell.border = BORDER;
        cell.font = { name: '等线', size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }
    }
    for (const ref of [`A${footer1}`, `E${footer1}`, `J${footer1}`, `A${footer2}`, `F${footer2}`, `J${footer2}`]) {
      ws.getCell(ref).font = { name: '等线', size: 10, bold: true };
      ws.getCell(ref).alignment = { vertical: 'middle', horizontal: 'right' };
    }
    ws.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
      printTitlesRow: '1:3',
      printArea: `A1:M${footer2}`,
    } as ExcelJS.Worksheet['pageSetup'];
  }
}
