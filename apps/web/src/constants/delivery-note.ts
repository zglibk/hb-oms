import type { DeliveryNoteRow } from '@/api/finished-stock';

/**
 * 送货单模板注册表（CLAUDE.md §5.6「送货单打印」）。
 *
 * 不同客户的送货单版式不同——列集合、列名、联系电话、签名项都不一样，本文件是这些
 * **版式差异的唯一定义处**。服务端只负责把候选字段全给出来，不持有任何版式知识。
 *
 * 加一套新客户模板 = 在 `DELIVERY_TEMPLATES` 里加一条，无需改后端、无需迁移 SQL：
 * 客户资料与系统配置的下拉选项都从这张表生成，库里的模板编码不做值域约束。
 *
 * **仅前端用，不进共享包**（同 `SURFACE_DEFAULT_COLOR` 先例）：版式是展示层的事，
 * 服务端出 PDF 也是渲染这张前端页面，没有第二处需要它。
 */

/** 明细列定义 */
export interface DeliveryColumn {
  /**
   * 取值字段：`DeliveryNoteRow` 的键，另有两个特殊值——
   * `seq` 序号列、`blank` 空列（如耐斯克模板的「单价」，系统内无价格字段，留白手填）。
   */
  key: keyof DeliveryNoteRow | 'blank';
  /** 表头文案；数量列用 `{unit}` 占位单位（全单单位不一致时整列退化成「数量」） */
  label: string;
  /** 列宽百分比（一套模板加起来 100%） */
  width: string;
  align?: 'left' | 'center';
  /** 保留换行：品名/备注在纸质单上就是多行文本 */
  pre?: boolean;
  /** 主字段为空时依次回落的字段（品名列用：要求描述 ↔ 产品名称 ↔ 产品型号） */
  fallbackKeys?: Array<keyof DeliveryNoteRow>;
}

export interface DeliveryTemplate {
  code: string;
  /** 下拉里显示的模板名 */
  name: string;
  /** 联系行（地址/电话/传真）——两个客户的联系电话不同，属版式的一部分 */
  contactLine: string;
  /** 标题区右侧是否印「送货单编号：」（耐斯克版有，精工版没有） */
  showDocNoInTitle: boolean;
  columns: DeliveryColumn[];
  /** 签名栏项目（耐斯克是「业务」，精工是「发货人」） */
  signatures: string[];
  /** 明细区最少行数：不足补空行，纸质单版式才稳定 */
  minRows: number;
  /** 底部联次说明 */
  footerNote: string;
}

const ADDRESS = '地址：广东省中山市南头穗西月桂东路23号';
const FAX = 'FAX：0760-87972639';
const FOOTER_NOTE = '白色联留底  红色联收款凭证  黄色联客户';

/** 品名列的回落链：主字段为空时不留空格，依次退到产品名称/要求描述、最后是产品型号 */
const NAME_FALLBACK: Array<keyof DeliveryNoteRow> = ['productName', 'productModel'];
const REQ_FALLBACK: Array<keyof DeliveryNoteRow> = ['productRequirement', 'productModel'];

export const DELIVERY_TEMPLATES: DeliveryTemplate[] = [
  {
    code: 'generic',
    name: '通用',
    contactLine: `${ADDRESS}  TEL：0760-87972626  ${FAX}`,
    showDocNoInTitle: false,
    columns: [
      { key: 'seq', label: '序号', width: '5%', align: 'center' },
      { key: 'poNo', label: '客户订单号', width: '15%', align: 'center' },
      { key: 'productModel', label: '产品名称', width: '24%', pre: true, fallbackKeys: ['productName', 'productRequirement'] },
      { key: 'specText', label: '规格', width: '10%', align: 'center' },
      { key: 'qty', label: '数量（{unit}）', width: '12%', align: 'center' },
      { key: 'productionNo', label: '海宝单号', width: '16%', align: 'center' },
      { key: 'remark', label: '备注', width: '18%', pre: true },
    ],
    signatures: ['制单', '业务', '仓库收货人'],
    minRows: 8,
    footerNote: FOOTER_NOTE,
  },
  {
    code: 'nsk',
    name: '耐斯克-湖北',
    // 该客户版印的是业务手机号（对方按这个号找人），不是公司总机
    contactLine: `${ADDRESS}  TEL：13802658930  ${FAX}`,
    showDocNoInTitle: true,
    columns: [
      { key: 'seq', label: '序号', width: '4.5%', align: 'center' },
      { key: 'poNo', label: '采购单编号', width: '13.5%', align: 'center' },
      { key: 'materialCode', label: '物料编码', width: '13.5%', align: 'center' },
      // 「品名」栏是客户那套长描述（型号+尺寸+配件说明），对应订单的「产品要求描述」
      { key: 'productRequirement', label: '品名', width: '18.5%', pre: true, fallbackKeys: NAME_FALLBACK },
      // 系统内无价格字段，留白供手填（纸质单上这一格本就常空着）
      { key: 'blank', label: '单价', width: '6.5%', align: 'center' },
      { key: 'specText', label: '规格', width: '7%', align: 'center' },
      { key: 'qty', label: '数量（{unit}）', width: '10%', align: 'center' },
      { key: 'productionNo', label: '海宝内部单号', width: '12.5%', align: 'center' },
      { key: 'remark', label: '备注', width: '14%', pre: true },
    ],
    signatures: ['制单', '业务', '仓库收货人'],
    minRows: 8,
    footerNote: FOOTER_NOTE,
  },
  {
    code: 'jinggong',
    name: '精工',
    contactLine: `${ADDRESS}  TEL：0760-87972626 ${FAX}`,
    showDocNoInTitle: false,
    columns: [
      { key: 'seq', label: '序号', width: '4.5%', align: 'center' },
      { key: 'poNo', label: '合同编号', width: '16%', align: 'center' },
      // 该客户版的「产品名称」是单行成品名，对应订单的「产品名称」
      { key: 'productName', label: '产品名称', width: '25%', pre: true, fallbackKeys: REQ_FALLBACK },
      { key: 'materialCode', label: '产品编码', width: '13%', align: 'center' },
      { key: 'qty', label: '数量/{unit}', width: '11.5%', align: 'center' },
      { key: 'productionNo', label: '海宝单号', width: '13%', align: 'center' },
      { key: 'remark', label: '备注', width: '17%', pre: true },
    ],
    // 该客户版签的是「发货人」而不是「业务」
    signatures: ['制单', '发货人', '仓库收货人'],
    minRows: 4,
    footerNote: FOOTER_NOTE,
  },
];

