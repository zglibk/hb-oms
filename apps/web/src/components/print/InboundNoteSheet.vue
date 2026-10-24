<template>
  <article class="print-sheet" data-print-sheet :style="sheetStyle">
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
    <table class="note-table" data-print-detail-table>
      <colgroup>
        <col v-for="c in cols" :key="`col${c.key}`" :style="{ width: c.width }" />
      </colgroup>
      <thead data-print-table-head>
        <tr>
          <th v-for="c in cols" :key="`th${c.key}`">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in note.rows" :key="r.seq" data-print-detail-row>
          <td v-for="c in cols" :key="`td${c.key}`" :class="{ c: c.align === 'center' }">
            {{ cellOf(r, c) }}
          </td>
        </tr>
        <!-- 补空行到 10 行（对齐纸质模板）：货少时版式也不该缩成半张表 -->
        <tr v-if="measurement" data-print-row-probe aria-hidden="true">
          <td v-for="c in cols" :key="`probe${c.key}`">{{ c.key === 'seq' ? '1' : '' }}</td>
        </tr>
        <tr v-for="n in blankRowCount" :key="`blank${n}`">
          <td v-for="c in cols" :key="`bt${c.key}`" :class="{ c: c.align === 'center' }">
            {{ c.key === 'seq' ? note.rows.length + n : '' }}
          </td>
        </tr>
      </tbody>
    </table>

    <!-- ==================== 签名栏 ==================== -->
    <footer class="doc-signatures" data-print-signatures>
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
import type { PrintProfileConfig } from '@/api/print-config';
import { printPaperBodyOf } from '@/utils/print-paper';

/**
 * 《成品入库单》动态纸面（AGENTS.md §5.6「入库单打印」）。正式打印由运行时纸型控制，默认 A4 纵向；无纸型参数时保留旧 A5 横向兜底。
 *
 * 车间原本手工填这张 Excel 交仓库收货（主管/质检/制单三方签字），现由**生产入库单**
 * 一键出单。组件只管把 `note` 画出来，不取数、不管工具栏、不管打印动作。
 *
 * **列集合直接写在这里、不进模板注册表**：入库单是内部单据，只有一套版式、没有
 * 客户级模板绑定；纸型及其全局默认由打印纸型档案管理，套用《送货单》那套 `DELIVERY_TEMPLATES` 只是空转。
 * 日后真出现第二套版式时，再照 constants/delivery-note.ts 的模式抽注册表。
 *
 * 三条尺寸纪律与《送货单》《生产任务单》一致，**改一处要同步另外两处**：
 *   1. 字体栈必须带 Linux 中文回落——服务端 PDF 由无头 Chrome 渲染，
 *      那台机器没有 SimSun，缺回落项整张单的中文会变成豆腐块（线上实测踩过）；
 *   2. 屏幕纸面与打印纸面等高，否则预览是骗人的；
 *   3. 类名 `.print-sheet` 是服务端 PdfService 判断「渲染完成」的选择器，不能改名。
 */
const props = defineProps<{
  note: InboundNote;
  profileConfig?: PrintProfileConfig;
  measurement?: boolean;
}>();
const sheetStyle = computed(() => {
  const c = props.profileConfig;
  if (!c) return {};
  const body = printPaperBodyOf(c.paper);
  return {
    '--paper-width': `${body.widthMm}mm`, '--paper-height': `${body.heightMm}mm`,
    '--page-offset-x': `${body.offsetXmm}mm`, '--page-offset-y': `${body.offsetYmm}mm`,
    '--margin-top': `${c.margins.top}mm`, '--margin-right': `${c.margins.right}mm`,
    '--margin-bottom': `${c.margins.bottom}mm`, '--margin-left': `${c.margins.left}mm`,
    '--offset-x': `${c.offset.x}mm`, '--offset-y': `${c.offset.y}mm`,
    '--font-scale': String(c.style.fontScale / 100), '--border-width': `${c.style.borderWidthPt}pt`,
  };
});

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
 * 10 列（2026-10-24 使用方删除「类别」列，并把「颜色」改名「表面处理」）。
 * 「表面处理」仍沿用服务端 colorTextOf 的单值口径：优先印表面处理中文名，未填或为「无」
 * 时回落颜色；该列继续受 §5.7 颜色开关控制。
 *
 * 列宽合计 100%。删除类别后把空间优先让给产品名称、表面处理与存放位置：产品名称 29%，
 * 表面处理 8%，存放位置 11.8%。A5 只有 128mm 可用高度，任一格频繁折行都会把 10 行明细
 * 挤出纸面——再调整列宽前仍需按纸面实际字体实测。
 */
