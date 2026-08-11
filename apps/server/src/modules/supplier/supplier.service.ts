import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto, QuerySupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly repo: Repository<Supplier>,
  ) {}

  async findList(query: QuerySupplierDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repo.createQueryBuilder('s');
    if (query.status != null) qb.andWhere('s.status = :st', { st: query.status });
    if (query.keyword) {
      qb.andWhere(
        '(s.supplierCode LIKE :kw OR s.supplierName LIKE :kw OR s.contactPerson LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }
    // 排序字段优先（把常用的厂顶到前面），再按编码稳定排序
    qb.orderBy('s.sort', 'ASC')
      .addOrderBy('s.supplierCode', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 全量启用供应商（外发登记等表单的下拉，无分页）。
   *
   * **跨页引用型只读接口，刻意只要求登录**（§2.1）：登记外发回厂的人未必有
   * 供应商菜单，挂 basic:supplier 会让加工商下拉直接 403。
   * 投影收窄到下拉需要的字段，联系人电话/地址/审计信息不外露。
   */
  async findAllEnabled() {
    return this.repo.find({
      where: { status: 1 },
      select: ['id', 'supplierCode', 'supplierName'],
      order: { sort: 'ASC', supplierCode: 'ASC' },
    });
  }

  async create(dto: CreateSupplierDto, user: CurrentUserPayload) {
    await this.assertCodeFree(dto.supplierCode);
    const entity = this.repo.create({
      ...this.normalize(dto),
      ...auditOnCreate(user),
    });
    const saved = await this.repo.save(entity);
    return { id: saved.id };
  }

  async update(id: number, dto: UpdateSupplierDto, user: CurrentUserPayload) {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('供应商不存在');
    await this.assertCodeFree(dto.supplierCode, id);
    await this.repo.update(id, {
      ...this.normalize(dto),
      ...auditOnUpdate(user),
    });
    return { id };
  }

  /**
   * 删除。**不做下游引用检查**——外发回厂记录存的是名称快照（§5.5），
   * 不持有 supplier_id，删掉主数据不会影响任何历史记录。
   * 只是想临时下线的话用「停用」，不必删。
   */
  async remove(id: number) {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('供应商不存在');
    await this.repo.delete(id);
    return { id };
  }

  /** 编码唯一（更新时排除自己） */
  private async assertCodeFree(code: string, excludeId?: number) {
    const supplierCode = (code ?? '').trim();
    const exists = await this.repo.findOne({
      where: excludeId
        ? { supplierCode, id: Not(excludeId) }
        : { supplierCode },
      select: ['id'],
    });
    if (exists) throw new ConflictException(`供应商编码「${supplierCode}」已存在`);
  }

  /** 入库前统一去空白：编码带空格会让唯一键形同虚设（「A 」与「A」是两条） */
  private normalize(dto: CreateSupplierDto) {
    return {
      supplierCode: dto.supplierCode.trim(),
      supplierName: dto.supplierName.trim(),
      contactPerson: dto.contactPerson?.trim() || null,
      contactPhone: dto.contactPhone?.trim() || null,
      address: dto.address?.trim() || null,
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
      remark: dto.remark?.trim() || null,
    };
  }
}
