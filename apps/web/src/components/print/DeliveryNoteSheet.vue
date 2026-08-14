<template>
  <article class="print-sheet">
    <!-- ==================== 抬头 ==================== -->
    <header class="doc-heading">
      <div class="doc-heading__main">
        <h1>{{ COMPANY_FULL_NAME }}</h1>
        <h2>产品送货单</h2>
      </div>
      <!-- 耐斯克版在标题右上角另印一次单号，精工版没有这一栏（版式差异见模板注册表） -->
      <div v-if="tpl.showDocNoInTitle" class="doc-heading__no">送货单编号：{{ note.deliveryNo }}</div>
      <p class="doc-contact">{{ tpl.contactLine }}</p>
    </header>

    <!-- ==================== 客户信息 ==================== -->
    <div class="doc-meta">
      <div class="doc-meta__row">
        <div class="doc-meta__item doc-meta__item--grow">
          <span class="doc-meta__label">客户</span>
          <span class="doc-meta__value">{{ note.customerName || '' }}</span>
        </div>
        <div class="doc-meta__item doc-meta__item--wide">
          <span class="doc-meta__label">电话：</span>
          <span class="doc-meta__value doc-meta__value--sm">{{ note.customerPhone }}</span>
        </div>
      </div>
      <div class="doc-meta__row">
        <div class="doc-meta__item doc-meta__item--grow">
          <span class="doc-meta__label">地址</span>
          <span class="doc-meta__value">{{ note.customerAddress }}</span>
        </div>
        <div class="doc-meta__item">
          <span class="doc-meta__label">日期：</span>
          <span class="doc-meta__value doc-meta__value--sm">{{ dateText }}</span>
        </div>
        <div class="doc-meta__item">
          <span class="doc-meta__label">NO:</span>
          <span class="doc-meta__value doc-meta__value--sm">{{ note.deliveryNo }}</span>
        </div>
      </div>
    </div>

    <!-- ==================== 明细表（列集合由模板决定） ==================== -->
    <table class="note-table">
      <colgroup>
        <col v-for="(c, i) in tpl.columns" :key="`col${i}`" :style="{ width: c.width }" />
      </colgroup>
      <thead>
        <tr>
          <th v-for="(c, i) in tpl.columns" :key="`th${i}`">{{ headerOf(c) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in note.rows" :key="r.seq">
          <td v-for="(c, i) in tpl.columns" :key="`td${i}`" :class="cellClass(c)">{{ cellOf(r, c) }}</td>
        </tr>
        <!-- 补空行到模板要求的最少行数：纸质单版式固定，货少时也不该缩成半张表 -->
        <tr v-for="n in blankRowCount" :key="`blank${n}`">
          <td v-for="(c, i) in tpl.columns" :key="`bt${i}`" :class="cellClass(c)">
            {{ c.key === 'seq' ? note.rows.length + n : '' }}
          </td>
        </tr>
        <tr class="total-row">
          <td :colspan="totalLabelSpan" class="c"><b>合计</b></td>
          <td class="c"><b>{{ totalText }}</b></td>
          <!-- 合计行右侧：单头备注（车间在这里写「共19托」这类装箱信息） -->
          <td v-if="totalRestSpan > 0" :colspan="totalRestSpan" class="pre">{{ note.remark }}</td>
        </tr>
      </tbody>
    </table>

    <!-- ==================== 签名栏 ==================== -->
    <footer class="doc-signatures">
      <div v-for="(s, i) in tpl.signatures" :key="`sign${i}`">
        {{ s }}：<span class="sign-value">{{ signValue(s) }}</span>
      </div>
    </footer>
    <div class="doc-footer-note">{{ tpl.footerNote }}</div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DeliveryNote, DeliveryNoteRow } from '@/api/finished-stock';
import { COMPANY_FULL_NAME } from '@/constants/company';
import { deliveryTemplateOf, type DeliveryColumn } from '@/constants/delivery-note';

/**
 * 《送货单》A4 纸面（CLAUDE.md §5.6「送货单打印」）。
 *
 * **打印页与「系统管理 → 打印模板」预览页共用这一个组件**——两处各写一份渲染，
 * 迟早出现「预览好好的、打出来不是那样」。组件只管把 `note` 按 `templateCode`
 * 指定的版式画出来，不取数、不管工具栏、不管打印动作。
 *
 * 三条尺寸纪律与《生产任务单》一致，**改一处要同步另一处**：
 *   1. 字体栈必须带 Linux 中文回落——服务端 PDF 由无头 Chrome 渲染，
 *      那台机器没有 SimSun，缺回落项整张单据的中文会变成豆腐块（线上实测踩过）；
 *   2. 屏幕纸面与打印纸面等高（297mm − 上下 7mm = 283mm），否则预览是骗人的；
 *   3. 类名 `.print-sheet` 是服务端 PdfService 判断「渲染完成」的选择器，不能改名。
 */
const props = defineProps<{
  note: DeliveryNote;
  /** 模板编码；取不到时 deliveryTemplateOf 回落通用模板 */
  templateCode: string;
}>();

const tpl = computed(() => deliveryTemplateOf(props.templateCode));

/** 日期：纸质单写成 2026/8/13（不补前导零） */
const dateText = computed(() => {
  const [y, m, d] = String(props.note.docDate ?? '').slice(0, 10).split('-');
  return y && m && d ? `${y}/${Number(m)}/${Number(d)}` : '';
});

/**
 * 数量列表头：全单单位一致时印「数量（套）」，混着套与支时退化成「数量」
 * ——单元格那时会各自带上单位后缀（见 cellOf），表头再写死一种单位就是错的。
 */
function headerOf(col: DeliveryColumn): string {
  if (col.key !== 'qty') return col.label;
  const unit = props.note.unitLabel;
  return unit ? col.label.replace('{unit}', unit) : '数量';
}

function cellClass(col: DeliveryColumn) {
  return { c: col.align === 'center', pre: !!col.pre };
}

function cellOf(row: DeliveryNoteRow, col: DeliveryColumn): string {
  if (col.key === 'seq') return String(row.seq);
  // 单价等系统内无对应字段的列：留白供手填
  if (col.key === 'blank') return '';
  if (col.key === 'qty') {
    return props.note.unitConsistent ? String(row.qty) : `${row.qty}${row.unitLabel}`;
  }
  const pick = (k: keyof DeliveryNoteRow) => String(row[k] ?? '').trim();
  let v = pick(col.key as keyof DeliveryNoteRow);
  // 品名列的回落链：主字段没录不留空格，依次退到备选字段（见模板注册表）
  if (!v && col.fallbackKeys) {
    for (const k of col.fallbackKeys) {
      v = pick(k);
      if (v) break;
    }
  }
  return v;
}

const blankRowCount = computed(() => Math.max(0, tpl.value.minRows - props.note.rows.length));

/** 数量列位置：合计行按它拆成「合计 | 合计数 | 备注」三格 */
const qtyIndex = computed(() => {
  const i = tpl.value.columns.findIndex((c) => c.key === 'qty');
  // 模板没定义数量列时退到最后一列，至少不会让 colspan 算成负数
  return i >= 0 ? i : tpl.value.columns.length - 1;
});
const totalLabelSpan = computed(() => Math.max(1, qtyIndex.value));
const totalRestSpan = computed(() => tpl.value.columns.length - qtyIndex.value - 1);

/**
 * 合计文本：全单单位一致时只有一个数；混着套与支时**分别合计并列**
 * （如 `100套 / 50支`）——把两种单位加成一个数是错的。
 */
const totalText = computed(() => {
  const totals = props.note.totals ?? [];
  if (!totals.length) return '';
  if (props.note.unitConsistent) return String(totals[0].qty);
  return totals.map((t) => `${t.qty}${t.unitLabel}`).join(' / ');
});

/**
 * 签名栏取值：系统内已知的人直接印出来，其余现场手签。
 * 「制单」= 开这张出库单的人；「业务」= 订单业务员；
 * 「发货人」「仓库收货人」系统里没有对应字段，留空。
 */
function signValue(label: string): string {
  if (label === '制单') return props.note.creatorName ?? '';
  if (label === '业务') return props.note.salesman ?? '';
  return '';
}
</script>

<style scoped>
/*
 * A4 纵向。flex 列布局 + 签名栏 margin-top:auto：内容不满一页时签名栏被推到页面底部
 * （对照纸质单）；行数多到跨页时签名栏自然跟在正文之后。
 *
 * ⚠️ **屏幕纸面必须与打印纸面等高，否则预览是骗人的**：297mm(A4) − 上下内边距 7mm×2
 * = 内容区 283mm，与下面 @media print 里的 `min-height: 283mm`（padding 归 0、
 * 由 @page margin 接管）完全一致。改任一处都要同步另一处。
 */
.print-sheet {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 7mm 5mm;
  background: #fff;
  color: #111;
  /*
   * 字体栈必须**跨平台**：前段是 Windows/macOS 的宋体（用户在浏览器里打印时用），
   * 后段是 Linux 的中文字体——服务端 PDF 由无头 Chrome 渲染，那台机器上没有 SimSun，
   * 缺了 Linux 回落项会让**整张单据的中文全变成豆腐块**（生产任务单已实测踩过）。
   */
  font-family: SimSun, 'Songti SC', 'Noto Serif CJK SC', 'Noto Sans CJK SC',
    'WenQuanYi Zen Hei', 'Microsoft YaHei', serif;
  font-size: 12px;
  line-height: 1.5;
}

/* ===== 抬头 ===== */
.doc-heading { position: relative; text-align: center; }
.doc-heading__main h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 1px; }
.doc-heading__main h2 { margin: 1.5mm 0 0; font-size: 17px; font-weight: 700; letter-spacing: 6px; }
/* 标题右上角的单号（仅部分客户版式有） */
.doc-heading__no { position: absolute; top: 0; right: 0; font-size: 12px; }
.doc-contact { margin: 2mm 0 0; font-size: 11px; }

