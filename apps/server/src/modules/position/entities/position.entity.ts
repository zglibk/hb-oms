import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 岗位主数据（基础数据，2026-08-11 由字典 `hr_position` 升级而来）。
 *
 * 原先岗位只是一条字典项（标签/值/排序/启停），装不下岗位编码、所属部门、职级、
 * 编制人数这些信息；维护入口又挂在「系统管理 → 数据字典」下，HR 专员通常没有
 * 系统管理权限，进去还容易误改别的字典类型。故升级为独立主数据表。
 *
 * 与人事档案的关系：`t_employee.position_id` 引用本表 id（与同表 `dept_id` 同款），
 * 岗位改名/改编码不影响已建档员工；**被员工引用后禁止删除**（§5.5），要下线用「停用」。
 */
@Entity('t_position')
export class Position {
  @PrimaryGeneratedColumn()
  id: number;

  /** 岗位编码（唯一业务键） */
  @Column({
    name: 'position_code',
    type: 'varchar',
    length: 64,
    unique: true,
    comment: '岗位编码（唯一业务键）',
  })
  positionCode: string;

  /** 岗位名称；**不设唯一**——不同部门可以有同名岗位（如各车间的「组长」） */
  @Column({
    name: 'position_name',
    type: 'varchar',
    length: 64,
    comment: '岗位名称（可重复，编码才是唯一业务键；不同部门可有同名岗位）',
  })
  positionName: string;

  /**
   * 所属部门。**空 = 通用岗位**，任何部门的员工都能选到
   * （如「文员」「司机」这类跨部门存在的岗位）。
   */
  @Index('idx_dept')
  @Column({
    name: 'dept_id',
    type: 'int',
    nullable: true,
    comment: '所属部门（t_department.id）；空=通用岗位，不限部门',
  })
  deptId: number | null;

  @Column({
    name: 'job_level',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '职级（字典 job_level）',
  })
  jobLevel: string | null;

  @Column({
    name: 'is_manager',
    type: 'tinyint',
    default: 0,
    comment: '是否管理岗：1是 0否',
  })
  isManager: number;

  @Column({
    type: 'int',
    nullable: true,
    comment: '编制人数；空=不限编（列表用它与在岗人数对照，超编标红）',
  })
  headcount: number | null;

  /** 排序：越小越靠前，控制下拉顺序 */
  @Column({ type: 'int', default: 0, comment: '排序（越小越靠前，控制下拉顺序）' })
  sort: number;

  @Index('idx_status')
  @Column({
    type: 'tinyint',
    default: 1,
    comment: '状态：1启用 0停用（停用后不进下拉，已引用它的员工不受影响）',
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
