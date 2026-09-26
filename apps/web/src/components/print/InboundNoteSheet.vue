<template>
  <article class="print-sheet">
    <!-- ==================== 抬头 ==================== -->
    <header class="doc-heading">
      <h1>
        <span>{{ COMPANY_FULL_NAME }}成品</span>
        <span class="doc-heading__kind">入库单</span>
      </h1>
    </header>
    <div class="doc-divider"></div>

    <!-- ==================== 单头：车间 / 入库日期 / 入库单号 ==================== -->
    <div class="doc-meta">
      <div class="doc-meta__item">
        <span class="doc-meta__label">车间：</span>
        <span class="doc-meta__value">{{ note.workshopLabel }}</span>
      </div>
      <!-- 入库日期 = 单据日期（2026-09-25 使用方要求，放在车间与单号之间） -->
      <div class="doc-meta__item">
        <span class="doc-meta__label">入库日期：</span>
        <span class="doc-meta__value">{{ note.docDate }}</span>
      </div>
      <div class="doc-meta__item">
        <!-- 内部凭证，直接印系统单号（FGI260814-0001），不像送货单那样派生日期形态 -->
        <span class="doc-meta__label">入库单号：NO:</span>
        <span class="doc-meta__value">{{ note.docNo }}</span>
      </div>
    </div>

    <!-- ==================== 明细表 ==================== -->
    <table class="note-table">
      <colgroup>
        <col v-for="c in cols" :key="`col${c.key}`" :style="{ width: c.width }" />
      </colgroup>
      <thead>
        <tr>
          <th v-for="c in cols" :key="`th${c.key}`">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in note.rows" :key="r.seq">
          <td v-for="c in cols" :key="`td${c.key}`" :class="{ c: c.align === 'center' }">
            {{ cellOf(r, c) }}
          </td>
        </tr>
        <!-- 补空行到 10 行（对齐纸质模板）：货少时版式也不该缩成半张表 -->
        <tr v-for="n in blankRowCount" :key="`blank${n}`">
          <td v-for="c in cols" :key="`bt${c.key}`" :class="{ c: c.align === 'center' }">
            {{ c.key === 'seq' ? note.rows.length + n : '' }}
          </td>
        </tr>
      </tbody>
    </table>

    <!-- ==================== 签名栏 ==================== -->
    <footer class="doc-signatures">
      <div v-for="s in SIGNATURES" :key="s">
        {{ s }}：<span class="sign-value">{{ signValue(s) }}</span>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { InboundNote, InboundNoteRow } from '@/api/finished-stock';
import { COMPANY_FULL_NAME } from '@/constants/company';
import { useFeatureFlags } from '@/composables/useFeatureFlags';

/**
 * 《成品入库单》A5 横向纸面（CLAUDE.md §5.6「入库单打印」）。
 *
 * 车间原本手工填这张 Excel 交仓库收货（主管/质检/制单三方签字），现由**生产入库单**
 * 一键出单。组件只管把 `note` 画出来，不取数、不管工具栏、不管打印动作。
 *
 * **列集合直接写在这里、不进模板注册表**：入库单是内部单据，只有一套版式、没有
 * 客户级绑定、也没有全局默认可设，套用《送货单》那套 `DELIVERY_TEMPLATES` 只是空转。
 * 日后真出现第二套版式时，再照 constants/delivery-note.ts 的模式抽注册表。
 *
 * 三条尺寸纪律与《送货单》《生产任务单》一致，**改一处要同步另外两处**：
 *   1. 字体栈必须带 Linux 中文回落——服务端 PDF 由无头 Chrome 渲染，
 *      那台机器没有 SimSun，缺回落项整张单的中文会变成豆腐块（线上实测踩过）；
 *   2. 屏幕纸面与打印纸面等高，否则预览是骗人的；
 *   3. 类名 `.print-sheet` 是服务端 PdfService 判断「渲染完成」的选择器，不能改名。
 */
const props = defineProps<{ note: InboundNote }>();

interface InboundColumn {
  /** 取值字段；`seq` 为序号列 */
  key: keyof InboundNoteRow | 'seq';
  label: string;
  /** 列宽百分比：按纸质模板的 Excel 字符宽（总计 99.875）归一化而来 */
  width: string;
  align?: 'center';
  /** 受哪个业务字段开关控制——停用时整列不印（§5.7） */
  flag?: 'colorEnabled';
}

