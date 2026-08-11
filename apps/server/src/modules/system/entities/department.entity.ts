import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('t_department')
export class Department {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'dept_code' })
  deptCode: string;

  @Column({ name: 'dept_name' })
  deptName: string;

  /**
   * 部门人事编码：员工编号第 5-7 位的来源（如 005 品检部）。
   * 放在部门主数据而不是写死在代码里——部门会增减，硬编码迟早和库里对不上。
   * 空 = 该部门不参与员工编码，拿它建档会被服务端拒绝并提示先去配置。
   */
  @Column({
    name: 'hr_code',
    type: 'varchar',
    length: 3,
    nullable: true,
    comment: '部门人事编码（员工编号第5-7位，如 005）；空=该部门不参与员工编码，建档时会被拒绝',
  })
  hrCode: string | null;

  @Column({ name: 'parent_id', type: 'int', default: 0 })
  parentId: number;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '负责人' })
  leader: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '联系电话' })
  phone: string | null;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'creator_id', type: 'int', nullable: true })
  creatorId: number | null;

  /** 创建人姓名快照（审计用，停用/删除用户后仍可追溯） */
  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true })
  creatorName: string | null;

  /** 最后更新人 ID（审计用） */
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updaterId: number | null;

  /** 最后更新人姓名快照 */
  @Column({ name: 'updater_name', type: 'varchar', length: 64, nullable: true })
  updaterName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
