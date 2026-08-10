<template>
  <main class="print-preview-page">
    <header class="preview-toolbar no-print">
      <el-button size="small" :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <div class="preview-toolbar__title">
        <strong>电镀发外加工单</strong>
        <span>实际打印尺寸 240mm × 150mm（四联单），共 {{ pages.length }} 页</span>
      </div>
      <el-button size="small" type="primary" :icon="Printer" :disabled="loading || !doc" @click="onPrint">
        打印
      </el-button>
    </header>

    <section class="sheet-stage" v-loading="loading">
      <!-- 每 11 行一页；多明细自动分页，每页重复表头与联次 -->
      <article v-for="(page, pi) in pages" :key="pi" class="print-sheet">
        <header class="document-header">
          <div class="document-heading">
            <h1>{{ companyName }}</h1>
            <h2>电镀发外加工单</h2>
          </div>
          <div class="document-no">
            <span>No.</span>
            <strong>{{ documentNo }}</strong>
          </div>
        </header>

        <div class="document-meta">
          <div>加工商：<span>{{ doc?.processorName || '' }}</span></div>
          <div class="surface-cell">
            表面处理：<span>{{ surfaceLabel }}</span>
          </div>
          <div class="document-date">
            日期：<span>{{ documentDate.year }}</span> 年
            <span>{{ documentDate.month }}</span> 月
            <span>{{ documentDate.day }}</span> 日
          </div>
        </div>

        <div class="document-body">
          <table class="work-order-table">
            <colgroup>
              <col class="col-production" />
              <col class="col-model" />
              <col class="col-color" />
              <col class="col-packaging" />
              <col class="col-weight" />
              <col class="col-unit-weight" />
              <col class="col-remark" />
            </colgroup>
            <thead>
              <tr>
                <th>生产单号</th>
                <th>型号/规格</th>
                <th>颜色</th>
                <th>包装<br />方式</th>
                <th>重量<br />（KG）</th>
                <th>单重</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in page" :key="index">
                <td>{{ row.productionNo }}</td>
                <td>{{ row.modelSpec }}</td>
                <td>{{ row.color }}</td>
                <td>{{ row.packaging }}</td>
                <td class="numeric-cell">{{ row.weightKg }}</td>
                <td class="numeric-cell">{{ row.unitWeight }}</td>
                <td>{{ row.remark }}</td>
              </tr>
            </tbody>
          </table>

          <aside class="copy-legend" aria-label="单据联次">
            <span>①计划（白）</span>
            <span>②财务（红）</span>
            <span>③加工商（黄）</span>
            <span>④存根（蓝）</span>
          </aside>
        </div>

        <footer class="document-signatures">
          <div>仓管：<span></span></div>
          <div>审核：<span></span></div>
          <div>加工商签收：<span></span></div>
        </footer>
      </article>

      <el-empty v-if="!loading && !doc" description="未能加载发坯单" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Printer } from '@element-plus/icons-vue';
import { getOutsourcePrintData, type OutsourceDocItem, type OutsourceItemRow } from '@/api/outsource';
import { loadDict } from '@/composables/useDict';

/**
 * 电镀发外加工单（移植自 hb-mes subcontract/SubcontractPrint.vue）。
 *
 * 纸张是 240mm × 150mm 的**四联单**，不是 A4——尺寸、列宽百分比、行高、
 * 联次竖排文字全部按原单照搬，换纸即可对齐，勿改成 A4。
 *
 * 与 MES 的两处差异（hb-oms 数据模型不同，非样式改动）：
 * 1. MES 单头第二格是「委托单号」（SC 采番）；hb-oms 的发坯单号本身就是唯一单号、
 *    已印在右上 No. 处，故该格改印**表面处理**——电镀/电泳/喷涂对加工商是关键信息。
 * 2. MES 一张单只有一个产品（1 行 + 10 空行）；hb-oms 发坯单是多明细，
 *    故按每页 11 行分页，不足补空行保持版式，超出自动续页。
 *
 * 2026-08-10 系统取消发出环节（发货不过磅、不留发出数量记录）后，
 * 「重量（KG）」与「单重」两列**刻意留空**，由发货人现场过磅手写。
 * 版式与列宽一律不动——这是交给加工商的对外单据，换纸即对齐，不随系统内简化而改。
 */

const ROWS_PER_PAGE = 11; // 表体 101mm − 表头 13mm，每行 8mm

