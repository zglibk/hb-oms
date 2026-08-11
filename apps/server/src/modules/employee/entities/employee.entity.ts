import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 人事档案（HR 模块）。
 * 可读取部门等主数据；V1 暂不向业务模块对外供数（无 user_id、无跨模块 options）。
 */
@Entity('t_employee')
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'emp_no', type: 'varchar', length: 32, unique: true, comment: '员工编号（全库唯一，手工录入）' })
  empNo: string;

  @Column({ name: 'emp_name', type: 'varchar', length: 64, comment: '姓名' })
  empName: string;

  @Column({ type: 'tinyint', default: 0, comment: '性别：0未知 1男 2女' })
  gender: number;

  @Column({ name: 'id_card', type: 'varchar', length: 18, nullable: true, unique: true, comment: '身份证号' })
  idCard: string | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true, comment: '出生日期（可由身份证带出）' })
  birthDate: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '联系方式' })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '住址' })
  address: string | null;

  @Column({
    name: 'emergency_contact',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '紧急联系人（如：张三 138xxxx）',
  })
  emergencyContact: string | null;

  @Column({ name: 'native_place', type: 'varchar', length: 64, nullable: true, comment: '籍贯' })
  nativePlace: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '民族' })
  ethnicity: string | null;

  @Column({
    name: 'marital_status',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '婚姻状况（字典 marital_status）',
  })
  maritalStatus: string | null;

  @Column({
    name: 'political_status',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '政治面貌（字典 political_status）',
  })
  politicalStatus: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '学历（字典 education）' })
  education: string | null;

  @Column({
    name: 'education_type',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '学历类型：full_time全日制 part_time非全日制',
  })
  educationType: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '专业' })
  major: string | null;

  @Column({
    name: 'graduate_school',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '最终毕业院校',
  })
  graduateSchool: string | null;

  @Column({
    name: 'graduate_date',
    type: 'date',
    nullable: true,
    comment: '毕业时间（存当月首日，界面按月录入）',
  })
  graduateDate: string | null;

  @Column({
    name: 'emp_type',
    type: 'varchar',
    length: 32,
    comment: '用工属性：formal/temp/dispatch/apprentice（字典 emp_type）',
  })
  empType: string;

  @Column({ name: 'hire_date', type: 'date', nullable: true, comment: '入职日期' })
  hireDate: string | null;

  @Column({ name: 'probation_months', type: 'tinyint', nullable: true, comment: '试用期（月），空或0=无试用期' })
  probationMonths: number | null;

  @Column({ name: 'contract_end_date', type: 'date', nullable: true, comment: '合同到期日' })
  contractEndDate: string | null;

  @Column({ name: 'job_status', type: 'tinyint', default: 1, comment: '在职状态：1在职 2离职' })
  jobStatus: number;

  @Column({ name: 'leave_date', type: 'date', nullable: true, comment: '离职日期（离职时必填）' })
  leaveDate: string | null;

  @Column({ name: 'leave_reason', type: 'varchar', length: 255, nullable: true, comment: '离职原因' })
  leaveReason: string | null;

  @Column({ name: 'dept_id', type: 'int', nullable: true, comment: '所属车间/组织（t_department.id）' })
  deptId: number | null;

  @Column({ name: 'team_group', type: 'varchar', length: 64, nullable: true, comment: '班组（自由文本）' })
  teamGroup: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '岗位（字典 hr_position）' })
  position: string | null;

  @Column({ name: 'supervisor_id', type: 'int', nullable: true, comment: '直属车间主管（本表 id）' })
  supervisorId: number | null;

  @Column({ type: 'tinyint', default: 1, comment: '档案启停：1启用 0停用（离职时自动置0）' })
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
