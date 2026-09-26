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
  /**
   * 该列受哪个业务字段开关控制——开关停用时**整列不印**（§5.7 口径：
   * 停用的字段在录入框/表格列/导出列一并消失，打印列同理）。不填 = 始终显示。
   */
  flag?: 'colorEnabled';
}

export interface DeliveryTemplate {
  code: string;
  /** 下拉里显示的模板名 */
  name: string;
  /** 模板列表中的简短用途说明，只写能帮助选择模板的关键差异 */
  description: string;
  /** 联系行（地址/电话/传真）——两个客户的联系电话不同，属版式的一部分 */
  contactLine: string;
  /** 标题区右侧是否印「送货单编号：」（耐斯克版有，精工版没有） */
  showDocNoInTitle: boolean;
  /**
   * 客户信息区版式（联系行与明细表之间那几行）：
   * - `classic`：客户 + 电话 / 地址 + 日期 + NO（耐斯克、精工两版）
   * - `consignee`：收货单位 + 送货单号NO / 送货地址 + 日期（通用版，2026-09-26 起两行式）
   */
  metaStyle: 'classic' | 'consignee';
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
/**
 * 通用版的联次说明：厂里同时在用四联与五联两种单据纸，**差异只有这一行文字**
 * （版式、列、行数、签名栏完全相同），故两套模板共用下面的 `GENERIC_BASE`。
 */
const FOOTER_NOTE_4 = '第一联存根（白）　第二联收款依据（红）　第三联交客户（黄）　第四联入账（蓝）';
// 用普通字符串拼接而不是模板字面量：联次之间是全角空格，
// eslint 的 no-irregular-whitespace 只豁免普通字符串、不豁免模板字面量
const FOOTER_NOTE_5 = FOOTER_NOTE_4 + '　第五联仓库（绿）';

/** 品名列的回落链：主字段为空时不留空格，依次退到产品名称/要求描述、最后是产品型号 */
const NAME_FALLBACK: Array<keyof DeliveryNoteRow> = ['productName', 'productModel'];
const REQ_FALLBACK: Array<keyof DeliveryNoteRow> = ['productRequirement', 'productModel'];

/**
 * 编码列的回落链：耐斯克叫「物料编码」、精工叫「产品编码」，取的都是订单产品行的
 * **客户方编码**（`materialCode`）。没录时回退**客户图号**——两个号客户都能对上货，
 * 印一个总比留空强（业务部门 2026-08-14 指定）。
 */
const CODE_FALLBACK: Array<keyof DeliveryNoteRow> = ['customerDrawingNo'];

/**
 * 通用版的共用底座：四联与五联**只差底部一行联次说明**，其余（列、行数、签名栏、
 * 客户信息区版式）完全相同。抽成底座而不是复制两份——复制迟早改了一边忘了另一边。
 */
const GENERIC_BASE: Omit<DeliveryTemplate, 'code' | 'name' | 'description' | 'footerNote'> = {
  contactLine: `${ADDRESS}  TEL：0760-87972626 ${FAX}`,
  showDocNoInTitle: false,
  // 通用版的客户信息区是「收货单位 + 单号 / 送货地址 + 日期」两行式（2026-09-26 使用方要求：
  // 原「送货单位（我方公司名）」改为送货地址，原第三行我方电话传真取消——抬头联系行里已有）
  metaStyle: 'consignee',
  // 列宽合计 100%（含颜色列）；颜色开关关闭时 table-layout:fixed 会把空出的 7% 按比例摊给其余列。
  // 2026-09-26 加「料厚」后**在单元格内**用纸面字体实测重分（含内边距）：订单编号 15.5% 容 16 位 PO#
  // （PO1070C260800236 需 15.2%）、生产单号/物料编码 10.5% 容 10 位单号（需 10.1%）、单位 5.5%（4.5% 时表头折成「单/位」）；
  // 备注多为空、本就允许折行，故只留 6.5%。改宽度前先实测，凭字数估算会偏窄
  columns: [
    { key: 'seq', label: '序号', width: '5%', align: 'center' },
    // 「订单编号」印客户 PO#：送货单是给客户的，他按自己的采购单号对账
    { key: 'poNo', label: '订单编号', width: '15.5%', align: 'center' },
    // 生产单号（2026-09-25 补）：客户来电报货时常报的是我方单号，仓库/业务凭它直接回查订单。
    // 331 家客户全部走通用模板，缺这一列等于所有送货单都没印生产单号
    { key: 'productionNo', label: '生产单号', width: '10.5%', align: 'center' },
    // 通用版「物料编码」印我方**产品代码**（item_no，如 45#、客户料号）——2026-09-26 使用方指定，
    // 原取客户方编码 materialCode、空时回落客户图号，现役订单客户方编码全空，印出来的其实都是客户图号。
    // 耐斯克/精工两套客户版的「物料编码/产品编码」仍取客户方编码，不受影响
    { key: 'itemNo', label: '物料编码', width: '10.5%', align: 'center' },
    // 「物料名称」印**系统型号**（如 53#普通卡口滑轨）而不是订单里手填的产品名称：
    // 型号由货号+产品类型组合拼出，全厂一个口径，客户对账时也认这个号
    { key: 'productModel', label: '物料名称', width: '17.5%', pre: true, fallbackKeys: ['productName', 'productRequirement'] },
    // 料厚（2026-09-26 加，物料名称与规格之间）：外/中/内轨料厚不同时「/」并列，如 1.2/1.0
    { key: 'materialThickness', label: '料厚', width: '8%', align: 'center' },
    // 规格是「17寸」「425mm」这种短文本（2026-09-26 表头由「规格型号」改「规格」）
    { key: 'specText', label: '规格', width: '7%', align: 'center' },
    // 颜色列随全局「颜色」开关整列增减（§5.7）；印的是**表面处理**中文名，表面处理为空/「无」才回落颜色字段（服务端 colorTextOf）
    { key: 'color', label: '颜色', width: '7%', align: 'center', flag: 'colorEnabled' },
    // 有独立的「单位」列，故数量列表头就写「数量」、单元格也不再带单位后缀
    { key: 'unitLabel', label: '单位', width: '5.5%', align: 'center' },
    { key: 'qty', label: '数量', width: '7%', align: 'center' },
    { key: 'remark', label: '备注', width: '6.5%', pre: true },
  ],
  signatures: ['制单', '仓库', '提货人', '收货人签名'],
  minRows: 6,
};

export const DELIVERY_TEMPLATES: DeliveryTemplate[] = [
  {
    ...GENERIC_BASE,
    // code 保持 'generic' 不变：存量客户资料里绑的就是它，改编码会让绑定失效
    code: 'generic',
    name: '通用（四联）',
    description: '未指定客户专用版式时使用；白/红/黄/蓝四联',
    footerNote: FOOTER_NOTE_4,
  },
  {
    ...GENERIC_BASE,
    code: 'generic5',
    name: '通用（五联）',
    description: '与四联版式相同，底部多一联「第五联仓库（绿）」',
    footerNote: FOOTER_NOTE_5,
  },
  {
    code: 'nsk',
    name: '耐斯克-湖北',
    description: '客户专用，含物料编码和手填单价栏',
    // 该客户版印的是业务手机号（对方按这个号找人），不是公司总机
    contactLine: `${ADDRESS}  TEL：13802658930  ${FAX}`,
    showDocNoInTitle: true,
    metaStyle: 'classic',
    columns: [
      { key: 'seq', label: '序号', width: '4.5%', align: 'center' },
      { key: 'poNo', label: '采购单编号', width: '13.5%', align: 'center' },
      // 与精工版的「产品编码」是同一个字段，只是客户叫法不同；没录客户方编码时回退客户图号
      { key: 'materialCode', label: '物料编码', width: '13.5%', align: 'center', fallbackKeys: CODE_FALLBACK },
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
    description: '客户专用，按合同编号和产品编码出单',
    contactLine: `${ADDRESS}  TEL：0760-87972626 ${FAX}`,
    showDocNoInTitle: false,
    metaStyle: 'classic',
    columns: [
      { key: 'seq', label: '序号', width: '4.5%', align: 'center' },
      { key: 'poNo', label: '合同编号', width: '16%', align: 'center' },
      // 该客户版的「产品名称」是单行成品名，对应订单的「产品名称」
      { key: 'productName', label: '产品名称', width: '25%', pre: true, fallbackKeys: REQ_FALLBACK },
      // 与耐斯克版的「物料编码」是同一个字段，只是客户叫法不同；没录客户方编码时回退客户图号
      { key: 'materialCode', label: '产品编码', width: '13%', align: 'center', fallbackKeys: CODE_FALLBACK },
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
      customerDrawingNo: 'HB-53A-001',
      productName: '异型同步隐藏三节轨',
      productRequirement: '异型同步隐藏三节轨\nCS-81CN-17寸\n配全新2D全灰把手',
      productModel: '53#普通卡口滑轨',
      itemNo: '53#',
      specText: '17寸',
      materialThickness: '1.2/1.0',
      color: '黑色',
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
      customerDrawingNo: '',
      productName: '自闭装配式导轨~海宝~400X45~带卡包',
      productRequirement: '',
      productModel: '45#自锁滑轨',
      itemNo: '45#',
      specText: '400mm',
      materialThickness: '1.0',
      color: '白色',
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
      // 这一行故意不给客户方编码：预览时能直接看到编码列**回退到客户图号**的效果
      materialCode: '',
      customerDrawingNo: 'HB-45C-007',
      productName: '装配式导轨~星徽（海宝）~535X45',
      productRequirement: '',
      productModel: '45#缓冲滑轨',
      itemNo: '45#',
      specText: '535mm',
      materialThickness: '1.2',
      color: '',
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
