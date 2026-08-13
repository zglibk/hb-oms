<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="load">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="订单号/PO#/客户/生产单号/货号"
            style="width: 240px"
            @clear="load"
            @keyup.enter="load"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 110px" @change="load">
            <el-option v-for="o in ORDER_STATUS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="订单日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 240px"
            @change="load"
          />
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="load">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'order:create'" type="primary" :icon="Plus" @click="openCreate">新增订单</el-button>
        <el-button
          size="small"
          v-permission="'order:export'"
          type="primary"
          plain
          :icon="Download"
          :loading="exporting"
          @click="onExportTotalPlan"
        >导出总计划</el-button>
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="id">
        <el-table-column type="expand" width="36" fixed="left">
          <template #default="{ row }">
            <div class="expand-wrap">
              <table class="expand-grid">
                <thead>
                  <tr>
                    <!-- 客户图号/产品要求描述可在「系统配置 → 业务字段」全局停用，th 与 td 必须同条件 -->
                    <th v-if="customerDrawingNoEnabled">客户图号</th>
                    <th>产品型号</th>
                    <th v-if="productRequirementEnabled">产品要求描述</th>
                    <th>规格</th>
                    <th>数量</th>
                    <th>支数</th>
                    <th>表面处理</th>
                    <th>图号/版本</th>
                    <th>料厚</th>
                    <th>交期</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="p in row.products" :key="p.id">
                    <tr v-for="(g, gi) in p.partGroups" :key="g.id">
                      <td v-if="customerDrawingNoEnabled && gi === 0" :rowspan="p.partGroups.length" class="eg-center">{{ p.customerDrawingNo || '—' }}</td>
                      <td>
                        {{ g.productModel || productLabel(p) }}
                        <!-- 分体出货：该行按部件组构成分体包装出货（不组装成整品），只在首组行标一次 -->
                        <el-tag v-if="p.isSplit && gi === 0" size="small" type="warning" disable-transitions>分体</el-tag>
                      </td>
                      <td v-if="productRequirementEnabled && gi === 0" :rowspan="p.partGroups.length">{{ p.productRequirement || '—' }}</td>
                      <td v-if="gi === 0" :rowspan="p.partGroups.length" class="eg-center">{{ dimensionText(p) }}</td>
                      <td v-if="gi === 0" :rowspan="p.partGroups.length" class="eg-center">{{ p.orderQty }} {{ unitLabel(p.unit) }}</td>
                      <td v-if="gi === 0" :rowspan="p.partGroups.length" class="eg-center">{{ p.qtyPcs }}</td>
                      <td v-if="gi === 0" :rowspan="p.partGroups.length" class="eg-center">{{ dictLabel(surfaceDict, p.surfaceType) }}</td>
                      <td>{{ g.drawingNo || '—' }}<template v-if="g.drawingVersion"> / {{ g.drawingVersion }}</template></td>
                      <td class="eg-center">{{ g.materialThickness || '—' }}</td>
                      <td v-if="gi === 0" :rowspan="p.partGroups.length" class="eg-center">{{ p.deliveryDate || '—' }}</td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="订单号" width="140" fixed="left">
          <template #default="{ row }">
            {{ row.orderNo }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="PO#" prop="poNo" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.poNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="生产单号" prop="productionNo" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productionNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="客户" prop="customerName" min-width="120" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="订单日期" prop="orderDate" width="105">
          <template #default="{ row }">{{ (row.orderDate || '').slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="产品数" width="70">
          <template #default="{ row }">{{ row.products.length }}</template>
        </el-table-column>
        <el-table-column label="总支数" width="90">
          <template #default="{ row }">{{ totalPcs(row) }}</template>
        </el-table-column>
        <el-table-column label="业务员" prop="salesman" width="85">
          <template #default="{ row }">{{ row.salesman || '—' }}</template>
        </el-table-column>
        <el-table-column label="跟单员" prop="merchandiser" width="85">
          <template #default="{ row }">{{ row.merchandiser || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="85">
          <template #default="{ row }">
            <el-tag size="small" :type="tagTypeOf(ORDER_STATUS, row.status)">{{ labelOf(ORDER_STATUS, row.status) }}</el-tag>
            <el-tag v-if="row.isOpening" size="small" type="info" style="margin-left: 4px">期初</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button
                size="small"
                v-permission.disable="'order:update'"
                link type="primary" class="btn-edit" :icon="Edit"
                :disabled="row.status === ORDER_STATUS_VALUE.CANCELLED"
                @click="openEdit(row)"
              >编辑</el-button>
              <!-- 生产任务单打印页（A4，可另存 PDF）；已作废订单不该再下发生产，禁用 -->
              <el-button
                size="small" v-permission.disable="'order:export'" link type="primary" :icon="Printer"
                :disabled="row.status === ORDER_STATUS_VALUE.CANCELLED"
                @click="router.push({ path: '/order/print', query: { id: row.id } })"
              >导出单据</el-button>
              <el-button
                v-if="row.status === ORDER_STATUS_VALUE.ACTIVE"
                size="small" v-permission.disable="'order:finish'" link type="success" :icon="CircleCheck"
                :loading="actingId === row.id" @click="onFinish(row)"
              >完结</el-button>
              <el-button
                v-else-if="row.status === ORDER_STATUS_VALUE.FINISHED"
                size="small" v-permission.disable="'order:finish'" link type="warning" :icon="RefreshLeft"
                :loading="actingId === row.id" @click="onReopen(row)"
              >重开</el-button>
              <!-- 删除取代作废：限制条件本就相同（被下游引用即禁止），留废记录无价值 -->
              <el-button
                size="small" v-permission.disable="'order:delete'" link type="danger" :icon="Delete"
                :loading="actingId === row.id" @click="onDelete(row)"
              >删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Search, CircleCheck, RefreshLeft, Download, Printer } from '@element-plus/icons-vue';
