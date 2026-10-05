<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="订单号/PO#/客户/生产单号/产品代码"
            style="width: 220px"
            @input="scheduleKeywordSearch"
            @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="业务员">
          <el-select v-model="query.salesman" clearable filterable placeholder="全部" style="width: 100px" @change="runKeywordSearch">
            <el-option v-for="n in salesmanOptions" :key="n" :label="n" :value="n" />
          </el-select>
        </el-form-item>
        <el-form-item label="跟单员">
          <el-select v-model="query.merchandiser" clearable filterable placeholder="全部" style="width: 100px" @change="runKeywordSearch">
            <el-option v-for="n in merchandiserOptions" :key="n" :label="n" :value="n" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 110px" @change="runKeywordSearch">
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
            @change="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
          <filter-more-toggle v-model="showMoreFilters" :count="moreFilterCount" />
        </el-form-item>
      </el-form>

      <!-- 「更多」：产品级条件，订单下任一产品行同时满足全部所填条件即入选 -->
      <Transition name="filter-more-fade">
        <el-form v-show="showMoreFilters" :inline="true" class="filter-bar filter-more" @submit.prevent="runKeywordSearch">
          <el-form-item v-if="customerDrawingNoEnabled" label="客户图号">
            <el-input v-model="query.customerDrawingNo" placeholder="模糊匹配" style="width: 140px" @input="scheduleKeywordSearch" @keyup.enter="runKeywordSearch" />
          </el-form-item>
          <el-form-item label="生产图号">
            <el-input v-model="query.drawingNo" placeholder="模糊匹配" style="width: 140px" @input="scheduleKeywordSearch" @keyup.enter="runKeywordSearch" />
          </el-form-item>
          <el-form-item label="产品类型">
            <el-select v-model="query.productType" clearable placeholder="全部" style="width: 110px" @change="runKeywordSearch">
              <el-option v-for="o in PRODUCT_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="轨道节数">
            <el-select v-model="query.railSection" clearable placeholder="全部" style="width: 100px" @change="runKeywordSearch">
              <el-option v-for="o in RAIL_SECTION_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="表面处理">
            <el-select v-model="query.surfaceType" clearable placeholder="全部" style="width: 110px" @change="runKeywordSearch">
              <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="交货日期">
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
        </el-form>
      </Transition>
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
        <!-- 规格查看单位：只影响主行「规格」列展示，不改库（与台账页同款，1 英寸=25mm） -->
        <span class="dim-unit-ctl">
          <span class="dim-unit-label">规格单位</span>
          <el-radio-group v-model="dimViewUnit" size="small">
            <el-radio-button :value="DIMENSION_UNIT.MM">mm</el-radio-button>
            <el-radio-button :value="DIMENSION_UNIT.INCH">寸</el-radio-button>
          </el-radio-group>
        </span>
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
        <el-table-column label="生产单号" prop="productionNo" width="95" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productionNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="客户" prop="customerName" min-width="90" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="产品名称" min-width="110" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ joinProducts(row, (p) => p.productName ?? '') }}</template>
        </el-table-column>
        <el-table-column :label="dimColLabel" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ joinProducts(row, dimViewText) }}</template>
        </el-table-column>
        <el-table-column label="订单日期" prop="orderDate" width="95">
          <template #default="{ row }">{{ (row.orderDate || '').slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="款数" width="55">
          <template #default="{ row }">{{ row.products.length }}</template>
        </el-table-column>
        <el-table-column label="总支数" width="75">
          <template #default="{ row }">{{ totalPcs(row) }}</template>
        </el-table-column>
        <el-table-column label="业务员" prop="salesman" width="75">
          <template #default="{ row }">
            <color-tag v-if="row.salesman" :seed="row.salesman">{{ row.salesman }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="跟单员" prop="merchandiser" width="75">
          <template #default="{ row }">
            <color-tag v-if="row.merchandiser" :seed="row.merchandiser">{{ row.merchandiser }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="75">
          <template #default="{ row }">
            <el-tag size="small" :type="tagTypeOf(ORDER_STATUS, row.status)">{{ labelOf(ORDER_STATUS, row.status) }}</el-tag>
            <el-tag v-if="row.isOpening" size="small" type="info" style="margin-left: 4px">期初</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button
                size="small"
                v-permission.disable="'order:update'"
                link type="primary" class="btn-edit" :icon="Edit"
                :disabled="row.status === ORDER_STATUS_VALUE.CANCELLED || row.canModify === false"
                :title="row.canModify === false ? NOT_OWNER_TIP : undefined"
                @click="openEdit(row)"
              >编辑</el-button>
              <!-- 复制历史订单做模板建新单：复制的是内容不是状态，已作废订单也允许复制 -->
              <el-button
                size="small" v-permission.disable="'order:create'" link type="primary" :icon="CopyDocument"
                @click="openCopy(row)"
              >复制</el-button>
              <!-- 生产任务单打印页（A4，可导出 PDF）；已作废订单不该再下发生产，禁用 -->
              <el-button
                size="small" v-permission.disable="'order:export'" link type="primary" :icon="Printer"
                :disabled="row.status === ORDER_STATUS_VALUE.CANCELLED"
                @click="openTaskOrder(row.id)"
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
                :disabled="row.canModify === false"
                :title="row.canModify === false ? NOT_OWNER_TIP : undefined"
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
import { Plus, Edit, Delete, Search, CircleCheck, RefreshLeft, Download, Printer, CopyDocument } from '@element-plus/icons-vue';
import {
  getOrderList,
  finishOrder,
  reopenOrder,
  deleteOrder,
  exportTotalPlan,
  getOrderStaffOptions,
  type OrderItem,
  type OrderProductItem,
} from '@/api/order';
import {
  ORDER_STATUS,
  ORDER_STATUS_VALUE,
  UNIT_OPTIONS,
  DIMENSION_UNIT,
  formatProductModel,
  formatDimension,
  labelOf,
  tagTypeOf,
  ORDER_SALESMAN_OPTIONS,
  ORDER_MERCHANDISER_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  RAIL_SECTION_OPTIONS,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useDimensionView } from '@/composables/useDimensionView';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';
import ColorTag from '@/components/ColorTag.vue';
import FilterMoreToggle from '@/components/FilterMoreToggle.vue';

/** 业务字段全局开关（系统配置 → 业务字段） */
const { customerDrawingNoEnabled, productRequirementEnabled } = useFeatureFlags();

const router = useRouter();
/** 不是自己建的订单：只有订单创建人与订单修改主管角色能改 / 删（服务端另有硬校验） */
const NOT_OWNER_TIP = '只有订单创建人或主管角色（如业务经理）可以修改、删除这张订单';
const loading = ref(false);
const list = ref<OrderItem[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: undefined as number | undefined,
  salesman: undefined as string | undefined,
  merchandiser: undefined as string | undefined,
  customerDrawingNo: '',
  drawingNo: '',
  productType: undefined as string | undefined,
  railSection: undefined as string | undefined,
  surfaceType: undefined as string | undefined,
});
const deliveryRange = ref<[string, string] | null>(null);

/** 查询条件「更多」折叠区：默认收起；收起时按钮上显示折叠区里生效的条件个数（防止被看不见的条件筛过） */
const showMoreFilters = ref(false);
const moreFilterCount = computed(
  () =>
    [
      customerDrawingNoEnabled.value ? query.customerDrawingNo : '',
      query.drawingNo,
      query.productType,
      query.railSection,
      query.surfaceType,
      deliveryRange.value?.[0],
    ].filter((v) => v != null && String(v).trim() !== '').length,
);
/** 列表与总计划导出共用的筛选参数：两边必须是同一批条件 */
function filterParams() {
  return {
    keyword: query.keyword || undefined,
    status: query.status,
    dateFrom: dateRange.value?.[0],
    dateTo: dateRange.value?.[1],
    salesman: query.salesman,
    merchandiser: query.merchandiser,
    // 客户图号字段停用时不带这个条件（输入框已隐藏，留着旧值会暗中筛掉订单）
    customerDrawingNo: (customerDrawingNoEnabled.value && query.customerDrawingNo.trim()) || undefined,
    drawingNo: query.drawingNo.trim() || undefined,
    productType: query.productType || undefined,
    railSection: query.railSection || undefined,
    surfaceType: query.surfaceType || undefined,
    deliveryFrom: deliveryRange.value?.[0],
    deliveryTo: deliveryRange.value?.[1],
  };
}

/**
 * 查询区「业务员 / 跟单员」下拉选项 = 硬编码名单 ∪ 订单里实际出现过的姓名。
 * 名单保证还没录过单的在职人员也选得到；库里的取值兜住表单手输的名单外姓名与历史人员。
 * 接口失败时退回只用名单，不影响页面其它功能。
 */
const staffFromOrders = ref<{ salesmen: string[]; merchandisers: string[] }>({ salesmen: [], merchandisers: [] });
getOrderStaffOptions()
  .then((r) => (staffFromOrders.value = r))
  .catch(() => {});
const salesmanOptions = computed(() => [...new Set([...ORDER_SALESMAN_OPTIONS, ...staffFromOrders.value.salesmen])]);
const merchandiserOptions = computed(() => [
  ...new Set([...ORDER_MERCHANDISER_OPTIONS, ...staffFromOrders.value.merchandisers]),
]);
const dateRange = ref<[string, string] | null>(null);

// assembly_workshop 字典不再需要——订单环节已不安排装配车间
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((sf: any[]) => {
  surfaceDict.value = sf.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

async function load() {
  loading.value = true;
  try {
    const res = await getOrderList({ page: query.page, pageSize: query.pageSize, ...filterParams() });
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
    const blob = await exportTotalPlan(filterParams());
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
/** 复制历史订单为新建模板：表单按 copyFrom 回显内容后走新建保存（保存时重新采番） */
function openCopy(row: OrderItem) {
  router.push({ name: 'OrderForm', query: { copyFrom: row.id } });
}

/**
 * 生产任务单在**新标签页**打开：单据是拿去打印/存档的，开新页签能留住列表的
 * 筛选与滚动位置，看完直接关掉即可，不必再返回。
 * 用 router.resolve 拿 href 而不是手拼路径——生产环境 SPA base 是 `/oms/admin/`，
 * 手拼会漏掉这段前缀。
 */
function openTaskOrder(id: number) {
  const { href } = router.resolve({ path: '/order/print', query: { id } });
  window.open(href, '_blank');
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
/** 主行聚合列（产品名称/规格）：各产品行取值去重后用「 / 」并列，空值与占位符不参与 */
function joinProducts(row: OrderItem, pick: (p: OrderProductItem) => string): string {
  const vals = [...new Set(row.products.map(pick).filter((v) => v && v !== '—'))];
  return vals.length ? vals.join(' / ') : '—';
}
/**
 * 规格查看单位：初值取系统配置的「默认规格单位」，用户可临时切换（不改库）。
 * 逻辑与首页、台账页共用同一个 composable。
 */
const { viewUnit: dimViewUnit, colLabel: dimColLabel, text: dimTextOf } = useDimensionView();
/** 多规格订单先逐产品换算再由 joinProducts 去重并列（400mm/450mm → 16寸/18寸） */
function dimViewText(p: OrderProductItem): string {
  const t = dimTextOf(p.dimensionMm);
  // joinProducts 会把「—」过滤掉（多产品行并列时空值不该占位）
  return t === '—' ? '' : t;
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
.toolbar { margin-bottom: 12px; display: flex; align-items: center; }
/* 规格单位切换靠右（标题行右对齐） */
.dim-unit-ctl { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
.dim-unit-label { color: var(--el-text-color-regular); white-space: nowrap; font-size: 13px; }
.pager { margin-top: 12px; }
.expand-wrap { padding: 8px 16px 8px 56px; }
.expand-grid {
  width: 100%; max-width: 1280px; border-collapse: collapse; font-size: 13px;
  th, td { border: 1px solid var(--el-border-color); padding: 5px 10px; text-align: left; }
  th { background: var(--el-fill-color-light); font-weight: 600; text-align: center; white-space: nowrap; }
  .eg-center { text-align: center; }
}
</style>
