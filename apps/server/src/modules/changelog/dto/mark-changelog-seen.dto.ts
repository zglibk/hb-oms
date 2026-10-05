import { IsInt, Min } from 'class-validator';

/** 首页「系统更新」弹窗关闭时登记已读 */
export class MarkChangelogSeenDto {
  /** 本次弹窗看到的最大更新日志 id（取自 GET /changelog/unseen 的 latestId） */
  @IsInt({ message: '更新日志 id 必须是整数' })
  @Min(1, { message: '更新日志 id 无效' })
  id: number;
}
