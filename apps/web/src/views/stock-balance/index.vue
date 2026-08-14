<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword" clearable style="width: 250px"
            placeholder="货号/型号/订单号/客户/生产单号"
            @input="scheduleKeywordSearch" @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="query.surfaceType" clearable placeholder="全部" style="width: 130px" @change="runKeywordSearch">
            <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="边别">
          <el-select v-model="query.side" clearable placeholder="全部" style="width: 100px" @change="runKeywordSearch">
            <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyInStock" @change="runKeywordSearch">只看有结存</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'stock-balance:import'" :icon="Upload" @click="importVisible = true">
          批量导入
        </el-button>
        <el-button
          size="small" v-permission="'stock-balance:export'" :icon="Download"
          :loading="exporting" @click="onExport"
        >导出到Excel</el-button>
        <span class="tip">
          <el-icon><InfoFilled /></el-icon>
          库存只由出入库单据的<b>确认</b>与<b>红字冲销</b>驱动，<b>不能直接修改</b>；结存按「产品 + 边别 + 批次」分行。
          「批量导入」搬的是<b>上线前的存量</b>，会生成一张<b>期初单</b>入账，同样有单可查、可红字冲销。
        </span>
        <span class="total">当前筛选结存合计 <b>{{ totalQty }}</b> 支</span>
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="id">
        <el-table-column label="货号" prop="itemNo" width="90" align="center">
          <template #default="{ row }">{{ row.itemNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="产品型号" prop="productModel" min-width="160" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="规格" width="110" align="center">
          <template #default="{ row }">{{ row.dimensionText || '—' }}</template>
        </el-table-column>
        <el-table-column label="表面处理" width="100" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ dictLabel(surfaceDict, row.surfaceType) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="colorEnabled" label="颜色" width="80" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.color" :seed="row.color">{{ row.color }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="边别" width="70" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="订单号" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.orderNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="生产单号" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productionNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="客户" prop="customerName" min-width="120" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.customerName || '—' }}</template>
        </el-table-column>
        <el-table-column label="批次" width="90" align="center">
          <template #default="{ row }">{{ row.batchNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="结存(支)" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <span :class="row.quantity > 0 ? 'num-ok' : 'num-zero'">{{ row.quantity }}</span>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <import-dialog
      v-model="importVisible"
      title="批量导入成品库存"
      tip="用于把上线前手工账上的成品库存搬进系统。导入会生成一张「期初单」并立即生效，由单据驱动库存——不是直接改库存数，录错可红字冲销。只能挂打开了「期初补录」开关的订单"
      confirm-text="即将导入文件「{n}」，系统会生成一张<b>期初单并立即生效</b>，相应产品的库存随之增加。<br/>同一份文件重复导入会<b>重复加库存</b>，请确认没有导过。"
      :download-template="downloadStockBalanceTemplate"
      :do-import="doImport"
      :summarize="summarizeImport"
      @done="reload"
    >
      <template #options>
        <div class="import-opt">
          <span class="import-opt__label">期初单日期</span>
          <el-date-picker v-model="importDocDate" type="date" value-format="YYYY-MM-DD" size="small" :clearable="false" style="width: 160px" />
          <el-input v-model="importRemark" size="small" placeholder="整单备注（选填）" style="width: 240px" />
        </div>
      </template>
    </import-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, InfoFilled, Upload, Download } from '@element-plus/icons-vue';
import {
  getStockBalance,
  downloadStockBalanceExport,
  downloadStockBalanceTemplate,
  importStockBalance,
  type BalanceRow,
} from '@/api/finished-stock';
import { SIDE_OPTIONS, sideLabel } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useExcelExport } from '@/composables/useExcelExport';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import ImportDialog from '@/components/ImportDialog.vue';
import ColorTag from '@/components/ColorTag.vue';

/** 「颜色」字段全局开关（系统配置 → 业务字段） */
const { colorEnabled } = useFeatureFlags();

const loading = ref(false);
const list = ref<BalanceRow[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  surfaceType: undefined as string | undefined,
  side: undefined as string | undefined,
  onlyInStock: true,
});

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

const totalQty = computed(() => list.value.reduce((s, r) => s + (r.quantity || 0), 0));

async function load() {
  loading.value = true;
  try {
    const res = await getStockBalance({ ...query });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}
function reload() {
  query.page = 1;
  load();
}
const { schedule: scheduleKeywordSearch, flush: runKeywordSearch } = useDebouncedSearch(reload);
load();
onActivated(load);

/* ===== 导出 ===== */
const { exporting, exportWithConfirm } = useExcelExport();

const onExport = () => exportWithConfirm({
  name: '库存',
  // 实查而不是用页面上的 total：筛选条件改了但没点「查询」时，页面上的数还是上一次的
  getCount: async () => (await getStockBalance({ ...query, page: 1, pageSize: 1 })).total,
  run: () => downloadStockBalanceExport({ ...query }),
});

/* ===== 批量导入（生成期初单，由单据驱动库存） ===== */
const importVisible = ref(false);
const importDocDate = ref(new Date().toISOString().slice(0, 10));
const importRemark = ref('');

const doImport = (file: File) =>
  importStockBalance(file, importDocDate.value, importRemark.value || undefined);

function summarizeImport(r: any): string {
  // 期初可能让某些订单交清而自动完结（§3.1），不提示的话用户会以为订单状态被人偷改了
  if (r?.finished?.length) {
    ElMessage.success(`订单 ${r.finished.join('、')} 已交清，自动完结`);
  }
  return `导入成功：已生成期初单 ${r?.docNo ?? ''}，${r?.total ?? 0} 行库存已入账`;
}

function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
</script>

<script lang="ts">
export default { name: 'StockBalance' };
</script>

<style scoped lang="scss">
.toolbar {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
  .tip {
    display: flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--el-text-color-secondary);
    b { color: var(--el-text-color-primary); }
  }
  .total { margin-left: auto; font-size: 12px; color: var(--el-text-color-secondary); }
  .total b { color: var(--el-color-primary); font-size: 14px; }
}
/* 导入弹窗的额外选项（期初单日期 + 整单备注） */
.import-opt {
  display: flex; align-items: center; gap: 8px;
  &__label { font-size: 13px; color: var(--el-text-color-regular); }
}
.pager { margin-top: 12px; }
.num-ok { color: var(--el-color-success); font-weight: 600; }
.num-zero { color: var(--el-text-color-placeholder); }
</style>
