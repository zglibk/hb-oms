import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** 下游建单与订单删除共用的父订单行锁，避免检查引用后又插入孤儿流水。 */
@Injectable()
export class OrderReferenceLockService {
  async lockByProductIds(manager: EntityManager, productIds: number[]): Promise<number[]> {
    const ids = this.validIds(productIds);
    if (!ids.length) return [];
    const rows: any[] = await manager.query(
      `SELECT p.order_id AS id
         FROM t_order_product p
        WHERE p.id IN (${ids.map(() => '?').join(',')})
        ORDER BY p.order_id, p.id`,
      ids,
    );
    return this.lockOrderIds(manager, rows.map((row) => Number(row.id)));
  }

  async lockByPartGroupIds(manager: EntityManager, groupIds: number[]): Promise<number[]> {
    const ids = this.validIds(groupIds);
    if (!ids.length) return [];
    const rows: any[] = await manager.query(
      `SELECT g.order_id AS id
         FROM t_order_part_group g
        WHERE g.id IN (${ids.map(() => '?').join(',')})
        ORDER BY g.order_id, g.id`,
      ids,
    );
    return this.lockOrderIds(manager, rows.map((row) => Number(row.id)));
  }

  async lockOrderIds(manager: EntityManager, orderIds: number[]): Promise<number[]> {
    const ids = this.validIds(orderIds);
    if (!ids.length) return [];
    const rows: any[] = await manager.query(
      `SELECT id FROM t_order
        WHERE id IN (${ids.map(() => '?').join(',')})
        ORDER BY id
        FOR UPDATE`,
      ids,
    );
    return rows.map((row) => Number(row.id));
  }

  private validIds(ids: number[]): number[] {
    return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
  }
}
