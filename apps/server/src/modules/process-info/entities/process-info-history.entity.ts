import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 工艺信息修改履历（新增/修改，产品级+部件级粒度）。
 * changes 为变更明细 JSON 数组：[{ field, label, scope, old, new }]，
 * scope：product 产品级 / outer 外轨 / middle 中轨 / inner 内轨。
 * 记录删除时履历由服务层级联删除（无外键，锚 process_info_id）。
 */
@Entity('t_process_info_history')
export class ProcessInfoHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_process')
  @Column({ name: 'process_info_id', type: 'int', comment: '工艺记录ID' })
  processInfoId: number;

  @Index('idx_drawing')
  @Column({ name: 'drawing_no', type: 'varchar', length: 128, comment: '生产图号快照' })
  drawingNo: string;

  @Column({ type: 'varchar', length: 16, comment: '动作：create新增 update修改 import导入更新' })
  action: string;

  @Column({ type: 'text', nullable: true, comment: '变更明细 JSON 数组：[{field,label,scope,old,new}]' })
  changes: string | null;

  @Column({ name: 'operator_id', type: 'int', nullable: true, comment: '操作人ID' })
  operatorId: number | null;

  @Column({ name: 'operator_name', type: 'varchar', length: 64, nullable: true, comment: '操作人姓名快照' })
  operatorName: string | null;

  @CreateDateColumn({ name: 'created_at', comment: '操作时间' })
  createdAt: Date;
}
