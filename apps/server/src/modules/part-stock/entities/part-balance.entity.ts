import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 部件台账余量（设计文档 §4.6）。
 *
 * **属性锚定、不挂订单**：部件（外/中/内轨）在表面处理前是通用半成品，
 * 同一属性的部件不区分是哪张订单的，故用 7 维属性作唯一键而非订单锚点。
 *
 * V1 定位是**独立参考台账**：只有「期初录入 + 手工调整」两个入口，
 * **不与外发/成品单据联动**（§2.1）——本项目不做报工，部件产出没有采集点，
 * 强行联动没有数据基础。联动列入 V2（§10）。
 *
 * 余量每次变动都必须同时写 `t_part_adjust` 流水（§4.6「不直接改数无痕」）。
 */
@Entity('t_part_balance')
@Unique('uk_part_7dim', [
  'partType',
  'side',
  'itemNo',
  'railSection',
  'productType',
  'materialThickness',
  'dimensionMm',
])
export class PartBalance {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_part_type')
  @Column({
    name: 'part_type',
    type: 'varchar',
    length: 32,
    default: '',
    comment: '部件：outer外轨 middle中轨 inner内轨',
  })
  partType: string;

  @Column({
    name: 'side',
    type: 'varchar',
    length: 16,
    default: '',
    comment: '边别：left左 right右，非卡口空串',
  })
  side: string;

  @Index('idx_item_no')
  @Column({
    name: 'item_no',
    type: 'varchar',
    length: 64,
    default: '',
    comment: '货号（如 53#）。注意：与 hb-mes 用物料代码不同，本项目按业务习惯改用货号',
  })
  itemNo: string;

  @Column({
    name: 'rail_section',
    type: 'varchar',
    length: 32,
    default: '',
    comment: '轨道节数：two_section二节轨 three_section三节轨',
  })
  railSection: string;

  @Column({
    name: 'product_type',
    type: 'varchar',
    length: 128,
    default: '',
    comment: '产品类型多选组合串（字典序逗号拼接，与产品行同一规范化口径）',
  })
  productType: string;

  @Column({
    name: 'material_thickness',
    type: 'varchar',
    length: 32,
    default: '',
    comment: '料厚（如 1.2×1.0×1.2 或单值 1.5）',
  })
  materialThickness: string;

  @Column({
    name: 'dimension_mm',
    type: 'int',
    default: 0,
    comment: '规格（mm 统一口径，1英寸=25mm）',
  })
  dimensionMm: number;

  @Column({
    name: 'quantity',
    type: 'int',
    default: 0,
    comment: '台账余量（支）；只由期初录入与手工调整驱动，且每次变动必写 t_part_adjust 流水',
  })
  quantity: number;

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
