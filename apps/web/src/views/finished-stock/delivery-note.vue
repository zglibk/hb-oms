<template>
  <main class="print-preview-page">
    <header class="preview-toolbar no-print">
      <el-button size="small" :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <div class="preview-toolbar__title">
        <strong>送货单</strong>
        <el-select v-model="templateCode" size="small" style="width: 140px" :disabled="loading || !note">
          <el-option v-for="t in DELIVERY_TEMPLATE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-tag v-if="note && note.status === FINISHED_DOC_STATUS_VALUE.DRAFT" size="small" type="info">
          单据尚未确认（草稿）
        </el-tag>
        <span>切换模板只影响本次打印，不改客户资料</span>
      </div>
      <div>
        <el-button size="small" :icon="Printer" :disabled="loading || !note" @click="onPrint">打印</el-button>
        <!-- 与列表入口同权限：直接输 URL 进来的无权用户不该看到可点的按钮
             （后端另有 finished-stock:print 守卫，这里只是别让人点了才 403） -->
        <el-button
          size="small" type="primary" :icon="Download" v-permission.disable="'finished-stock:print'"
          :loading="downloading" :disabled="loading || !note" @click="onDownloadPdf"
        >导出PDF</el-button>
      </div>
    </header>

    <section class="sheet-stage" v-loading="loading">
      <article v-if="note" class="print-sheet">
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
            <div class="doc-meta__item">
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

      <el-empty v-if="!loading && !note" :description="errorMsg || '未能加载送货单'" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Printer, Download } from '@element-plus/icons-vue';
import {
  getDeliveryNote,
  downloadDeliveryNotePdf,
  type DeliveryNote,
  type DeliveryNoteRow,
} from '@/api/finished-stock';
import { readBlobError } from '@/utils/download';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useFeatureStore } from '@/stores/feature';
import { COMPANY_FULL_NAME } from '@/constants/company';
import { FINISHED_DOC_STATUS_VALUE } from '@/constants/dict';
import {
  DELIVERY_TEMPLATE_OPTIONS,
  deliveryTemplateOf,
  type DeliveryColumn,
} from '@/constants/delivery-note';

/**
 * 《送货单》打印页（版式对照各客户现行纸质单，CLAUDE.md §5.6「送货单打印」）。
 *
 * 数据来自 GET /finished-stock/:id/delivery-note（一张**销售出库单**出一张送货单）；
 * 版式来自前端模板注册表 constants/delivery-note.ts——服务端不持有版式知识。
 * 「导出PDF」由服务端渲染本页出 PDF（同《生产任务单》做法）。
 *
 * ⚠️ 本页是**顶层路由、不在 Layout 下**（原因见 router/index.ts 注释），因此
 * §5.7 那条「业务字段开关由布局层统一拉取」在这里**不适用**：新标签页打开、
 * 以及服务端 PDF 渲染都是全新页面上下文，不自己拉一次就读不到「全局默认模板」。
 */

/** 全局默认模板（客户未单独绑定时用）；加载见 init() */
const { deliveryTemplateDefault } = useFeatureFlags();
const featureStore = useFeatureStore();

const route = useRoute();
const router = useRouter();
const id = Number(route.query.id);

const loading = ref(true);
const note = ref<DeliveryNote | null>(null);
const errorMsg = ref('');
const originalTitle = document.title;

/**
 * 当前模板编码。优先级：客户资料绑定 → 系统配置的全局默认 → 通用模板。
 * 页面上可临时切换，**不回写客户资料**（切换只影响这一次打印）。
 */
const templateCode = ref('');
const tpl = computed(() => deliveryTemplateOf(templateCode.value));

/** 日期：纸质单写成 2026/8/13（不补前导零） */
const dateText = computed(() => {
  const [y, m, d] = String(note.value?.docDate ?? '').slice(0, 10).split('-');
  return y && m && d ? `${y}/${Number(m)}/${Number(d)}` : '';
});

/* ===== 表格渲染：列取值、表头、合计 ===== */

/**
 * 数量列表头：全单单位一致时印「数量（套）」，混着套与支时退化成「数量」
 * ——单元格那时会各自带上单位后缀（见 cellOf），表头再写死一种单位就是错的。
 */
function headerOf(col: DeliveryColumn): string {
  if (col.key !== 'qty') return col.label;
  const unit = note.value?.unitLabel;
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
    return note.value?.unitConsistent ? String(row.qty) : `${row.qty}${row.unitLabel}`;
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

const blankRowCount = computed(() =>
  Math.max(0, tpl.value.minRows - (note.value?.rows.length ?? 0)),
);

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
  const totals = note.value?.totals ?? [];
  if (!totals.length) return '';
  if (note.value?.unitConsistent) return String(totals[0].qty);
  return totals.map((t) => `${t.qty}${t.unitLabel}`).join(' / ');
});

