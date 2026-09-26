import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PART_ADJUST_SOURCE } from '@hb-oms/shared';
import { OpeningFinishedDto, OpeningPartDto } from './dto/opening.dto';
import { FinishedStockService } from '../finished-stock/finished-stock.service';
import { PartStockService } from '../part-stock/part-stock.service';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * 期初录入（设计文档 §4.8）：系统上线时把手工账上的存量搬进系统，菜单常驻、可反复补录。
 *
 * 本模块**不自己写库**，只做编排——两条通道都复用既有服务：
 * - 成品期初 → `FinishedStockService.createOpeningBalance`（§6 明确「内部走 finished-stock 通道」），
 *   于是期初单与普通出入库单同表同流程，能查、能红字冲销、能进台账完成数；
 * - 部件期初 → `PartStockService.adjust` 且 `source='opening'`，于是期初同样落变动流水，
 *   事后能回答「这个部件余量怎么来的」（§4.6「不直接改数无痕」）。
 *
 * 各自另写一套写库逻辑会立刻造成口径分叉，这是本模块存在的唯一理由。
 */
@Injectable()
export class OpeningService {
  constructor(
    private readonly finishedStock: FinishedStockService,
    private readonly partStock: PartStockService,
    private readonly dataSource: DataSource,
  ) {}

  /** 成品期初：支持「挂订单」与「纯属性（不挂订单）」两种行混录 */
  async openingFinished(dto: OpeningFinishedDto, user: CurrentUserPayload) {
    return this.finishedStock.createOpeningBalance(dto, user);
  }

  /**
   * 部件期初：多行在**同一个事务**内累加，全有全无。
   *
   * 为什么不做部分成功：部件台账是**累加**语义。若某行失败而其余行已落库，
   * 用户改完坏行重提整批，先前成功的行会被**加第二次**，直接把账做错。
   * 这也与项目既有的导入约定一致（客户导入同样是「整批校验通过才落库」）。
   * 出错时把行号带进提示，用户改完整批重提即可，不会重复计数。
   */
  async openingPart(dto: OpeningPartDto, user: CurrentUserPayload) {
    const reason = dto.reason?.trim() || '期初录入';
    return this.dataSource.transaction(async (mgr) => {
      const results: Array<{ index: number; itemNo: string; quantity: number }> = [];
      for (let i = 0; i < dto.items.length; i++) {
        const it = dto.items[i];
        try {
          const res = await this.partStock.adjustInTx(
            mgr,
            {
              partType: it.partType,
              side: it.side,
              itemNo: it.itemNo,
              railSection: it.railSection,
              productType: it.productType,
              materialThickness: it.materialThickness,
              dimensionMm: it.dimensionMm,
              delta: it.quantity,
              reason,
              source: PART_ADJUST_SOURCE.OPENING,
              remark: it.remark,
            },
            user,
          );
          results.push({ index: i + 1, itemNo: it.itemNo, quantity: res.quantity });
        } catch (e) {
          // 带上行号重新抛出，整批回滚；用户改完重提不会重复计数
          throw new BadRequestException(
            `第 ${i + 1} 行（产品代码 ${it.itemNo}）：${(e as Error)?.message ?? '录入失败'}`,
          );
        }
      }
      return { total: dto.items.length, items: results };
    });
  }
}