/* ===== 客户信息 ===== */
.doc-meta { margin-top: 3mm; }
.doc-meta__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36mm 34mm;
  align-items: end;
  column-gap: 5mm;
  margin-bottom: 1.5mm;
}
.doc-meta__item {
  display: grid;
  grid-template-columns: 10mm minmax(0, 1fr);
  align-items: end;
  column-gap: 2mm;
  min-width: 0;
}
.doc-meta__item--grow {
  grid-column: 1;
  grid-template-columns: 8mm minmax(0, 1fr);
}
/* 电话占满右侧两列；下一行再由日期与 NO 各占一列，左侧值区因此上下等宽。 */
.doc-meta__item--wide { grid-column: 2 / -1; }
.doc-meta__label {
  font-weight: 700;
  white-space: nowrap;
  text-align: right;
}
/* 值区带下划线，形态与纸质单的填空格一致 */
.doc-meta__value {
  display: block;
  min-width: 0;
  border-bottom: 1px solid #333;
  padding: 0 1mm 0.5mm;
}

/* ===== 明细表 ===== */
.note-table {
  width: 100%;
  margin-top: 2.5mm;
  border-collapse: collapse;
  table-layout: fixed;
}
.note-table th,
.note-table td {
  height: 9mm;
  border: 1px solid #333;
  padding: 1.2mm 1.5mm;
  vertical-align: middle;
  word-break: break-all;
}
.note-table th { font-weight: 700; text-align: center; }
.note-table .c { text-align: center; }
/* 品名/备注是多行文本，保留换行 */
.note-table .pre { white-space: pre-wrap; }
.total-row td { font-size: 13px; }

/* ===== 签名栏（margin-top:auto 把它顶到页面底部，见 .print-sheet 的 flex 说明） ===== */
.doc-signatures {
  display: flex;
  justify-content: space-around;
  gap: 10mm;
  margin-top: auto;
  padding-top: 10mm;
  break-inside: avoid;
}
.sign-value {
  display: inline-block;
  min-width: 24mm;
  border-bottom: 1px solid #333;
  text-align: center;
}

.doc-footer-note {
  margin-top: 3mm;
  text-align: center;
  font-size: 11px;
  letter-spacing: 1px;
}

/* ===== 打印：纸面自身的打印态（页面容器与 @page 由调用方管） ===== */
@media print {
  .print-sheet {
    width: auto;
    /*
     * 撑满一页让签名栏贴底：A4 297mm − 上下页边距 7mm×2 = 283mm 可用高度，
     * 与屏幕纸面的内容区严格相等。别往上加——设成正好等于可用高度时，
     * 任何一点渲染舍入都会溢出成第二页空白（生产任务单已实测）。
     */
    min-height: 283mm;
    margin: 0;
    padding: 0;
    box-shadow: none;
    print-color-adjust: exact;
  }

  .note-table tr { break-inside: avoid; }
}
</style>