/**
 * 单据抬头：**固定用公司全称，刻意不取系统配置的 companyName**。
 * 该配置是登录页/标题栏的品牌短名（「海宝五金」），而本单是要交给加工商的
 * 对外正式单据，抬头必须是营业执照全称；两者用途不同，绑在一起会互相牵制。
 * 公司更名时改此常量。
 */
const COMPANY_FULL_NAME = '中山市海宝精密五金有限公司';

interface PrintRow {
  productionNo: string;
  modelSpec: string;
  color: string;
  packaging: string;
  weightKg: string;
  unitWeight: string;
  remark: string;
}

const route = useRoute();
const router = useRouter();
const id = Number(route.query.id);

const loading = ref(true);
const doc = ref<OutsourceDocItem | null>(null);
const items = ref<OutsourceItemRow[]>([]);
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
const originalTitle = document.title;

const companyName = COMPANY_FULL_NAME;

/** 发坯单号本身就是 7 位定长纯数字，直接作为 No. */
const documentNo = computed(() => String(doc.value?.blankNo ?? '').trim());

const surfaceLabel = computed(() => {
  const v = doc.value?.surfaceType;
  if (!v) return '';
  return surfaceDict.value.find((o) => o.value === v)?.label ?? v;
});

/**
 * 单据日期取**建单日期**。原先取实际/计划发外日期，两者已随发出环节删除；
 * 建单日期在实务上就是发货当天，且重复打印结果稳定不变。
 */
const documentDate = computed(() => {
  const date = doc.value?.createdAt || '';
  const [year = '', month = '', day = ''] = String(date).slice(0, 10).split('-');
  return { year, month, day };
});

const emptyRow: PrintRow = {
  productionNo: '', modelSpec: '', color: '', packaging: '',
  weightKg: '', unitWeight: '', remark: '',
};

/** 明细 → 打印行，再按每页 11 行切页并补空行 */
const pages = computed<PrintRow[][]>(() => {
  if (!doc.value) return [];
  const color = doc.value.color || '';
  const rows: PrintRow[] = items.value.map((it) => ({
    productionNo: it.productionNo || '',
    modelSpec: [it.productModel, it.dimensionText].filter(Boolean).join(' / '),
    color,
    // hb-oms 无包装方式字段，留空供手写
    packaging: '',
    // 发出环节已取消，系统内不再有发出重量/单重：两列留空供现场过磅手写
    weightKg: '',
    unitWeight: '',
    remark: it.remark || '',
  }));
  const total = Math.max(Math.ceil(rows.length / ROWS_PER_PAGE), 1);
  return Array.from({ length: total }, (_, p) => {
    const slice = rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    return [
      ...slice,
      ...Array.from({ length: ROWS_PER_PAGE - slice.length }, () => ({ ...emptyRow })),
    ];
  });
});

async function init() {
  if (!id) {
    goBack();
    return;
  }
  document.title = '电镀发外加工单预览';
  loading.value = true;
  try {
    const [res, dict] = await Promise.all([getOutsourcePrintData(id), loadDict('surface_type')]);
    doc.value = res;
    items.value = res.items ?? [];
    surfaceDict.value = (dict as any[]).map((r) => ({ label: r.dictLabel, value: r.dictValue }));
  } finally {
    loading.value = false;
  }
}
init();

function onPrint() {
  window.print();
}
function goBack() {
  router.push('/outsource');
}

onBeforeUnmount(() => {
  document.title = originalTitle;
});
</script>

<script lang="ts">
export default { name: 'OutsourcePrint' };
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

.preview-toolbar__title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  white-space: nowrap;
}

