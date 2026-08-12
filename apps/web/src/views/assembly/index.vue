<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="load">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="订单号/客户/生产单号/产品型号/货号"
            style="width: 260px"
            @clear="load"
            @keyup.enter="load"
          />
        </el-form-item>
        <el-form-item label="装配车间">
          <el-select v-model="query.workshop" clearable placeholder="全部" style="width: 120px" @change="load">
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
            @change="load"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyUnfinished" @change="load">只看未装完</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyOverdue" @change="load">只看逾期</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="load">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
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
          <template #default="{ row }">
            {{ row.productModel || '—' }}
            <!-- 免装配：分体且单部件出货（如内轨）无装配环节，入库不受装配额度约束 -->
            <el-tag v-if="row.assemblyExempt" size="small" type="info" disable-transitions>免装配</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="规格" width="110" align="center">
          <template #default="{ row }">{{ row.dimensionText || '—' }}</template>
        </el-table-column>
        <el-table-column label="装配车间" width="100" align="center">
          <template #default="{ row }">{{ dictLabels(workshopDict, row.assemblyWorkshops) }}</template>
        </el-table-column>
        <el-table-column label="订单数(支)" prop="qtyPcs" width="100" align="center" />
        <el-table-column label="已完成(支)" width="100" align="center">
          <template #default="{ row }">
            <!-- 免装配行显示「—」而不是 0：0 会被读成「一支都没装」 -->
            <span v-if="row.assemblyExempt" class="num-na">—</span>
            <span v-else :class="{ 'num-ok': row.doneQty > 0 }">{{ row.doneQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="未装配(支)" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.assemblyExempt" class="num-na">—</span>
            <span v-else :class="pendingClass(row)">{{ row.pendingQty }}</span>
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
                :disabled="row.assemblyExempt"
                :title="row.assemblyExempt ? '分体单部件出货，无装配环节' : undefined"
                @click="openBatches(row)"
              >录装配</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <batch-dialog v-model="batchVisible" :order-product-id="batchProductId" @changed="load" />
  </div>
</template>

<script setup lang="ts">
import { onActivated, reactive, ref } from 'vue';
import { Search, Tools, InfoFilled } from '@element-plus/icons-vue';
import { getAssemblyList, type AssemblyGroupRow } from '@/api/assembly';
import { loadDict } from '@/composables/useDict';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';
import BatchDialog from './components/BatchDialog.vue';

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
load();
onActivated(load);

/* ===== 批次弹窗 ===== */
const batchVisible = ref(false);
const batchProductId = ref<number | null>(null);
function openBatches(row: AssemblyGroupRow) {
  batchProductId.value = row.orderProductId;
  batchVisible.value = true;
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
.tip-bar {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 10px;
  b { color: var(--el-text-color-primary); }
}
.pager { margin-top: 12px; }
.ml4 { margin-left: 4px; }
.num-ok { color: var(--el-color-success); font-weight: 600; }
.num-na { color: var(--el-text-color-placeholder); }
.num-pending { color: var(--el-color-warning); font-weight: 600; }
.num-over { color: var(--el-color-danger); font-weight: 600; }
.num-overdue { color: var(--el-color-danger); font-weight: 600; }
</style>