/**
 * 10 列（2026-09-25 按使用方新版纸质单改）：
 * - 「产品代码」印**货号**（原「产品名称」列印产品型号）；
 * - 「规格型号」改名「规格」；
 * - 「类别」印**滑轨宽度 + 产品类型中文**（如 45#普通、45#自锁；服务端 categoryTextOf 提取宽度）。
 *   不印订单产品名称——那是手填自由文本（如「45#普通1.0料」），口径不一；
 * - 「类别」与「颜色」之间新增「料厚」（各部件组料厚按组序去重、「/」并列）；
 * - 「备注」改名「存放位置」（取值仍是明细备注——仓管在那里写库位）。
 * 「颜色」格印表面处理中文名（服务端 colorTextOf），仍受 §5.7 颜色开关控制。
 *
 * 列宽合计 100%（含颜色列），按真实数据量过：货号常见 14 个字符（如 DS3832A-22Z-DM，
 * 订单里约 37% 的货号超过 9 个字符），「产品代码」给 14.5% 保证一行放下；类别（宽度+类型，
 * 如「45#普通自锁缓冲」）给 17%；规格最长「1100mm」、数量最多 6 位，都收窄到 8.5%。
 * A5 只有 128mm 可用高度，任一格频繁折行都会把 10 行明细挤出纸面——改宽度前先量。
 */
/*
 * 11 列（2026-09-25 在产品代码与规格之间加「产品名称」）。A5 横向表格宽 200mm。
 * 列宽是在浏览器里**用纸面实际字体逐列实测**「真实最长内容单行显示所需宽度」后分配的
 * （凭字号估算会偏窄：首版估算让「平滑漆」每行折成两行，整张单溢出成两页）：
 *   单行所需 序号4.7 生产单号9.8(GLI46246-A) 产品代码13.2(DS3832A-22Z-DM) 产品名称15(45#普通无锁力分体)
 *   规格6.4(1100mm) 类别10.2(45#普通缓冲) 料厚7.3(1.0/1.2) 颜色6.1(平滑漆) 单位4.7 数量6.4(110880)
 *   存放位置8.6，合计 92.4%。产品名称 2026-09-25 起补「滑轨」后缀（withRailSuffix），常见最长
 *   「45#普通无锁力分体滑轨」11 个字需约 18.2%，余量几乎全给了它；其余列只比单行所需多 0.2~0.3%，
 *   **再加列或放宽任一列都必须先实测**。
 * 2026-09-25 使用方嫌产品代码列过宽，重新实测后调整：产品代码 13.5% → 10.3%（11 个半角字符如
 * SM4500CM37E 需 10.1%，覆盖「45#」与最常见的 10 位客户料号；12 位以上的长料号折两行，单元格本就 break-all）、
 * 存放位置 10.2% → 8.9%（现场手写栏，表头需 7.7%），省下的全给产品名称 → 23%（「45#普通外中轨无锁力（分体）」需 22.8%）。
 * ⚠️ A5 只有 128mm 可用高度，任一列变窄导致逐行折行都会把 10 行明细挤出一页——改宽度前先实测。
 */
const COLUMNS: InboundColumn[] = [
  { key: 'seq', label: '序号', width: '4.9%', align: 'center' },
  { key: 'productionNo', label: '生产单号', width: '10.1%', align: 'center' },
  { key: 'itemNo', label: '产品代码', width: '10.3%', align: 'center' },
  { key: 'productName', label: '产品名称', width: '23%', align: 'center' },
  { key: 'specText', label: '规格', width: '6.7%', align: 'center' },
  { key: 'categoryText', label: '类别', width: '10.5%', align: 'center' },
  { key: 'materialThickness', label: '料厚', width: '7.6%', align: 'center' },
  { key: 'color', label: '颜色', width: '6.4%', align: 'center', flag: 'colorEnabled' },
  // 有独立「单位」列，故数量列表头只写「数量」、单元格也不带单位后缀
  { key: 'unitLabel', label: '单位', width: '4.9%', align: 'center' },
  { key: 'qty', label: '数量', width: '6.7%', align: 'center' },
  { key: 'remark', label: '存放位置', width: '8.9%' },
];

/**
 * 签名栏（2026-09-25 调整）：制单在最左、审核在最右（原「主管」改名「审核」并挪到原制单位置），
 * 质检居中。制单由系统填，质检与审核现场手签（系统里没有对应字段）。
 */
const SIGNATURES = ['制单', '质检', '审核'];

/** 明细区最少行数：对齐纸质模板的 10 行 */
const MIN_ROWS = 10;

/**
 * 实际要印的列：剔除被业务字段开关停用的（§5.7——停用的字段在录入框/表格列/导出列
 * 一并消失，打印列同理）。
 * ⚠️ 打印页是顶层路由、没有 Layout 兜底，开关由页面自己 `featureStore.load()`；
 * 服务端渲染 PDF 时走的也是那条路径，所以这里读到的值与页面一致。
 */
const { colorEnabled } = useFeatureFlags();
const cols = computed(() =>
  COLUMNS.filter((c) => !c.flag || (c.flag === 'colorEnabled' && colorEnabled.value)),
);

function cellOf(row: InboundNoteRow, col: InboundColumn): string {
  if (col.key === 'seq') return String(row.seq);
  return String(row[col.key] ?? '').trim();
}

const blankRowCount = computed(() => Math.max(0, MIN_ROWS - props.note.rows.length));