/**
 * 预览用样例单据（「系统管理 → 打印模板」页）。
 *
 * **刻意用假客户与假单号**：这是一张配置页，不该把真实客户的地址电话摆在上面；
 * 想看真实效果可以在预览页切成「真实单据」。三行明细覆盖了模板的典型情形——
 * 多行品名描述、寸与 mm 两种规格写法、含卡口合并后的整行、带备注的行。
 */
export const SAMPLE_DELIVERY_NOTE = {
  docId: 0,
  docNo: 'FGO260814-0001',
  deliveryNo: '20260814-0001',
  docDate: '2026-08-14',
  bizType: 'sale_outbound',
  status: 2,
  remark: '共19托',
  creatorName: '（制单人）',
  customerName: '示例客户有限公司（预览用）',
  customerCode: 'SAMPLE',
  customerPhone: '0760-00000000',
  customerAddress: '示例省示例市示例工业园 1 号',
  templateCode: '',
  salesman: '（业务员）',
  merchandiser: '（跟单员）',
  rows: [
    {
      seq: 1,
      orderProductId: 0,
      poNo: '2PO26070092',
      materialCode: '903.001-0107',
      productName: '异型同步隐藏三节轨',
      productRequirement: '异型同步隐藏三节轨\nCS-81CN-17寸\n配全新2D全灰把手',
      productModel: '53#普通卡口滑轨',
      itemNo: '53#',
      specText: '17寸',
      qty: 500,
      unit: 'set',
      unitLabel: '套',
      qtyPcs: 1000,
      productionNo: 'NSK2615',
      orderNo: 'ORD260814-0001',
      remark: '滑轨：13托X400套\n把手：每2件码在一托滑轨上',
    },
    {
      seq: 2,
      orderProductId: 0,
      poNo: '20260626002',
      materialCode: '040100000059',
      productName: '自闭装配式导轨~海宝~400X45~带卡包',
      productRequirement: '',
      productModel: '45#自锁滑轨',
      itemNo: '45#',
      specText: '400mm',
      qty: 260,
      unit: 'set',
      unitLabel: '套',
      qtyPcs: 520,
      productionNo: 'JJG2646-B',
      orderNo: 'ORD260814-0002',
      remark: '45#400mm卡扣自锁',
    },
    {
      seq: 3,
      orderProductId: 0,
      poNo: '20260703004',
      materialCode: '040100000035',
      productName: '装配式导轨~星徽（海宝）~535X45',
      productRequirement: '',
      productModel: '45#缓冲滑轨',
      itemNo: '45#',
      specText: '535mm',
      qty: 128,
      unit: 'set',
      unitLabel: '套',
      qtyPcs: 256,
      productionNo: 'JJG2648',
      orderNo: 'ORD260814-0003',
      remark: '',
    },
  ],
  totals: [{ unit: 'set', unitLabel: '套', qty: 888 }],
  unitConsistent: true,
  unitLabel: '套',
};

/** 客户资料 / 系统配置的模板下拉选项 */
export const DELIVERY_TEMPLATE_OPTIONS = DELIVERY_TEMPLATES.map((t) => ({
  label: t.name,
  value: t.code,
}));

export const DEFAULT_DELIVERY_TEMPLATE = 'generic';

/**
 * 按编码取模板：**取不到一律回落通用模板**，不抛错。
 * 库里的编码不做值域约束（见文件头注释），删掉一套模板时存量客户身上的旧编码
 * 不该让整张单据打不开——回落到通用版至少还能发货。
 */
export function deliveryTemplateOf(code: string | null | undefined): DeliveryTemplate {
  const hit = DELIVERY_TEMPLATES.find((t) => t.code === String(code ?? '').trim());
  return hit ?? DELIVERY_TEMPLATES[0];
}
