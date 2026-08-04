import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OperationLog } from '../entities/operation-log.entity';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(OperationLog)
    private readonly logRepo: Repository<OperationLog>,
  ) {}

  async findList(query: {
    page?: number;
    pageSize?: number;
    userName?: string;
    module?: string;
    action?: string;
    result?: number;
    bizType?: string;
    bizId?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.logRepo.createQueryBuilder('l');
    if (query.userName)
      qb.andWhere('l.user_name LIKE :u', { u: `%${query.userName}%` });
    if (query.module) qb.andWhere('l.module = :m', { m: query.module });
    if (query.action) qb.andWhere('l.action = :a', { a: query.action });
    if (query.result != null)
      qb.andWhere('l.result = :r', { r: Number(query.result) });
    if (query.bizType) qb.andWhere('l.biz_type = :bt', { bt: query.bizType });
    if (query.bizId != null)
      qb.andWhere('l.biz_id = :bid', { bid: Number(query.bizId) });
    if (query.startDate)
      qb.andWhere('l.created_at >= :start', {
        start: `${query.startDate} 00:00:00`,
      });
    if (query.endDate)
      qb.andWhere('l.created_at <= :end', {
        end: `${query.endDate} 23:59:59`,
      });
    qb.orderBy('l.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /** 已记录过的模块列表（供筛选下拉） */
  async modules() {
    const rows = await this.logRepo
      .createQueryBuilder('l')
      .select('DISTINCT l.module', 'module')
      .where("l.module IS NOT NULL AND l.module <> ''")
      .orderBy('l.module', 'ASC')
      .getRawMany();
    return rows.map((r) => r.module as string);
  }

  /** 已记录过的操作动作列表（可按模块过滤） */
  async actions(module?: string) {
    const qb = this.logRepo
      .createQueryBuilder('l')
      .select('DISTINCT l.action', 'action')
      .where("l.action IS NOT NULL AND l.action <> ''");
    if (module) qb.andWhere('l.module = :m', { m: module });
    const rows = await qb.orderBy('l.action', 'ASC').getRawMany();
    return rows.map((r) => r.action as string);
  }

  /** 批量删除操作日志（仅系统管理员 admin 角色可执行） */
  async removeMany(ids: number[], user: CurrentUserPayload) {
    if (!user.roleCodes?.includes('admin')) {
      throw new ForbiddenException('仅系统管理员可删除操作日志');
    }
    const validIds = (ids || [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (validIds.length === 0) {
      throw new BadRequestException('请选择要删除的日志');
    }
    const res = await this.logRepo.delete({ id: In(validIds) });
    return { deleted: res.affected ?? 0 };
  }
}