function signValue(label: string): string {
  return label === '制单' ? (props.note.creatorName ?? '') : '';
}
</script>

<style scoped>
/*
 * A5 横向（210×148mm，对齐纸质模板的 paperSize=11 + landscape）。
 * flex 列布局 + 签名栏 margin-top:auto：内容不满一页时签名栏被推到页面底部。
 *
 * ⚠️ **屏幕纸面必须与打印纸面等高，否则预览是骗人的**：148mm − 上下内边距 10mm×2
 * = 内容区 128mm；下面 @media print 里取 127mm（padding 归 0、由 @page margin 接管），
 * 刻意少 1mm——设成正好等于可用高度时，任何一点渲染舍入都会溢出成第二页空白
 * （《生产任务单》已实测踩过）。改任一处都要同步另一处。
 */
.print-sheet {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 210mm;
  min-height: 148mm;
  margin: 0 auto;
  padding: 10mm 5mm;
  background: #fff;
  color: #111;
  /*
   * 字体栈必须**跨平台**：前段是 Windows/macOS 的宋体（用户在浏览器里打印时用），
   * 后段是 Linux 的中文字体——服务端 PDF 由无头 Chrome 渲染，那台机器上没有 SimSun，
   * 缺了 Linux 回落项会让**整张单据的中文全变成豆腐块**。
   */
  font-family: SimSun, 'Songti SC', 'Noto Serif CJK SC', 'Noto Sans CJK SC',
    'WenQuanYi Zen Hei', 'Microsoft YaHei', serif;
  /*
   * 12px/1.4 而不是更舒展的 13px/1.5：A5 纵向只有 128mm 可用高度，要塞下
   * 标题 + 单头 + 表头 + **10 行明细** + 签名栏。实测 13px/1.5 时全空行就已顶到
   * 128mm 边界，任何一格文字折行都会溢出成第二页空白纸（本次实测踩过）。
   * 现在全空行约 120mm，留 8mm 给折行的行。**别把字号或行高再调大**。
   */
  font-size: 12px;
  line-height: 1.4;
}

/* ===== 抬头 ===== */
.doc-heading { text-align: center; }
.doc-heading h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 1px;
}
/* 模板里「入库单」与公司名之间空开一段，用间距表达而不是塞空格 */
.doc-heading__kind { margin-left: 6mm; letter-spacing: 3px; }

/* 模板 A3:I3 的那条下边框（标题与单头之间的分隔线） */
.doc-divider {
  height: 3mm;
  border-bottom: 1px solid #333;
}

/* ===== 单头：车间 / 入库日期 / 入库单号（单号起点仍对齐模板的第 6 列 ~66.6%，日期居中段） ===== */
.doc-meta {
  display: grid;
  grid-template-columns: 36% 30.6% minmax(0, 1fr);
  align-items: end;
  margin-top: 2.5mm;
}
.doc-meta__item {
  display: flex;
  align-items: baseline;
  min-width: 0;
}
.doc-meta__label { white-space: nowrap; }
/*
 * 值区不画下划线：这些是系统直接印出来的值，不是留给人手写的填空格
 * （与《送货单》抬头信息栏 2026-08-14 的口径一致）。
 */
.doc-meta__value {
  min-width: 0;
  padding: 0 1mm;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 明细表 ===== */
.note-table {
  width: 100%;
  margin-top: 1.5mm;
  border-collapse: collapse;
  table-layout: fixed;
}
/* 行高对齐模板的 24pt(≈8.47mm)；表头略矮，省下的高度留给可能折行的明细行 */
.note-table th,
.note-table td {
  height: 8mm;
  border: 1px solid #333;
  padding: 0.6mm 1.2mm;
  vertical-align: middle;
  word-break: break-all;
}
.note-table th { height: 7.5mm; font-weight: 700; text-align: center; }
.note-table .c { text-align: center; }

/* ===== 签名栏（margin-top:auto 把它顶到页面底部，见 .print-sheet 的 flex 说明） ===== */
.doc-signatures {
  display: flex;
  justify-content: space-around;
  gap: 8mm;
  margin-top: auto;
  padding-top: 2mm;
  break-inside: avoid;
}
.sign-value {
  display: inline-block;
  min-width: 22mm;
  border-bottom: 1px solid #333;
  text-align: center;
}

/* ===== 打印：纸面自身的打印态（页面容器与 @page 由调用方管） ===== */
@media print {
  .print-sheet {
    width: auto;
    /* 见 .print-sheet 顶部说明：128mm 可用高度留 1mm 余量 */
    min-height: 127mm;
    margin: 0;
    padding: 0;
    box-shadow: none;
    print-color-adjust: exact;
  }

  /* 明细超过 10 行时自然跨页；单行不许被劈开，表头由浏览器在次页自动重复 */
  .note-table tr { break-inside: avoid; }
}
</style>
