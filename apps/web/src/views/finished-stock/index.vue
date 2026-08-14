<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword" clearable style="width: 230px"
            placeholder="单号/订单号/客户/生产单号/型号"
            @input="scheduleKeywordSearch" @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="业务类型">
          <el-select v-model="query.bizType" clearable placeholder="全部" style="width: 130px" @change="runKeywordSearch">
            <el-option v-for="o in FINISHED_BIZ_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 110px" @change="runKeywordSearch">
            <el-option v-for="o in FINISHED_DOC_STATUS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="单据日期">
          <el-date-picker
            v-model="dateRange" type="daterange" value-format="YYYY-MM-DD"
            start-placeholder="开始" end-placeholder="结束" style="width: 230px" @change="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'finished-stock:create'" type="primary" :icon="Download" @click="openCreate('inbound')">
          成品入库
        </el-button>
        <el-button size="small" v-permission="'finished-stock:create'" type="warning" :icon="Upload" @click="openCreate('sale_outbound')">
          销售出库
        </el-button>
        <el-dropdown
          v-permission="'finished-stock:export'"
          trigger="click"
          :disabled="exporting"
          @command="onExport"
        >
          <el-button size="small" plain :icon="Document" :loading="exporting">
            导出记录<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="combined">合并到一个工作表</el-dropdown-item>
              <el-dropdown-item command="split">按方向分为“入库记录 / 出库记录”</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span class="tip">
          入库受<b>装配闸门</b>约束：可入库量 = 已完成装配 − 已入库；已确认单据只能红字冲销，不能修改。
        </span>
      </div>

      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="id">
        <el-table-column type="expand" width="36" fixed="left">
          <template #default="{ row }">
            <div class="expand-wrap">
              <table class="expand-grid">
                <thead>
                  <!-- 原生 table 里加可选列时，<th> 与 <td> 必须挂同一个条件，否则整表错位 -->
                  <tr>
                    <th>订单号</th><th>生产单号</th><th>产品型号</th><th>规格</th>
                    <th>表面处理</th><th v-if="colorEnabled">颜色</th>
                    <th>边别</th><th>数量(支)</th><th>已冲销</th><th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="it in row.items" :key="it.id">
                    <td>{{ it.orderNo || '—' }}</td>
                    <td>{{ it.productionNo || '—' }}</td>
                    <td>{{ it.productModel || '—' }}</td>
                    <td class="c">{{ it.dimensionText || '—' }}</td>
                    <td class="c">{{ surfaceLabel(it.surfaceType) }}</td>
                    <td v-if="colorEnabled" class="c">{{ it.color || '—' }}</td>
                    <td class="c">{{ sideLabel(it.side) || '—' }}</td>
                    <td class="c">{{ it.quantity }}</td>
                    <td class="c">{{ it.reversedQty ?? '—' }}</td>
                    <td>{{ it.remark || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="单号" width="140" fixed="left">
          <template #default="{ row }">
            {{ row.docNo }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <!-- 生产单号取自明细快照：一张单可以跨多张订单，故去重后并列（明细见展开行） -->
        <el-table-column label="生产单号" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ productionNos(row) }}</template>
        </el-table-column>
        <el-table-column label="业务类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="row.bizType === FINISHED_BIZ_TYPE.SALE_OUTBOUND
                ? 'danger'
                : tagTypeOf(FINISHED_BIZ_TYPE_OPTIONS, row.bizType)"
            >
              {{ labelOf(FINISHED_BIZ_TYPE_OPTIONS, row.bizType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="70" align="center">
          <template #default="{ row }">
            <span :class="row.direction === STOCK_DIRECTION_VALUE.IN ? 'dir-in' : 'dir-out'">
              {{ row.direction === STOCK_DIRECTION_VALUE.IN ? '入库' : '出库' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="单据日期" width="105" align="center">
          <template #default="{ row }">{{ dateText(row.docDate) }}</template>
        </el-table-column>
        <el-table-column label="明细" width="60" align="center">
          <template #default="{ row }">{{ row.itemCount ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="数量(支)" width="90" align="center">
          <template #default="{ row }">{{ row.totalQty ?? 0 }}</template>
        </el-table-column>
        <!-- 展示名 2026-08-13 由「班组/机台」改为「车间」（机台号停用录入）；
             workTeam 现存字典值，历史自由文本班组名回落原样显示 -->
        <el-table-column label="车间" width="90" align="center">
          <template #default="{ row }">{{ workshopLabel(row.workTeam) }}</template>
        </el-table-column>
        <el-table-column label="制单人" prop="creatorName" width="90" align="center">
          <template #default="{ row }">{{ row.creatorName || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="tagTypeOf(FINISHED_DOC_STATUS, row.status)">
              {{ labelOf(FINISHED_DOC_STATUS, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button
                v-if="row.status === FINISHED_DOC_STATUS_VALUE.DRAFT"
                size="small" v-permission.disable="'finished-stock:update'" link type="primary" :icon="Edit"
                @click="openEdit(row)"
              >编辑</el-button>
              <el-button
                v-if="row.status === FINISHED_DOC_STATUS_VALUE.DRAFT"
                size="small" v-permission.disable="'finished-stock:confirm'" link type="success" :icon="CircleCheck"
                :loading="actingId === row.id" @click="onConfirm(row)"
              >确认</el-button>
              <el-button
                v-if="row.status === FINISHED_DOC_STATUS_VALUE.DRAFT"
                size="small" v-permission.disable="'finished-stock:cancel'" link type="danger" :icon="Delete"
                :loading="actingId === row.id" @click="onCancel(row)"
              >作废</el-button>
              <el-button
                v-if="canReverse(row)"
                size="small" v-permission.disable="'finished-stock:reverse'" link type="warning" :icon="RefreshLeft"
                :loading="actingId === row.id" @click="onReverse(row)"
              >红字冲销</el-button>
              <!-- 送货单：只有销售出库单才是对客户的发货动作（入库/期初/红字都不是），
                   已作废单不给打；服务端另有同样的守卫 -->
              <el-button
                v-if="row.bizType === FINISHED_BIZ_TYPE.SALE_OUTBOUND"
                size="small" v-permission.disable="'finished-stock:print'" link type="primary" :icon="Printer"
                :disabled="row.status === FINISHED_DOC_STATUS_VALUE.CANCELLED"
                @click="openDeliveryNote(row)"
              >送货单</el-button>
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Edit, Delete, CircleCheck, RefreshLeft, Download, Upload, Printer, Document, ArrowDown } from '@element-plus/icons-vue';
import {
  getFinishedDocList,
  downloadFinishedDocExport,
  confirmFinishedDoc,
  cancelFinishedDoc,
  reverseFinishedDoc,
  type FinishedDocRow,
  type FinishedDocExportMode,
  type FinishSyncResult,
} from '@/api/finished-stock';
import {
  FINISHED_DOC_STATUS,
  FINISHED_DOC_STATUS_VALUE,
  FINISHED_BIZ_TYPE,
  FINISHED_BIZ_TYPE_OPTIONS,
  STOCK_DIRECTION_VALUE,
  labelOf,
  tagTypeOf,
  sideLabel,
} from '@/constants/dict';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';
import { loadDict } from '@/composables/useDict';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useExcelExport } from '@/composables/useExcelExport';

/** 车间字典（assembly_workshop）；历史 workTeam 是自由文本班组名，查不到就回落原值 */
const workshopDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('assembly_workshop').then((rows: any[]) => {
  workshopDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
function workshopLabel(v: string | null): string {
  if (!v) return '—';
  return workshopDict.value.find((o) => o.value === v)?.label ?? v;
}

/**
 * 表面处理字典（surface_type）：展开行要出中文，`electrophoresis` 这类英文码等于没显示。
 * 取不到标签时回原值——字典项被停用后至少还认得出原始码（同导出侧口径）。
 */
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
function surfaceLabel(v: string | null): string {
  if (!v) return '—';
  return surfaceDict.value.find((o) => o.value === v)?.label ?? v;
}

/** 「颜色」是可停用的业务字段（§5.7），停用时整列不显示 */
const { colorEnabled } = useFeatureFlags();

const router = useRouter();
const loading = ref(false);
const list = ref<FinishedDocRow[]>([]);
const total = ref(0);
const actingId = ref<number | null>(null);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  bizType: undefined as string | undefined,
  status: undefined as number | undefined,
});
const dateRange = ref<[string, string] | null>(null);

async function load() {
  loading.value = true;
  try {
    const res = await getFinishedDocList({
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
/* ===== 导出（预检 → 确认 → 下载，走公共封装，别再自己写确认框） ===== */
const { exporting, exportWithConfirm } = useExcelExport();
/** 导出筛选条件与列表完全一致；分页字段不参与（导出的是全部筛选结果） */
const exportFilters = () => ({
  keyword: query.keyword,
  bizType: query.bizType,
  status: query.status,
  dateFrom: dateRange.value?.[0],
  dateTo: dateRange.value?.[1],
});
function onExport(command: string | number | object) {
  const exportMode: FinishedDocExportMode = command === 'split' ? 'split' : 'combined';
  const modeText = exportMode === 'split'
    ? '按实际出入方向分为“入库记录 / 出库记录”两个工作表'
    : '将入库、出库记录合并到一个工作表';
  return exportWithConfirm({
    name: '出入库',
    // 条数**每次实查**：用户改了筛选没点查询时，页面上的 total 还是上一次的数
    getCount: async () => (await getFinishedDocList({ ...exportFilters(), page: 1, pageSize: 1 })).total,
    scopeText: (n) => `按当前筛选条件导出 <b>${n}</b> 张单据的全部明细（一行一条明细），并${modeText}`,
    run: () => downloadFinishedDocExport({ ...exportFilters(), exportMode }),
  });
}

function reload() {
  query.page = 1;
  load();
}
const { schedule: scheduleKeywordSearch, flush: runKeywordSearch } = useDebouncedSearch(reload);
load();
onActivated(load);

function openCreate(bizType: string) {
  router.push({ name: 'FinishedStockForm', query: { bizType } });
}
function openEdit(row: FinishedDocRow) {
  router.push({ name: 'FinishedStockForm', query: { id: row.id } });
}

/**
 * 送货单在**新标签页**打开（同生产任务单）：单据是拿去打印随货发出的，
 * 开新页签能留住列表的筛选与滚动位置，打完直接关掉。
 * 用 router.resolve 拿 href 而不是手拼路径——生产 SPA base 是 `/oms/admin/`。
 */
function openDeliveryNote(row: FinishedDocRow) {
  const { href } = router.resolve({ path: '/finished-stock/delivery-note', query: { id: row.id } });
  window.open(href, '_blank');
}

/** 已确认且非红字单才可冲销（红字单不可再冲销，§7.1） */
function canReverse(row: FinishedDocRow): boolean {
  return row.status === FINISHED_DOC_STATUS_VALUE.CONFIRMED && row.bizType !== FINISHED_BIZ_TYPE.REVERSAL;
}

async function onConfirm(row: FinishedDocRow) {
  await ElMessageBox.confirm(
    row.direction === STOCK_DIRECTION_VALUE.IN
      ? `确认入库单「${row.docNo}」？入库量将校验装配闸门，确认后不可修改，只能红字冲销。`
      : `确认出库单「${row.docNo}」？将扣减库存结存，确认后不可修改，只能红字冲销。`,
    '确认单据',
    { type: 'warning' },
  );
  actingId.value = row.id;
  try {
    const res = await confirmFinishedDoc(row.id);
    ElMessage.success('已确认');
    notifyOrderSync(res);
    load();
  } finally {
    actingId.value = null;
  }
}

/**
 * 订单状态自动变更提示（§3.1）：发货欠数交清会自动完结、回正会自动重开。
 * 这是确认/冲销的**副作用**，不提示的话用户会以为订单状态被人偷改了。
 */
function notifyOrderSync(res?: FinishSyncResult) {
  if (res?.finished?.length) {
    ElMessage.success(`订单 ${res.finished.join('、')} 已交清，自动完结`);
  }
  if (res?.reopened?.length) {
    ElMessage.warning(`订单 ${res.reopened.join('、')} 发货欠数回正，已自动重开`);
  }
}

async function onCancel(row: FinishedDocRow) {
  await ElMessageBox.confirm(`确定作废单据「${row.docNo}」吗？仅草稿可作废。`, '作废单据', {
    type: 'warning', confirmButtonText: '作废', confirmButtonClass: 'el-button--danger',
  });
  actingId.value = row.id;
  try {
    await cancelFinishedDoc(row.id);
    ElMessage.success('已作废');
    load();
  } finally {
    actingId.value = null;
  }
}

async function onReverse(row: FinishedDocRow) {
  const { value } = await ElMessageBox.prompt(
    `将为「${row.docNo}」生成方向相反的红字冲销单并立即生效，原单保持不变。请填写冲销原因。`,
    '红字冲销',
    {
      inputPlaceholder: '如：数量录错、客户退货',
      inputValidator: (v: string) => (v && v.trim() ? true : '冲销原因必填'),
      type: 'warning',
    },
  );
  actingId.value = row.id;
  try {
    const res = await reverseFinishedDoc(row.id, {
      docDate: new Date().toISOString().slice(0, 10),
      reason: String(value).trim(),
    });
    ElMessage.success(`已生成红字单 ${res.docNo}`);
    notifyOrderSync(res);
    load();
  } finally {
    actingId.value = null;
  }
}

function dateText(v: string | null): string {
  return v ? String(v).slice(0, 10) : '—';
}

/**
 * 单据头的生产单号：由明细快照去重并列。
 * 单头本身不存生产单号（一张单可以跨多张订单，存单头就得二选一），
 * 明细里每行都带订单侧快照，去重后并列即可；不挂订单的纯属性期初行没有此号，跳过。
 */
function productionNos(row: FinishedDocRow): string {
  const vs = [...new Set((row.items ?? []).map((it) => it.productionNo).filter(Boolean))];
  return vs.length ? vs.join('/') : '—';
}
</script>

<script lang="ts">
export default { name: 'FinishedStockList' };
</script>

<style scoped lang="scss">
.toolbar {
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;
  .tip { margin-left: auto; font-size: 12px; color: var(--el-text-color-secondary); }
  .tip b { color: var(--el-text-color-primary); }
}
.pager { margin-top: 12px; }
.dir-in { color: var(--el-color-success); font-weight: 600; }
.dir-out { color: var(--el-color-warning); font-weight: 600; }
.expand-wrap { padding: 8px 16px 8px 56px; }
.expand-grid {
  width: 100%; max-width: 1300px; border-collapse: collapse; font-size: 13px;
  th, td { border: 1px solid var(--el-border-color); padding: 5px 10px; text-align: left; }
  th { background: var(--el-fill-color-light); font-weight: 600; text-align: center; white-space: nowrap; }
  .c { text-align: center; }
}
</style>
