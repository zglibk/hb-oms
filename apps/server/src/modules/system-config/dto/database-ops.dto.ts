import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /** 仅“限制为本机访问”使用；其余动作忽略。 */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  confirm?: string;
}