/**
 * 签名栏取值：系统内已知的人直接印出来，其余现场手签。
 * 「制单」= 开这张出库单的人；「业务」= 订单业务员；
 * 「发货人」「仓库收货人」系统里没有对应字段，留空。
 */
function signValue(label: string): string {
  if (label === '制单') return note.value?.creatorName ?? '';
  if (label === '业务') return note.value?.salesman ?? '';
  return '';
}

async function init() {
  if (!id) {
    goBack();
    return;
  }
  loading.value = true;
  try {
    const [res] = await Promise.all([
      getDeliveryNote(id),
      // 顶层路由没有 Layout 兜底，全局默认模板必须自己确保加载（见文件头注释）；
      // 已加载过则跳过，不重复请求
      featureStore.loaded ? Promise.resolve() : featureStore.load(),
    ]);
    note.value = res;
    templateCode.value = res.templateCode || deliveryTemplateDefault.value;
    // 打印/另存 PDF 的默认文件名取自 document.title
    document.title = `送货单-${res.deliveryNo || res.docNo}`;
  } catch (err: any) {
    // 非销售出库 / 已作废 / 跨客户等守卫的中文原因要显示出来，别只留一张空白页
    errorMsg.value = err?.response?.data?.message || err?.message || '未能加载送货单';
    ElMessage.error(errorMsg.value);
  } finally {
    loading.value = false;
  }
}
init();

// 开关是异步到达的：接口先回来时先用客户绑定值渲染，默认值到位后再补上（仅当客户没绑定）
watch(deliveryTemplateDefault, (v) => {
  if (note.value && !note.value.templateCode && !templateCode.value) templateCode.value = v;
});

function onPrint() {
  window.print();
}

const downloading = ref(false);
async function onDownloadPdf() {
  downloading.value = true;
  try {
    await downloadDeliveryNotePdf(id, `送货单-${note.value?.deliveryNo || note.value?.docNo}.pdf`);
  } catch (err) {
    ElMessage.error(await readBlobError(err));
  } finally {
    downloading.value = false;
  }
}

function goBack() {
  router.push('/finished-stock');
}

onBeforeUnmount(() => {
  document.title = originalTitle;
});
</script>

<script lang="ts">
export default { name: 'DeliveryNotePrint' };
</script>

<style scoped>
.print-preview-page {
  min-width: 100%;
  min-height: 100vh;
  background: #eef0f3;
  color: #111;
}

.preview-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  min-height: 56px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #dcdfe6;
}
.preview-toolbar > :last-child { justify-self: end; }
.preview-toolbar > :first-child { justify-self: start; }
.preview-toolbar__title { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
.preview-toolbar__title strong { font-size: 16px; }
.preview-toolbar__title span { color: #909399; font-size: 12px; }

.sheet-stage {
  box-sizing: border-box;
  min-height: calc(100vh - 57px);
  padding: 24px;
  overflow: auto;
}

/*
 * A4 纵向。flex 列布局 + 签名栏 margin-top:auto：内容不满一页时签名栏被推到页面底部
 * （对照纸质单）；行数多到跨页时签名栏自然跟在正文之后。
 *
 * ⚠️ **屏幕纸面必须与打印纸面等高，否则预览是骗人的**：297mm(A4) − 上下内边距 7mm×2
 * = 内容区 283mm，与打印时的 `min-height: 283mm`（padding 归 0、由 @page margin 接管）
 * 完全一致。改任一处都要同步另一处（生产任务单曾因两边不等，预览里的签名栏比实际低一行）。
 */
.print-sheet {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto 16px;
  padding: 7mm 5mm;
  background: #fff;
  box-shadow: 0 3px 18px rgb(0 0 0 / 14%);
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
.doc-meta__row { display: flex; align-items: flex-end; gap: 6mm; margin-bottom: 1.5mm; }
.doc-meta__item { display: flex; align-items: flex-end; gap: 2mm; }
.doc-meta__item--grow { flex: 1; }
.doc-meta__label { flex: none; font-weight: 700; }
/* 值区带下划线，形态与纸质单的填空格一致 */
.doc-meta__value {
  flex: 1;
  min-width: 30mm;
  border-bottom: 1px solid #333;
  padding: 0 1mm 0.5mm;
}
.doc-meta__value--sm { min-width: 24mm; }

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

/* ===== 打印 ===== */
@media print {
  :global(html),
  :global(body),
  :global(#app) {
    width: 210mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  /* 页边距与屏幕纸面的 padding 保持一致（见 .print-sheet 注释），
     打印机不可打印区通常 ≥5mm，再小会被截 */
  @page { size: A4 portrait; margin: 7mm 5mm; }

  .print-preview-page,
  .sheet-stage {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    background: #fff;
  }

  .no-print { display: none !important; }

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
