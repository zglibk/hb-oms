import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 成品出入库单据头（设计文档 §3.3 / §4.5）。
 *
 * 状态机：1草稿 --确认--> 2已确认 --(更正)--> 开红字冲销单（原单不变）；9已作废仅从草稿进入。
 * **已确认单据禁止 UPDATE/DELETE**，更正一律开红字单（biz_type='reversal'，
 * origin_doc_id / origin_item_id 追溯原单原行）；红字单本身不可再冲销。
 * 余额只由「确认」与「红字冲销」驱动，任何地方都不得直接改 t_finished_balance。
 */
@Entity('t_finished_doc')
export class FinishedDoc {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('uk_doc_no', { unique: true })
  @Column({
    name: 'doc_no',
    type: 'varchar',
    length: 32,
    comment: '单号：FGI入库 / FGO出库（含期初） / FGR红字冲销，经 NumberGeneratorService 采番',
  })
  docNo: string;

  @Index('idx_biz_type')
  @Column({
    name: 'biz_type',
    type: 'varchar',
    length: 32,
    comment: '业务类型：inbound生产入库 opening_balance期初 sale_outbound销售出库 reversal红字冲销',
  })
  bizType: string;

  @Column({
    name: 'direction',
    type: 'tinyint',
    comment: '方向：1入库 -1出库；红字单方向与被冲原单相反，聚合时按 direction×quantity 自然抵扣',
  })
  direction: number;

  @Column({ name: 'doc_date', type: 'date', comment: '单据日期' })
  docDate: string;

  @Column({ name: 'work_team', type: 'varchar', length: 64, nullable: true, comment: '车间（字典 assembly_workshop 值；入库单可选，供追溯。2026-08-13 前为自由文本班组名，历史值原样保留）' })
  workTeam: string | null;

  /** 机台号已于 2026-08-13 停用录入（列保留供历史单据追溯，新单不再写入） */
  @Column({ name: 'machine_no', type: 'varchar', length: 64, nullable: true, comment: '机台号（已于 2026-08-13 停用录入，列保留供历史单据追溯）' })
  machineNo: string | null;

  @Index('idx_origin_doc')
  @Column({
    name: 'origin_doc_id',
    type: 'int',
    nullable: true,
    comment: '红字冲销单指向被冲原单ID；非红字单为 NULL',
  })
  originDocId: number | null;

  @Index('idx_status')
  @Column({
    name: 'status',
    type: 'tinyint',
    default: 1,
    comment: '状态：1草稿 2已确认 9已作废（仅草稿可作废；已确认只可红字冲销，禁改禁删）',
  })
  status: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ name: 'creator_id', type: 'int', nullable: true, comment: '创建人ID' })
  creatorId: number | null;

  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true, comment: '创建人姓名快照' })
  creatorName: string | null;

  @Column({ name: 'updated_by', type: 'int', nullable: true, comment: '最后更新人ID' })
  updaterId: number | null;

  @Column({ name: 'updater_name', type: 'varchar', length: 64, nullable: true, comment: '最后更新人姓名快照' })
  updaterName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