const COLUMNS: InboundColumn[] = [
  { key: 'seq', label: '序号', width: '4.9%', align: 'center' },
  { key: 'productionNo', label: '生产单号', width: '10.1%', align: 'center' },
  { key: 'itemNo', label: '产品代码', width: '10.3%', align: 'center' },
  { key: 'productName', label: '产品名称', width: '29%', align: 'center' },
  { key: 'specText', label: '规格', width: '6.7%', align: 'center' },
  { key: 'materialThickness', label: '料厚', width: '7.6%', align: 'center' },
  { key: 'color', label: '表面处理', width: '8%', align: 'center', flag: 'colorEnabled' },
  // 有独立「单位」列，故数量列表头只写「数量」、单元格也不带单位后缀
  { key: 'unitLabel', label: '单位', width: '4.9%', align: 'center' },
  { key: 'qty', label: '数量', width: '6.7%', align: 'center' },
  { key: 'remark', label: '存放位置', width: '11.8%' },
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

const blankRowCount = computed(() => props.profileConfig?.pagination.strategy === 'auto'
  ? 0
  : Math.max(0, (props.profileConfig?.pagination.rowsPerPage ?? MIN_ROWS) - props.note.rows.length));

function signValue(label: string): string {
  return label === '制单' ? (props.note.creatorName ?? '') : '';
}
</script>

<style scoped>
/*
 * 纸型尺寸、内边距、偏移与缩放来自已发布配置；入库单默认 A4 纵向，
 * 241.3×140mm 驱动进纸 / 218×140mm 去孔成品纸面连续纸及 A5 横向仍可切换。
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
  position: relative;
  width: var(--paper-width, 210mm);
  height: var(--paper-height, 148mm);
  min-height: var(--paper-height, 148mm);
  margin: 0 auto 12mm;
  padding: var(--margin-top, 10mm) var(--margin-right, 5mm) var(--margin-bottom, 10mm) var(--margin-left, 5mm);
  overflow: hidden;
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
  font-size: calc(12px * var(--font-scale, 1));
  line-height: 1.4;
}
.print-sheet > * { position: relative; left: var(--offset-x, 0); top: var(--offset-y, 0); }

/* ===== 抬头 ===== */
.doc-heading { text-align: center; }
.doc-heading h1 {
  margin: 0;
  font-size: calc(22px * var(--font-scale, 1));
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
  border: var(--border-width, 1px) solid #333;
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
  border-bottom: var(--border-width, 1px) solid #333;
  text-align: center;
}

/* ===== 打印：纸面自身的打印态（页面容器与 @page 由调用方管） ===== */
@media print {
  .print-sheet {
    width: var(--paper-width, 210mm);
    /* 见 .print-sheet 顶部说明：128mm 可用高度留 1mm 余量 */
    height: var(--paper-height, 148mm);
    min-height: var(--paper-height, 148mm);
    /* 水平 auto 居中：纸张与纸型一致时等同左偏移 page-offset-x，换了纸也不会贴左 */
    margin: var(--page-offset-y, 0) auto 0;
    padding: var(--margin-top, 10mm) var(--margin-right, 5mm) var(--margin-bottom, 10mm) var(--margin-left, 5mm);
    box-shadow: none;
    print-color-adjust: exact;
    break-after: page;
  }

  /* 明细超过 10 行时自然跨页；单行不许被劈开，表头由浏览器在次页自动重复 */
  .note-table tr { break-inside: avoid; }
}
</style>
