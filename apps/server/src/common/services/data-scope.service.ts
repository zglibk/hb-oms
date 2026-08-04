import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { Department } from '../../modules/system/entities/department.entity';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * 数据级权限（文档 7.3）。
 * 根据用户角色的最大 data_scope，为列表/详情查询追加数据范围过滤条件。
 *   1=全部 2=本部门 3=本部门及下级 4=本人 5=自定义部门
 * 约定业务表含 dept_id（创建人部门）与 creator_id（创建人）两列。
 */
@Injectable()
export class DataScopeService {
  constructor(
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
  ) {}

  /**
   * 在 QueryBuilder 上追加数据范围 where 条件。
   * @param alias 主表别名（其需含 dept_id / creator_id 列）
   */
  async applyToQueryBuilder<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    user: CurrentUserPayload,
    alias: string,
  ): Promise<SelectQueryBuilder<T>> {
    const scope = user.dataScope ?? 4;
    switch (scope) {
      case 1: // 全部
        return qb;
      case 2: // 本部门
        return qb.andWhere(`${alias}.dept_id = :__dsDept`, {
          __dsDept: user.deptId ?? -1,
        });
      case 3: {
        // 本部门及下级
        const ids = await this.getSubDeptIds(user.deptId);
        return qb.andWhere(`${alias}.dept_id IN (:...__dsDepts)`, {
          __dsDepts: ids.length ? ids : [-1],
        });
      }
      case 4: // 仅本人
        return qb.andWhere(`${alias}.creator_id = :__dsUser`, {
          __dsUser: user.id,
        });
      case 5: {
        // 自定义部门
        const ids = user.customDeptIds?.length ? user.customDeptIds : [-1];
        return qb.andWhere(`${alias}.dept_id IN (:...__dsCustom)`, {
          __dsCustom: ids,
        });
      }
      default:
        return qb.andWhere('1 = 0');
    }
  }

  /** 校验某条数据是否在用户数据范围内（横向越权防护，用于详情/编辑/删除） */
  async canAccess(
    user: CurrentUserPayload,
    record: { deptId?: number | null; creatorId?: number | null },
  ): Promise<boolean> {
    const scope = user.dataScope ?? 4;
    switch (scope) {
      case 1:
        return true;
      case 2:
        return record.deptId === user.deptId;
      case 3: {
        const ids = await this.getSubDeptIds(user.deptId);
        return record.deptId != null && ids.includes(record.deptId);
      }
      case 4:
        return record.creatorId === user.id;
      case 5:
        return (
          record.deptId != null &&
          (user.customDeptIds ?? []).includes(record.deptId)
        );
      default:
        return false;
    }
  }

  /** 获取本部门及所有下级部门 id（递归） */
  async getSubDeptIds(deptId: number | null): Promise<number[]> {
    if (!deptId) return [];
    const all = await this.deptRepo.find();
    const result = new Set<number>([deptId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of all) {
        if (result.has(d.parentId) && !result.has(d.id)) {
          result.add(d.id);
          changed = true;
        }
      }
    }
    return [...result];
  }
}
