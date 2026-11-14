import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const DATABASE_OPS_ACTIONS = [
  'update-policy',
  'restart-guard',
  'watchdog',
  'local-bind',
] as const;

export type DatabaseOpsAction = (typeof DATABASE_OPS_ACTIONS)[number];

/** 数据库运维页只允许选择固定动作，绝不接收命令、脚本或服务器路径。 */
export class ApplyDatabaseOpsDto {
  @IsIn(DATABASE_OPS_ACTIONS)
  action: DatabaseOpsAction;

  /** true=启用，false=停用；兼容旧客户端，省略时按启用处理。 */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** 启用或停用“生产服务器内部访问限制”时使用；其余动作忽略。 */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  confirm?: string;
}
