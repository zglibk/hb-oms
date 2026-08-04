import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProcessInfo } from './entities/process-info.entity';
import {
  CreateProcessInfoDto,
  QueryProcessInfoDto,
  UpdateProcessInfoDto,
} from './dto/process-info.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';

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

    // 订单引用的是图号快照，删除工艺不影响历史订单；仅提示性校验是否仍有进行中订单引用该图号。
    // t_order_product 在 M2 里程碑落地，表尚未建时视为无引用。
    let refCount = 0;
    try {
      const rows: Array<{ cnt: string }> = await this.dataSource.query(
        'SELECT COUNT(*) AS cnt FROM t_order_product WHERE drawing_no = ?',
        [item.drawingNo],
      );
      refCount = Number(rows?.[0]?.cnt ?? 0);
    } catch {
      refCount = 0;
    }
    if (refCount > 0) {
      throw new BadRequestException(
        `生产图号「${item.drawingNo}」已被 ${refCount} 条订单产品引用，删除前请确认（历史订单保留快照不受影响）；如需强制删除请先联系管理员`,
      );
    }
    await this.repo.delete(id);
    return { id };
  }
}
