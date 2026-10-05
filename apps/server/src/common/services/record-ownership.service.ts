import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { DataScopeService } from './data-scope.service';
import { SystemConfigService } from '../../modules/system-config/system-config.service';

/** 受「只许创建人与主管改」约束的业务模块 */
export type OwnedModule = 'order' | 'outsource' | 'assembly' | 'finished';

const MODULE_NOUN: Record<OwnedModule, string> = {
  order: '订单',
  outsource: '外发回厂记录',
  assembly: '装配批次',
  finished: '出入库单',
};

/** 一条记录的归属信息（各业务表都有 creator_id / creator_name 审计列） */
export interface OwnedRecord {
  creatorId: number | null;
  creatorName?: string | null;
}

/** 当前用户在某模块下的判定上下文：预取一次，列表逐行复用 */
interface OwnershipContext {
  userId: number;
  /** 当前用户是不是该模块的主管角色 */
  supervisor: boolean;
  /** 主管角色各自的数据范围里，允许的创建人部门（null = 全部部门） */
  allowedDepts: Set<number> | null;
  /** 主管角色里有「仅本人」范围（等价于只能改自己的） */
  selfOnly: boolean;
}

/**
 * 业务记录修改权（2026-09-26，使用方反馈「自己建的数据被别人改了」）：
 *
 *   能改 = 记录创建人本人
 *        或（当前用户属于该模块的**主管角色** 且 记录创建人的部门落在该主管角色的**数据范围**内）
 *
 * - 主管角色按模块在「系统配置 → 数据权限」维护（t_system_config.*_edit_roles）；
 * - **管理员不例外**：admin 能绕过接口权限守卫，绕不过这里——要让管理员能改就把 admin 加进主管角色；
 * - 数据范围只取**主管角色自己的**范围（多个主管角色取并集），不用登录态里合并过的 dataScope：
 *   那个合并按数值取最小，而 2 本部门 比 3 本部门及下级 范围更小，合并结果并不可靠；
 * - 数据范围只管「能改哪些」，**查看不受影响**（使用方选定：台账、看板数字不因人而异）；
 * - 创建人部门取**当前**所在部门（t_user.dept_id），人员调岗后按新部门算。
 *
 * 仍须持有对应按钮权限（接口守卫先判）；本服务只回答「这条记录你能不能动」。
 */
@Injectable()
export class RecordOwnershipService {
  constructor(
    private readonly systemConfig: SystemConfigService,
    private readonly dataScope: DataScopeService,
    private readonly dataSource: DataSource,
  ) {}

  private async context(module: OwnedModule, user: CurrentUserPayload): Promise<OwnershipContext> {
    const editRoles = await this.systemConfig.getEditRoles(module);
    const mine = (user.roleCodes ?? []).filter((c) => editRoles.includes(c));
    const ctx: OwnershipContext = { userId: user.id, supervisor: false, allowedDepts: new Set(), selfOnly: false };
    if (!mine.length) return ctx;

    const roles: Array<{ id: number; data_scope: number }> = await this.dataSource.query(
      `SELECT id, data_scope FROM t_role WHERE status = 1 AND role_code IN (${mine.map(() => '?').join(',')})`,
      mine,
    );
    if (!roles.length) return ctx;
    ctx.supervisor = true;
    for (const r of roles) {
      const scope = Number(r.data_scope);
      if (scope === 1) {
        ctx.allowedDepts = null; // 全部
        return ctx;
      }
      if (scope === 2 && user.deptId) ctx.allowedDepts!.add(user.deptId);
      if (scope === 3) (await this.dataScope.getSubDeptIds(user.deptId)).forEach((d) => ctx.allowedDepts!.add(d));
      if (scope === 4) ctx.selfOnly = true;
      if (scope === 5) {
        const depts: Array<{ dept_id: number }> = await this.dataSource.query(
          'SELECT dept_id FROM t_role_dept WHERE role_id = ?',
          [r.id],
        );
        depts.forEach((d) => ctx.allowedDepts!.add(Number(d.dept_id)));
      }
    }
    return ctx;
  }

  /** 批量判定（列表用）：只查一次配置与一次创建人部门 */
  async canModifyMany(module: OwnedModule, records: OwnedRecord[], user: CurrentUserPayload): Promise<boolean[]> {
    const ctx = await this.context(module, user);
    const others = [...new Set(records.map((r) => r.creatorId).filter((id): id is number => id != null && id !== user.id))];
    const deptOf = new Map<number, number | null>();
    if (ctx.supervisor && ctx.allowedDepts && others.length) {
      const rows: Array<{ id: number; dept_id: number | null }> = await this.dataSource.query(
        `SELECT id, dept_id FROM t_user WHERE id IN (${others.map(() => '?').join(',')})`,
        others,
      );
      rows.forEach((u) => deptOf.set(Number(u.id), u.dept_id == null ? null : Number(u.dept_id)));
    }
    return records.map((r) => {
      if (r.creatorId != null && r.creatorId === ctx.userId) return true;
      if (!ctx.supervisor || r.creatorId == null) return false;
      if (ctx.allowedDepts === null) return true;
      const dept = deptOf.get(r.creatorId);
      return dept != null && ctx.allowedDepts.has(dept);
    });
  }

  async canModify(module: OwnedModule, record: OwnedRecord, user: CurrentUserPayload): Promise<boolean> {
    return (await this.canModifyMany(module, [record], user))[0];
  }

  /** 无权即抛 403，提示「谁能改」 */
  async assertCanModify(
    module: OwnedModule,
    record: OwnedRecord,
    user: CurrentUserPayload,
    action = '修改',
  ): Promise<void> {
    if (await this.canModify(module, record, user)) return;
    const ctx = await this.context(module, user);
    const noun = MODULE_NOUN[module];
    if (ctx.supervisor) {
      throw new ForbiddenException(
        `这条${noun}的创建人（${record.creatorName || '未知'}）不在您的数据范围内，不能${action}`,
      );
    }
    throw new ForbiddenException(`只有${await this.editorsText(module, record)}可以${action}这条${noun}`);
  }

  /** 「谁能改」提示文案：创建人（张三）或计划经理、生产经理 */
  async editorsText(module: OwnedModule, record: OwnedRecord): Promise<string> {
    const codes = await this.systemConfig.getEditRoles(module);
    const names: Array<{ role_name: string }> = codes.length
      ? await this.dataSource.query(
          `SELECT role_name FROM t_role WHERE role_code IN (${codes.map(() => '?').join(',')}) ORDER BY sort, id`,
          codes,
        )
      : [];
    const creator = `${module === 'order' ? '订单' : ''}创建人（${record.creatorName || '未知'}）`;
    return names.length ? `${creator}或${names.map((r) => r.role_name).join('、')}` : creator;
  }
}
