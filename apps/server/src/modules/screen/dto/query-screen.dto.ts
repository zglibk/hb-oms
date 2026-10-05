import { IsDateString, IsOptional } from 'class-validator';

/**
 * 数据大屏查询：时间范围只作用于「区间」类面板（趋势、流转、车间产出、订单状态分布），
 * 「实时」类面板（欠数、库存、逾期列表…）不受影响。缺省为本月 1 日 ~ 今天。
 * 起止先后与跨度上限（366 天）在 service 里校验——涉及两个字段的关系，单字段装饰器表达不了。
 */
export class QueryScreenDto {
  @IsOptional()
  @IsDateString({}, { message: '开始日期格式不正确' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: '结束日期格式不正确' })
  to?: string;
}
