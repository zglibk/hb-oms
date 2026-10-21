import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, Matches } from 'class-validator';

/** 首页「交付风险分布」观察窗口；周期与自定义日期范围二选一。 */
export class QueryDeliveryRiskDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 60, 90])
  days?: 30 | 60 | 90;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '开始日期格式必须为 YYYY-MM-DD' })
  @IsDateString({ strict: true }, { message: '开始日期格式不正确' })
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '结束日期格式必须为 YYYY-MM-DD' })
  @IsDateString({ strict: true }, { message: '结束日期格式不正确' })
  dateTo?: string;
}