.preview-toolbar__title strong { font-size: 16px; }
.preview-toolbar__title span { color: #909399; font-size: 12px; }

.sheet-stage {
  box-sizing: border-box;
  min-height: calc(100vh - 57px);
  padding: 24px;
  overflow: auto;
}

.print-sheet {
  box-sizing: border-box;
  width: 240mm;
  height: 150mm;
  margin: 0 auto 16px;
  padding: 5mm 9mm 4mm 12mm;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 3px 18px rgb(0 0 0 / 14%);
  color: #111;
  font-family: SimSun, 'Songti SC', serif;
}

.document-header {
  position: relative;
  height: 18mm;
}

.document-heading { text-align: center; }

.document-heading h1,
.document-heading h2 {
  margin: 0;
  letter-spacing: 0;
  font-weight: 700;
  line-height: 1.15;
}

.document-heading h1 { font-size: 6mm; }
.document-heading h2 { margin-top: 1mm; font-size: 6.2mm; }

.document-no {
  position: absolute;
  right: 3mm;
  bottom: 1mm;
  display: grid;
  grid-template-columns: 10mm 27mm;
  align-items: baseline;
  width: 37mm;
  font-family: 'Times New Roman', SimSun, serif;
  font-size: 4.6mm;
  white-space: nowrap;
}

.document-no strong {
  color: #d26a67;
  font-family: Arial, sans-serif;
  font-size: 5.4mm;
  font-weight: 500;
  letter-spacing: 0;
}

.document-meta {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: 4mm;
  box-sizing: border-box;
  height: 9mm;
  padding: 0 4mm 0 3mm;
  font-size: 4.2mm;
  font-weight: 700;
}

.document-meta span {
  display: inline-block;
  min-width: 24mm;
  padding: 0 1mm;
  text-align: center;
  font-weight: 400;
}

.document-meta .document-date span {
  box-sizing: border-box;
  width: 4mm;
  min-width: 4mm;
  max-width: 4mm;
  padding: 0;
  overflow: hidden;
}

.document-meta .document-date span:first-of-type {
  width: 9mm;
  min-width: 9mm;
  max-width: 9mm;
}

.surface-cell span { min-width: 30mm; }

.document-body {
  display: flex;
  height: 101.25mm;
}

.work-order-table {
  width: calc(100% - 8mm);
  height: 101mm;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 3.8mm;
}

.work-order-table th,
.work-order-table td {
  box-sizing: border-box;
  height: 8mm;
  padding: 0.7mm 1mm;
  overflow: hidden;
  border: 0.3mm solid #222;
  vertical-align: middle;
  text-align: center;
  line-height: 1.05;
  overflow-wrap: anywhere;
}

.work-order-table th {
  height: 13mm;
  font-size: 4mm;
  font-weight: 700;
}

.work-order-table tbody tr { height: 8mm; }

.work-order-table .numeric-cell {
  font-family: Arial, sans-serif;
  font-variant-numeric: tabular-nums;
}

.col-production { width: 23.7%; }
.col-model { width: 29.7%; }
.col-color { width: 10.5%; }
.col-packaging { width: 6.7%; }
.col-weight { width: 8.9%; }
.col-unit-weight { width: 9.9%; }
.col-remark { width: 10.6%; }

.copy-legend {
  display: grid;
  grid-template-rows: repeat(4, 1fr);
  box-sizing: border-box;
  width: 8mm;
  height: 101.25mm;
  border: 0;
  font-family: DengXian, 'Microsoft YaHei', sans-serif;
  font-size: 3.2mm;
  font-weight: 400;
}

.copy-legend span {
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: vertical-rl;
  white-space: nowrap;
}

.document-signatures {
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr;
  align-items: end;
  box-sizing: border-box;
  height: 10mm;
  padding: 0 10mm 0 2mm;
  font-size: 4mm;
  font-weight: 700;
}

.document-signatures div:nth-child(2),
.document-signatures div:nth-child(3) { justify-self: start; }

.document-signatures span {
  display: inline-block;
  min-width: 24mm;
  font-weight: 400;
}

@page {
  size: 240mm 150mm;
  margin: 0;
}

@media (max-width: 760px) {
  .preview-toolbar {
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    padding: 0 12px;
  }
  .preview-toolbar__title { justify-content: center; }
  .preview-toolbar__title span { display: none; }
  .sheet-stage { padding: 12px; }
  .print-sheet { margin: 0 0 12px; }
}

@media print {
  :global(html),
  :global(body),
  :global(#app) {
    width: 240mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  .print-preview-page,
  .sheet-stage {
    width: 240mm;
    min-height: 0;
    margin: 0;
    padding: 0;
    background: #fff;
  }

  .no-print { display: none !important; }

  .print-sheet {
    margin: 0;
    box-shadow: none;
    print-color-adjust: exact;
    /* 多明细续页：每张单独占一页，最后一张不留空白页 */
    page-break-after: always;
    break-after: page;
  }

  .print-sheet:last-child {
    page-break-after: auto;
    break-after: auto;
  }
}
</style>
