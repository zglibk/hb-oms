<template>
  <div class="print-page" v-loading="loading">
    <div class="no-print toolbar">
      <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
      <el-button size="small" type="primary" :icon="Printer" @click="onPrint">打印</el-button>
      <span class="tip">打印纸张请选择 A4 纵向；如需省纸可在浏览器打印设置中关闭页眉页脚</span>
    </div>

    <div v-if="doc" class="sheet">
      <h1 class="sheet-title">发坯单</h1>
      <div class="sheet-no">{{ formatBlankNo(doc.blankNo) }}</div>

      <table class="head-grid">
        <tbody>
          <tr>
            <th>加工商</th>
            <td colspan="3">{{ doc.processorName }}</td>
            <th>表面处理</th>
            <td>{{ surfaceLabel }}</td>
          </tr>
          <tr>
            <th>颜色</th>
            <td>{{ doc.color || '—' }}</td>
            <th>计划发外日期</th>
            <td>{{ dateText(doc.planSendDate) }}</td>
            <th>要求回货日期</th>
            <td>{{ dateText(doc.requireBackDate) }}</td>
          </tr>
          <tr>
            <th>实际发外日期</th>
            <td>{{ dateText(doc.actualSendDate) }}</td>
            <th>制单人</th>
            <td>{{ doc.creatorName || '—' }}</td>
            <th>制单日期</th>
            <td>{{ dateText(doc.createdAt) }}</td>
          </tr>
          <tr v-if="doc.remark">
            <th>备注</th>
            <td colspan="5" class="cell-left">{{ doc.remark }}</td>
          </tr>
        </tbody>
      </table>

      <table class="item-grid">
        <thead>
          <tr>
            <th style="width: 36px">序</th>
            <th style="width: 110px">生产单号</th>
            <th>产品型号</th>
            <th style="width: 80px">规格</th>
            <th style="width: 90px">周期码</th>
            <th style="width: 90px">发出重量<br />(kg)</th>
            <th style="width: 80px">单重<br />(kg/支)</th>
            <th style="width: 80px">发出数量<br />(支)</th>
            <th style="width: 110px">备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(it, i) in items" :key="it.id">
            <td class="c">{{ i + 1 }}</td>
            <td class="c">{{ it.productionNo || '—' }}</td>
            <td class="cell-left">{{ it.productModel || '—' }}</td>
            <td class="c">{{ it.dimensionText || '—' }}</td>
            <td class="c">{{ it.cycleCode || '—' }}</td>
            <td class="c">{{ Number(it.sendWeight) }}</td>
            <td class="c">{{ Number(it.unitWeight) }}</td>
            <td class="c">{{ it.sendQty }}</td>
            <td class="cell-left">{{ it.remark || '' }}</td>
          </tr>
          <tr class="total-row">
            <td class="c" colspan="5">合计</td>
            <td class="c">{{ doc.totalSendWeight ?? 0 }}</td>
            <td class="c">—</td>
            <td class="c">{{ doc.totalSendQty ?? 0 }}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div class="sign-bar">
        <span>发出人：____________</span>
        <span>接收人（加工商）：____________</span>
        <span>日期：________年____月____日</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Back, Printer } from '@element-plus/icons-vue';
import { getOutsourcePrintData, type OutsourceDocItem, type OutsourceItemRow } from '@/api/outsource';
import { formatBlankNo } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';

const route = useRoute();
const router = useRouter();
const id = Number(route.query.id);

const loading = ref(false);
const doc = ref<(OutsourceDocItem & { totalSendQty?: number; totalSendWeight?: number }) | null>(null);
const items = ref<OutsourceItemRow[]>([]);
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);

const surfaceLabel = computed(() => {
  const v = doc.value?.surfaceType;
  if (!v) return '—';
  return surfaceDict.value.find((o) => o.value === v)?.label ?? v;
});

async function init() {
  if (!id) {
    goBack();
    return;
  }
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

function dateText(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : '—';
}
function onPrint() {
  window.print();
}
function goBack() {
  router.push('/outsource');
}
</script>

<script lang="ts">
export default { name: 'OutsourcePrint' };
</script>

<style scoped lang="scss">
.print-page { padding: 12px; }
.toolbar {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
  .tip { color: var(--el-text-color-secondary); font-size: 12px; }
}
.sheet {
  width: 190mm; margin: 0 auto; padding: 8mm 6mm;
  background: #fff; color: #000;
  box-shadow: 0 0 0 1px var(--el-border-color-lighter);
}
.sheet-title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 6px; margin: 0 0 4px; }
.sheet-no { text-align: right; font-size: 13px; font-family: Consolas, monospace; margin-bottom: 8px; }

.head-grid, .item-grid {
  width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px;
  th, td { border: 1px solid #000; padding: 4px 6px; }
  th { background: #f2f2f2; font-weight: 600; text-align: center; white-space: nowrap; }
  td { text-align: center; }
  .cell-left { text-align: left; }
  .c { text-align: center; }
}
.item-grid {
  thead { display: table-header-group; }
  .total-row { font-weight: 700; background: #fafafa; }
}
.sign-bar {
  display: flex; justify-content: space-between; font-size: 12px; margin-top: 24px; padding: 0 4px;
}

@media print {
  .no-print { display: none !important; }
  .print-page { padding: 0; }
  .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; }
  .item-grid tr { page-break-inside: avoid; }
}
</style>

<style lang="scss">
/* 打印时隐藏后台外壳（侧栏/头部/标签栏），只留单据本体 */
@media print {
  .app-aside, .app-header, .tags-view, .el-menu, .breadcrumb { display: none !important; }
  .el-main { padding: 0 !important; overflow: visible !important; }
  body { background: #fff !important; }
}
</style>
