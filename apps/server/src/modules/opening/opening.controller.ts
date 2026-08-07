import { Body, Controller, Post } from '@nestjs/common';
import { OpeningService } from './opening.service';
import { OpeningFinishedDto, OpeningPartDto } from './dto/opening.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('opening')
export class OpeningController {
  constructor(private readonly service: OpeningService) {}

  /**
   * 成品期初：生成 opening_balance 单（FGO 序列）并立即生效。
   * 支持挂订单行与纯属性行混录；期初豁免装配闸门，但计入台账「完成数」。
   */
  @Post('finished')
  @RequirePermissions('opening:finished')
  @OperationLog('期初录入', '成品期初')
  async finished(@Body() dto: OpeningFinishedDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.openingFinished(dto, user);
  }

  /** 部件期初：按 7 维属性累加部件台账余量，逐行留变动流水 */
  @Post('part')
  @RequirePermissions('opening:part')
  @OperationLog('期初录入', '部件期初')
  async part(@Body() dto: OpeningPartDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.openingPart(dto, user);
  }
}
