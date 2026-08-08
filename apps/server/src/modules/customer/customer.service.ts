import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto, QueryCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';

/** 导入模板列定义（同时用于生成模板与解析导入，保证表头一致） */
const IMPORT_COLUMNS: Array<{
  header: string;
  field: keyof CreateCustomerDto;
  required: boolean;
  width: number;
}> = [
  { header: '客户代码', field: 'customerCode', required: true, width: 16 },
  { header: '客户名称', field: 'customerName', required: true, width: 26 },
  { header: '联系人', field: 'contactPerson', required: false, width: 12 },
  { header: '联系电话', field: 'contactPhone', required: false, width: 16 },
  { header: '默认业务员', field: 'salesman', required: false, width: 12 },
  { header: '默认跟单员', field: 'merchandiser', required: false, width: 12 },
  { header: '默认交货地址', field: 'deliveryAddress', required: false, width: 30 },
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

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
    private readonly dataSource: DataSource,
  ) {}

  async findList(query: QueryCustomerDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repo.createQueryBuilder('c');
    if (query.status != null) qb.andWhere('c.status = :s', { s: query.status });
    if (query.keyword) {
      qb.andWhere(
        '(c.customerCode LIKE :kw OR c.customerName LIKE :kw OR c.contactPerson LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }
    qb.orderBy('c.customerCode', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /** 全量启用客户（订单表单下拉用） */
  /**
   * 全量启用客户（表单下拉用）。本接口刻意只要求登录（见 controller 注释），
   * 故**只投影下拉真正需要的字段**：代码/名称用于检索显示，业务员/跟单员/
   * 交货地址用于选中后带出默认值。联系人电话、备注、审计信息等不外露。
   */
  async findAllEnabled() {
    return this.repo.find({
      select: [
        'id',
        'customerCode',
        'customerName',
        'salesman',
        'merchandiser',
        'deliveryAddress',
      ],
      where: { status: 1 },
      order: { customerCode: 'ASC' },
    });
  }

  async create(dto: CreateCustomerDto, user: CurrentUserPayload) {
    await this.assertUnique(dto.customerCode, dto.customerName);
    const entity = this.repo.create({ ...dto, ...auditOnCreate(user) });
    const saved = await this.repo.save(entity);
    return { id: saved.id };
  }

  async update(id: number, dto: UpdateCustomerDto, user: CurrentUserPayload) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('客户不存在');
    if (dto.customerCode || dto.customerName) {
      await this.assertUnique(dto.customerCode, dto.customerName, id);
    }
    await this.repo.update(id, { ...dto, ...auditOnUpdate(user) });
    return { id };
  }

  async remove(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('客户不存在');

    // 引用完整性校验：客户被订单引用时禁止删除，建议停用。
    // 订单模块（t_order）在 M2 里程碑落地，此处用原生 SQL 探测，表尚未建时视为无引用。
    let refCount = 0;
    try {
      const rows: Array<{ cnt: string }> = await this.dataSource.query(
        'SELECT COUNT(*) AS cnt FROM t_order WHERE customer_id = ?',
        [id],
      );
      refCount = Number(rows?.[0]?.cnt ?? 0);
    } catch {
      refCount = 0;
    }
    if (refCount > 0) {
      throw new BadRequestException(
        `该客户已被 ${refCount} 张订单引用，无法删除，建议改为「停用」`,
      );
    }
    await this.repo.delete(id);
    return { id };
  }

  /**
   * 批量删除：整批校验口径与导入一致——任一客户被订单引用则整批拒绝并返回逐条原因，
   * 不做部分删除（避免"删了一半"的中间态让操作者误判）。已不存在的 id 静默跳过（幂等）。
   */
  async batchRemove(ids: number[]) {
    const uniqIds = [...new Set(ids)];
    const items = await this.repo.find({ where: { id: In(uniqIds) } });
    if (!items.length) throw new NotFoundException('所选客户均不存在（可能已被删除），请刷新列表');

    // 引用校验：t_order 在 M2 落地，表未建时视为无引用（与单删同口径）
    const refMap = new Map<number, number>();
    try {
      const rows: Array<{ customer_id: number; cnt: string }> = await this.dataSource.query(
        `SELECT customer_id, COUNT(*) AS cnt FROM t_order WHERE customer_id IN (${uniqIds
          .map(() => '?')
          .join(',')}) GROUP BY customer_id`,
        uniqIds,
      );
      rows.forEach((r) => refMap.set(Number(r.customer_id), Number(r.cnt)));
    } catch {
      /* t_order 未建表：无引用 */
    }
    const blocked = items.filter((c) => (refMap.get(c.id) ?? 0) > 0);
    if (blocked.length) {
      throw new BadRequestException({
        message: `批量删除未执行：${blocked.length} 个客户已被订单引用，建议改为「停用」`,
        errors: blocked.map(
          (c) => `客户「${c.customerCode} / ${c.customerName}」已被 ${refMap.get(c.id)} 张订单引用`,
        ),
      });
    }

    await this.repo.delete(items.map((c) => c.id));
    return { deleted: items.length, skipped: uniqIds.length - items.length };
  }

  /** 唯一性只卡客户代码——真实客户「一名多码」是常态（同名客户多个代码），名称不做唯一约束 */
  private async assertUnique(code?: string, _name?: string, excludeId?: number) {
    if (code) {
      const qb = this.repo.createQueryBuilder('c').where('c.customerCode = :code', { code });
      if (excludeId) qb.andWhere('c.id != :id', { id: excludeId });
      if (await qb.getExists()) throw new ConflictException(`客户代码「${code}」已存在`);
    }
  }

  // ===================== 批量导入 / 模板 =====================

  /** 生成导入模板（表头 + 示例行） */
  async buildImportTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('客户导入模板');
    ws.columns = IMPORT_COLUMNS.map((c) => ({
      header: c.required ? `*${c.header}` : c.header,
      width: c.width,
    }));
    ws.getRow(1).font = { bold: true };
    ws.addRow(['KH001', '示例客户有限公司', '张三', '13800000000', '李四', '王五', '广东省佛山市……', '示例行，导入前请删除']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * Excel 批量导入（设计文档 §4.1.1）：
   * - 整批校验全部通过才落库，任一行出错返回逐行错误清单，不部分入库；
   * - 判重按客户代码：默认已存在即报错；overwrite=true 时按客户代码 upsert 非空列。
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
    const rows: Array<CreateCustomerDto & { _row: number }> = [];
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
      if (!record.customerCode) errors.push(`第 ${rowNumber} 行：客户代码不能为空`);
      if (!record.customerName) errors.push(`第 ${rowNumber} 行：客户名称不能为空`);
      rows.push(record);
    });
    if (!rows.length && !errors.length) throw new BadRequestException('Excel 中没有可导入的数据行');

    // 批内判重——只卡客户代码；名称允许重复（一名多码是业务常态，如同名客户挂 40+ 个代码）
    const seenCode = new Map<string, number>();
    for (const r of rows) {
      if (r.customerCode) {
        if (seenCode.has(r.customerCode)) {
          errors.push(`第 ${r._row} 行：客户代码「${r.customerCode}」与第 ${seenCode.get(r.customerCode)} 行重复`);
        } else seenCode.set(r.customerCode, r._row);
      }
    }

    // 与库内判重（同样只按客户代码）
    const existing = await this.repo.find();
    const byCode = new Map(existing.map((c) => [c.customerCode, c]));
    for (const r of rows) {
      const hitCode = r.customerCode ? byCode.get(r.customerCode) : undefined;
      if (!overwrite && hitCode) {
        errors.push(`第 ${r._row} 行：客户代码「${r.customerCode}」已存在（可开启「覆盖更新」）`);
      }
    }

    if (errors.length) {
      // 结构化返回逐行错误（HTTP 400，前端逐条展示）
      throw new BadRequestException({ message: '导入校验未通过，本次未导入任何数据', errors });
    }

    // 整批落库（同一事务）
    let created = 0;
    let updated = 0;
    await this.dataSource.transaction(async (mgr) => {
      for (const r of rows) {
        const { _row, ...dto } = r;
        const hit = byCode.get(dto.customerCode);
        if (hit) {
          // 覆盖更新：仅更新非空列
          const patch: Partial<Customer> = { ...auditOnUpdate(user) };
          for (const c of IMPORT_COLUMNS) {
            const v = (dto as any)[c.field];
            if (v !== undefined) (patch as any)[c.field] = v;
          }
          await mgr.getRepository(Customer).update(hit.id, patch);
          updated += 1;
        } else {
          await mgr.getRepository(Customer).save(
            mgr.getRepository(Customer).create({ ...dto, ...auditOnCreate(user) }),
          );
          created += 1;
        }
      }
    });
    return { created, updated, total: rows.length };
  }
}
