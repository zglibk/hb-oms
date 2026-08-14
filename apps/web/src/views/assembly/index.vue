<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="订单号/客户/生产单号/产品型号/货号"
            style="width: 260px"
            @input="scheduleKeywordSearch"
            @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="装配车间">
          <el-select v-model="query.workshop" clearable placeholder="全部" style="width: 120px" @change="runKeywordSearch">
            <el-option v-for="o in workshopDict" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="交期">
          <el-date-picker
            v-model="deliveryRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 240px"
            @change="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyUnfinished" @change="runKeywordSearch">只看未装完</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyOverdue" @change="runKeywordSearch">只看逾期</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button
          size="small"
          v-permission="'assembly:export'"
          type="primary"
          plain
          :icon="Download"
          :loading="exporting"
          @click="onExport"
        >导出到Excel</el-button>
      </div>
      <div class="tip-bar">
        <el-icon><InfoFilled /></el-icon>
        装配按<b>产品</b>跟踪（装出来的是整套滑轨），一个产品可分多批录入；填了「实际完成时间」即视为该批完成，其数量计入成品入库的可入库量。
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="orderProductId">
        <el-table-column label="订单编号" width="130" fixed="left" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.productionNo || row.orderNo || '—' }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="客户" prop="customerName" min-width="120" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="产品型号" min-width="150" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productModel || '—' }}</template>
        </el-table-column>
        <el-table-column label="规格" width="110" align="center">
          <template #default="{ row }">{{ row.dimensionText || '—' }}</template>
        </el-table-column>
        <el-table-column label="装配车间" width="100" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.assemblyWorkshops?.length" :seed="row.assemblyWorkshops.join(',')">
              {{ dictLabels(workshopDict, row.assemblyWorkshops) }}
            </color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="订单数(支)" prop="qtyPcs" width="100" align="center" />
        <el-table-column label="已完成(支)" width="100" align="center">
          <template #default="{ row }">
            <span :class="{ 'num-ok': row.doneQty > 0 }">{{ row.doneQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="未装配(支)" width="100" align="center">
          <template #default="{ row }">
            <span :class="pendingClass(row)">{{ row.pendingQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="批次" width="70" align="center">
          <template #default="{ row }">{{ row.batchCount }}</template>
        </el-table-column>
        <el-table-column label="待完成计划日" width="120" align="center">
          <template #default="{ row }">
            <span :class="{ 'num-overdue': row.overdue }">{{ dateText(row.nextPlanDate) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="交期" width="105" align="center">
          <template #default="{ row }">{{ dateText(row.deliveryDate) }}</template>
        </el-table-column>
        <el-table-column label="装配进度" width="130" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="progressTag(row).type">{{ progressTag(row).label }}</el-tag>
            <el-tag v-if="row.overdue" size="small" type="danger" class="ml4">逾期</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right" align="center">
          <template #default="{ row }">
            <app-actions>
              <el-button
                size="small" v-permission.disable="'assembly:create'" link type="primary" :icon="Tools"
                @click="openBatches(row)"
              >录装配</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Search, Tools, InfoFilled, Download } from '@element-plus/icons-vue';
import { getAssemblyList, downloadAssemblyExport, type AssemblyGroupRow } from '@/api/assembly';
import { loadDict } from '@/composables/useDict';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import { useExcelExport } from '@/composables/useExcelExport';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';
import ColorTag from '@/components/ColorTag.vue';

const loading = ref(false);
const list = ref<AssemblyGroupRow[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  workshop: undefined as string | undefined,
  onlyUnfinished: false,
  onlyOverdue: false,
});
const deliveryRange = ref<[string, string] | null>(null);

const workshopDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('assembly_workshop').then((rows: any[]) => {
  workshopDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

async function load() {
  loading.value = true;
  try {
    const res = await getAssemblyList({
      ...query,
      deliveryFrom: deliveryRange.value?.[0],
      deliveryTo: deliveryRange.value?.[1],
    });
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

/* ===== 导出（预检 → 确认 → 下载，统一走 useExcelExport） ===== */
const { exporting, exportWithConfirm } = useExcelExport();
/** 导出参数与列表查询一致（不含分页），预检条数每次按当前筛选实查 */
function exportParams() {
  return {
    keyword: query.keyword,
    workshop: query.workshop,
    onlyUnfinished: query.onlyUnfinished,
    onlyOverdue: query.onlyOverdue,
    deliveryFrom: deliveryRange.value?.[0],
    deliveryTo: deliveryRange.value?.[1],
  };
}
function onExport() {
  return exportWithConfirm({
    name: '装配',
    getCount: async () => (await getAssemblyList({ ...exportParams(), page: 1, pageSize: 1 })).total,
    run: () => downloadAssemblyExport(exportParams()),
  });
}

/* ===== 装配批次子页面（原弹窗，2026-08-13 改版）；返回本页时 onActivated 自动刷新 ===== */
const router = useRouter();
function openBatches(row: AssemblyGroupRow) {
  router.push({ name: 'AssemblyBatches', query: { orderProductId: row.orderProductId } });
}

/* ===== 展示辅助 ===== */
/** 多值字典展示：数组逐个转中文标签后并列（无值显示 —） */
function dictLabels(opts: Array<{ label: string; value: string }>, vs: string[] | null | undefined): string {
  if (!vs?.length) return '—';
  return vs.map((v) => opts.find((o) => o.value === v)?.label ?? v).join('/');
}
function dateText(v: string | null): string {
  return v ? String(v).slice(0, 10) : '—';
}
function pendingClass(row: AssemblyGroupRow) {
  if (row.pendingQty < 0) return 'num-over';
  if (row.pendingQty === 0) return 'num-ok';
  return 'num-pending';
}
/** 产品级装配进度：未开始 / 装配中 / 已装完（超装配单独标注） */
function progressTag(row: AssemblyGroupRow): { label: string; type: string } {
  if (row.doneQty <= 0) return { label: '未开始', type: 'info' };
  if (row.pendingQty > 0) return { label: `装配中 ${row.doneQty}/${row.qtyPcs}`, type: 'warning' };
  if (row.pendingQty < 0) return { label: '已装完(超)', type: 'success' };
  return { label: '已装完', type: 'success' };
}
</script>

<script lang="ts">
export default { name: 'AssemblyList' };
</script>

<style scoped lang="scss">
.toolbar { margin-bottom: 12px; }
.tip-bar {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 10px;
  b { color: var(--el-text-color-primary); }
}
.pager { margin-top: 12px; }
.ml4 { margin-left: 4px; }
.num-ok { color: var(--el-color-success); font-weight: 600; }
.num-pending { color: var(--el-color-warning); font-weight: 600; }
.num-over { color: var(--el-color-danger); font-weight: 600; }
.num-overdue { color: var(--el-color-danger); font-weight: 600; }
</style>