import {
  getOrderList,
  finishOrder,
  reopenOrder,
  deleteOrder,
  exportTotalPlan,
  type OrderItem,
  type OrderProductItem,
} from '@/api/order';
import {
  ORDER_STATUS,
  ORDER_STATUS_VALUE,
  UNIT_OPTIONS,
  formatProductModel,
  formatDimension,
  labelOf,
  tagTypeOf,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

/** 业务字段全局开关（系统配置 → 业务字段） */
const { customerDrawingNoEnabled, productRequirementEnabled } = useFeatureFlags();

const router = useRouter();
const loading = ref(false);
const list = ref<OrderItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 20, keyword: '', status: undefined as number | undefined });
const dateRange = ref<[string, string] | null>(null);

// assembly_workshop 字典不再需要——订单环节已不安排装配车间
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((sf: any[]) => {
  surfaceDict.value = sf.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

async function load() {
  loading.value = true;
  try {
    const res = await getOrderList({
      ...query,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
    });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}
load();
onActivated(load);

/* ===== 导出总计划 =====
 * 一行 = 一个产品行；四数走台账口径（后端复用 findLedger，不另写聚合）。
 * 导的是**当前筛选的全量**，不是当前这一页，故导出前把条数摆给用户确认。 */
const exporting = ref(false);
async function onExportTotalPlan() {
  if (!total.value) {
    ElMessage.warning('当前筛选无订单数据，无需导出');
    return;
  }
  await ElMessageBox.confirm(
    `将按当前筛选条件导出全部总计划到 Excel，共 <strong style="color:#f56c6c;">${total.value}</strong> 张订单，产品明细逐行展开。`,
    '导出确认',
    { type: 'info', dangerouslyUseHTMLString: true, confirmButtonText: '导出', cancelButtonText: '取消' },
  );
  exporting.value = true;
  try {
    const blob = await exportTotalPlan({
      keyword: query.keyword || undefined,
      status: query.status,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `总计划_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

function openCreate() {
  router.push({ name: 'OrderForm' });
}
function openEdit(row: OrderItem) {
  router.push({ name: 'OrderForm', query: { id: row.id } });
}

/* ===== 展示辅助 ===== */
const unitMap = computed(() => new Map(UNIT_OPTIONS.map((o: any) => [o.value, o.label])));
function unitLabel(v: string): string {
  return unitMap.value.get(v) ?? v;
}
// 模板中 ref 自动解包，直接收数组
function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
function productLabel(p: OrderProductItem): string {
  return formatProductModel(p.itemNo ?? '', p.productType, 'whole');
}
function dimensionText(p: OrderProductItem): string {
  if (p.dimensionMm == null) return '—';
  return formatDimension(p.dimensionRaw, p.dimensionUnit, p.dimensionMm);
}
function totalPcs(row: OrderItem): number {
  return row.products.reduce((s, p) => s + (p.qtyPcs || 0), 0);
}

/* ===== 状态操作 ===== */
const actingId = ref<number | null>(null);
async function act(row: OrderItem, fn: (id: number) => Promise<unknown>, tip: string) {
  actingId.value = row.id;
  try {
    await fn(row.id);
    ElMessage.success(tip);
    load();
  } finally {
    actingId.value = null;
  }
}
async function onFinish(row: OrderItem) {
  await ElMessageBox.confirm(
    `确定完结订单「${row.orderNo}」吗？完结是台账口径（不再跟踪），不锁单据，可重开。`,
    '完结订单',
    { type: 'warning' },
  );
  act(row, finishOrder, '已完结');
}
async function onReopen(row: OrderItem) {
  act(row, reopenOrder, '已重开');
}
async function onDelete(row: OrderItem) {
  await ElMessageBox.confirm(
    `确定删除订单「${row.orderNo}」吗？将连同产品行、部件组、部件明细一并删除，且**不可恢复**。` +
      '被外发/装配/出入库引用的订单无法删除。',
    '删除订单',
    { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  );
  act(row, deleteOrder, '已删除');
}
</script>

<script lang="ts">
export default { name: 'OrderList' };
</script>

<style scoped lang="scss">
.toolbar { margin-bottom: 12px; }
.pager { margin-top: 12px; }
.expand-wrap { padding: 8px 16px 8px 56px; }
.expand-grid {
  width: 100%; max-width: 1280px; border-collapse: collapse; font-size: 13px;
  th, td { border: 1px solid var(--el-border-color); padding: 5px 10px; text-align: left; }
  th { background: var(--el-fill-color-light); font-weight: 600; text-align: center; white-space: nowrap; }
  .eg-center { text-align: center; }
}
</style>
