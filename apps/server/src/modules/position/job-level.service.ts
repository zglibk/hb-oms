import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { positionNatureLabel } from '@hb-oms/shared';
import { JobLevel } from './entities/job-level.entity';
import {
  CreateJobLevelDto,
  QueryJobLevelDto,
  UpdateJobLevelDto,
} from './dto/job-level.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';

@Injectable()
export class JobLevelService {
  constructor(
    @InjectRepository(JobLevel)
    private readonly repo: Repository<JobLevel>,
  ) {}

  async findList(query: QueryJobLevelDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const qb = this.repo.createQueryBuilder('j');
    if (query.positionNature) qb.andWhere('j.positionNature = :n', { n: query.positionNature });
    if (query.status != null) qb.andWhere('j.status = :st', { st: query.status });
    if (query.onlyEnabled) qb.andWhere('j.status = 1');
    if (query.keyword) qb.andWhere('j.levelName LIKE :kw', { kw: `%${query.keyword}%` });

    qb.orderBy('j.sort', 'ASC')
      .addOrderBy('j.levelRank', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    const list = await this.attachCounts(rows);
    return { list, total, page, pageSize };
  }

  /**
   * 下拉专用：只回启用职级，可按序列（岗位性质）过滤。
   *
   * **跨页引用型只读接口，刻意只要求登录**（§2.1）：岗位维护页要用它，
   * 挂 basic:job-level 会让只有岗位菜单的人下拉 403。
   */
  async findOptions(positionNature?: string) {
    const qb = this.repo
      .createQueryBuilder('j')
      .select(['j.id', 'j.levelName', 'j.positionNature', 'j.levelRank'])
      .where('j.status = 1');
    if (positionNature) qb.andWhere('j.positionNature = :n', { n: positionNature });
    return qb.orderBy('j.sort', 'ASC').addOrderBy('j.levelRank', 'ASC').getMany();
  }

  async create(dto: CreateJobLevelDto, user: CurrentUserPayload) {
    const payload = this.normalize(dto);
    await this.assertNameFree(payload.levelName, payload.positionNature);
    const saved = await this.repo.save(this.repo.create({ ...payload, ...auditOnCreate(user) }));
    return { id: saved.id };
  }

  async update(id: number, dto: UpdateJobLevelDto, user: CurrentUserPayload) {
    const row = await this.mustGet(id);
    const payload = this.normalize(dto);
    await this.assertNameFree(payload.levelName, payload.positionNature, id);

    // 改所属序列会让已引用它的岗位变成「跨序列」（性质 tech 却挂着 manager 的职级）——
    // 岗位保存时的硬校验拦得住新数据，拦不住这里被就地改坏的存量数据，故在此拦住。
    if (payload.positionNature !== row.positionNature) {
      const used = await this.countPositions(id);
      if (used > 0) {
        throw new BadRequestException(
          `职级「${row.levelName}」已被 ${used} 个岗位使用，不能改所属序列；` +
            `请在目标序列下新建职级，再把这些岗位改挂过去`,
        );
      }
    }

    await this.repo.update(id, { ...payload, ...auditOnUpdate(user) });
    return { id };
  }

  /** 删除：**被岗位引用时禁止**（§5.5），引导改用「停用」 */
  async remove(id: number) {
    const row = await this.mustGet(id);
    const used = await this.countPositions(id);
    if (used > 0) {
      throw new BadRequestException(
        `职级「${row.levelName}」已被 ${used} 个岗位使用，不能删除；如需下线请把状态改为「停用」`,
      );
    }
    await this.repo.delete(id);
    return { id };
  }

  /* ==================== 内部 ==================== */

  /** 引用它的岗位数：一条 GROUP BY 聚合，别按行查成 N+1 */
  private async attachCounts(rows: JobLevel[]) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const ph = ids.map(() => '?').join(',');
    const counts = await this.repo.manager.query(
      `SELECT job_level_id AS id, COUNT(*) AS c FROM t_position
        WHERE job_level_id IN (${ph}) GROUP BY job_level_id`,
      ids,
    );
    const map = new Map<number, number>(counts.map((c: any) => [Number(c.id), Number(c.c)]));
    return rows.map((j) => ({ ...j, positionCount: map.get(j.id) ?? 0 }));
  }

  private async countPositions(jobLevelId: number): Promise<number> {
    const rows = await this.repo.manager.query(
      'SELECT COUNT(*) AS c FROM t_position WHERE job_level_id = ?',
      [jobLevelId],
    );
    return Number(rows?.[0]?.c ?? 0);
  }

  private normalize(dto: CreateJobLevelDto) {
    const levelName = (dto.levelName ?? '').trim();
    if (!levelName) throw new BadRequestException('职级名称必填');
    return {
      levelName,
      positionNature: dto.positionNature,
      levelRank: dto.levelRank ?? 0,
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
      remark: dto.remark?.trim() || null,
    };
  }

  /** 同一序列内职级名不可重复（uk_level_name_nature 兜底，此处给中文提示） */
  private async assertNameFree(levelName: string, positionNature: string, excludeId?: number) {
    const exist = await this.repo.findOne({
      where: excludeId
        ? { levelName, positionNature, id: Not(excludeId) }
        : { levelName, positionNature },
    });
    if (exist) {
      throw new BadRequestException(
        `「${positionNatureLabel(positionNature)}」序列下已有职级「${levelName}」`,
      );
    }
  }

  private async mustGet(id: number): Promise<JobLevel> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('职级不存在');
    return row;
  }
}
