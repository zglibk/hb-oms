import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

/** 首页「交付风险分布」观察窗口；按订单下单日期取最近 N 天。 */
export class QueryDeliveryRiskDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 60, 90])
  days = 30;
}
