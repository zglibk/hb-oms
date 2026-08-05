import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EquipmentInfo } from './entities/equipment-info.entity';
import {
  CreateEquipmentInfoDto,
  QueryEquipmentInfoDto,
  UpdateEquipmentInfoDto,
} from './dto/equipment-info.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectRepository(EquipmentInfo)
    private readonly repo: Repository<EquipmentInfo>,
  ) {}

  async findList(query: QueryEquipmentInfoDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repo.createQueryBuilder('e');
    if (query.partType) qb.andWhere('e.partType = :pt', { pt: query.partType });
    if (query.keyword) {
      qb.andWhere(
        '(e.machineNo LIKE :kw OR e.productModel LIKE :kw OR e.drawingNo LIKE :kw OR e.mechanic LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }
    // 机台号数值语义排序（字符串列按长度+字面双关键字，89 排在 362 前）
    qb.orderBy('LENGTH(e.machineNo)', 'ASC')
      .addOrderBy('e.machineNo', 'ASC')
      .addOrderBy('e.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('设备信息不存在');
    return item;
  }

  async create(dto: CreateEquipmentInfoDto, user: CurrentUserPayload) {
    const saved = await this.repo.save(this.repo.create({ ...dto, ...auditOnCreate(user) }));
    return { id: saved.id };
  }

  async update(id: number, dto: UpdateEquipmentInfoDto, user: CurrentUserPayload) {
    await this.findOne(id);
    await this.repo.update(id, { ...dto, ...auditOnUpdate(user) });
    return { id };
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { id };
  }
}
