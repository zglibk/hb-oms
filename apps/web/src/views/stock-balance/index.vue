<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="reload">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword" clearable style="width: 250px"
            placeholder="货号/型号/订单号/客户/生产单号"
            @clear="reload" @keyup.enter="reload"
          />
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="query.surfaceType" clearable placeholder="全部" style="width: 130px" @change="reload">
            <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="边别">
          <el-select v-model="query.side" clearable placeholder="全部" style="width: 100px" @change="reload">
            <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyInStock" @change="reload">只看有结存</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="reload">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="tip-bar">
        <el-icon><InfoFilled /></el-icon>
        库存只由出入库单据的<b>确认</b>与<b>红字冲销</b>驱动，不能直接修改；结存按「产品 + 边别 + 批次」分行。
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
          <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
        </el-table-column>
        <el-table-column v-if="colorEnabled" label="颜色" width="80" align="center">
          <template #default="{ row }">{{ row.color || '—' }}</template>
        </el-table-column>
        <el-table-column label="边别" width="70" align="center">
          <template #default="{ row }">{{ sideLabel(row.side) || '—' }}</template>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, reactive, ref } from 'vue';
import { Search, InfoFilled } from '@element-plus/icons-vue';
import { getStockBalance, type BalanceRow } from '@/api/finished-stock';
import { SIDE_OPTIONS, sideLabel } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';

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
load();
onActivated(load);

function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
</script>

<script lang="ts">
export default { name: 'StockBalance' };
</script>

<style scoped lang="scss">
.tip-bar {
  display: flex; align-items: center; gap: 6px; margin-bottom: 10px;
  font-size: 12px; color: var(--el-text-color-secondary);
  b { color: var(--el-text-color-primary); }
  .total { margin-left: auto; }
  .total b { color: var(--el-color-primary); font-size: 14px; }
}
.pager { margin-top: 12px; }
.num-ok { color: var(--el-color-success); font-weight: 600; }
.num-zero { color: var(--el-text-color-placeholder); }
</style>
