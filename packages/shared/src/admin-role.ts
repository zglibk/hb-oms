/** 管理员 / 超级管理员的跨端唯一口径。 */
export const ADMIN_ROLE_CODE = 'SYS_OPR';
export const SUPER_ADMIN_ROLE_CODE = 'admin';
export const SUPER_ADMIN_USERNAME = 'admin';
export const ADMIN_ROLE_NAME = '管理员';
export const SUPER_ADMIN_ROLE_NAME = '超级管理员';

/** 历史版本给内置 admin 账号使用过的占位姓名。 */
export const LEGACY_SUPER_ADMIN_NAMES = [
  '管理员',
  '系统管理员',
  SUPER_ADMIN_ROLE_NAME,
] as const;

export interface ActorIdentity {
  username?: string | null;
  realName?: string | null;
}

export function isSuperAdminUsername(username: string | null | undefined): boolean {
  return username === SUPER_ADMIN_USERNAME;
}

export function isPrivilegedAdminRoleCode(roleCode: string | null | undefined): boolean {
  return roleCode === ADMIN_ROLE_CODE || roleCode === SUPER_ADMIN_ROLE_CODE;
}

/**
 * 账号资料里的姓名口径：内置 admin 若仍使用旧占位名，统一显示为「超级管理员」；
 * 若已填写真实姓名则保留真实姓名。
 */
export function normalizeAccountRealName(
  username: string | null | undefined,
  realName: string | null | undefined,
): string {
  const name = (realName || '').trim();
  if (!isSuperAdminUsername(username)) return name;
  if (!name || (LEGACY_SUPER_ADMIN_NAMES as readonly string[]).includes(name)) {
    return SUPER_ADMIN_ROLE_NAME;
  }
  return name;
}

/**
 * 操作日志 / 审计快照使用的显示名。
 * 超级管理员填了真实姓名时保留追责信息，同时追加角色标识，避免再与普通管理员混淆。
 */
export function actorDisplayName(actor: ActorIdentity | null | undefined): string {
  if (!actor) return '';
  const username = (actor.username || '').trim();
  const name = normalizeAccountRealName(username, actor.realName);
  if (!isSuperAdminUsername(username)) return name || username;
  return name === SUPER_ADMIN_ROLE_NAME
    ? SUPER_ADMIN_ROLE_NAME
    : `${name}（${SUPER_ADMIN_ROLE_NAME}）`;
}
