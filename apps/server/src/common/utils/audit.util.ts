import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { actorDisplayName, type ActorIdentity } from '@hb-oms/shared';

/** 审计用显示名：优先真实姓名，回退登录账号 */
export function auditDisplayName(
  user: ActorIdentity | null | undefined,
): string {
  return actorDisplayName(user);
}

/** 新建记录时写入：创建人/更新人 ID 与姓名快照（更新人初始同创建人） */
export function auditOnCreate(user: CurrentUserPayload): {
  creatorId: number;
  creatorName: string | null;
  updaterId: number;
  updaterName: string | null;
} {
  const name = auditDisplayName(user) || null;
  return {
    creatorId: user.id,
    creatorName: name,
    updaterId: user.id,
    updaterName: name,
  };
}

/** 更新记录时写入：仅最后更新人 ID 与姓名快照（不触碰 creator_*） */
export function auditOnUpdate(user: CurrentUserPayload): {
  updaterId: number;
  updaterName: string | null;
} {
  return {
    updaterId: user.id,
    updaterName: auditDisplayName(user) || null,
  };
}
