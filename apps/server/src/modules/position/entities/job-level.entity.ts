import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { POSITION_NATURE } from '@hb-oms/shared';

/**
 * 职级主数据（2026-08-12 由字典 `job_level` 升级而来）。
 *
 * 职级表达的是「**在本序列内的等级**」，不是岗位名称——
 * 质检员分初/中/高级，工程师分助理/工程师/高级/资深，管理分班组长/主管/经理/高管。
 *
 * 之所以不继续用数据字典：序列归属得靠 `t_dict.parent_value` 手填「上级键值」，
 * 在通用字典页面维护极易填错，故给它一张自己的表和自己的维护页。
 *
 * 与岗位的关系：`t_position.job_level_id` 引用本表 id；**被岗位引用后禁止删除**，
 * 要下线用「停用」。
 */
@Entity('t_job_level')
export class JobLevel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: 'level_name',
    type: 'varchar',
    length: 64,
    comment: '职级名称（如 主管级 / 工程师 / 初级）',
  })
  levelName: string;

  /** 所属序列 = 岗位性质，岗位表单据此级联过滤职级下拉 */
  @Index('idx_nature')
  @Column({
    name: 'position_nature',
    type: 'varchar',
    length: 16,
    default: POSITION_NATURE.NORMAL,
    comment: '所属序列 = 岗位性质：normal普通岗 manager管理岗 tech技术岗',
  })
  positionNature: string;

  @Column({
    name: 'level_rank',
    type: 'int',
    default: 0,
    comment: '序列内等级高低（越大越高，供排序与日后挂薪资带宽）',
  })
  levelRank: number;

  @Column({ type: 'int', default: 0, comment: '排序（越小越靠前，控制下拉顺序）' })
  sort: number;

  @Index('idx_status')
  @Column({
    type: 'tinyint',
    default: 1,
    comment: '状态：1启用 0停用（停用后不进下拉，已引用它的岗位不受影响）',
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
