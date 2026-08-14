import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 生产 BOM 物料明细；顺序由 sort 决定。 */
@Entity('t_production_bom_item')
export class ProductionBomItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'bom_id', type: 'int', comment: '生产BOM表头ID' })
  bomId: number;

  @Column({ name: 'material_id', type: 'int', nullable: true, comment: '关联部件ID（可空）' })
  materialId: number | null;

  @Column({ name: 'item_name', type: 'varchar', length: 128, comment: '零件名称' })
  itemName: string;

  @Column({ name: 'item_code', type: 'varchar', length: 128, nullable: true, comment: '图号（编号）' })
  itemCode: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '规格' })
  spec: string | null;

  @Column({ name: 'quantity_per_set', type: 'decimal', precision: 14, scale: 4, nullable: true, comment: '数量/套（整套总用量）' })
  quantityPerSet: string | null;

  @Column({ name: 'quantity_unit', type: 'varchar', length: 16, default: 'PCS', comment: '数量单位' })
  quantityUnit: string;

  @Column({ name: 'split_left_right', type: 'tinyint', default: 0, comment: '是否分左右：0否1是' })
  splitLeftRight: number;

  @Column({ name: 'material_thickness', type: 'varchar', length: 32, nullable: true, comment: '材料厚度' })
  materialThickness: string | null;

  @Column({ name: 'unit_consumption', type: 'decimal', precision: 14, scale: 6, nullable: true, comment: '单耗kg/支' })
  unitConsumption: string | null;

  @Column({ name: 'surface_treatment', type: 'varchar', length: 64, nullable: true, comment: '表面处理（文本快照）' })
  surfaceTreatment: string | null;

  @Column({ name: 'sheet_material', type: 'varchar', length: 64, nullable: true, comment: '材质' })
  sheetMaterial: string | null;

  @Column({ name: 'supplier_id', type: 'int', nullable: true, comment: '关联供应商ID（可空）' })
  supplierId: number | null;

  @Column({ name: 'supplier_name', type: 'varchar', length: 128, nullable: true, comment: '供应商名称快照' })
  supplierName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'int', default: 0, comment: '行序' })
  sort: number;
}
