<template>
  <div class="page">
    <el-tabs v-model="activeTab" class="ps-tabs">
      <!-- ==================== Tab1 产品汇总（累计口径） ==================== -->
      <el-tab-pane label="产品汇总" name="summary">
        <el-card shadow="never" class="filter-card">
          <el-form :inline="true" class="filter-bar" @submit.prevent="reloadSummary">
            <!-- 首行：筛选维度（客户/表面处理/产品类型/下单日期/订单状态） -->
            <div class="filter-line">
              <el-form-item label="客户">
                <el-select
                  v-model="sQuery.customerName" clearable filterable placeholder="全部"
                  :filter-method="filterCustomers"
                  style="width: 200px" @change="reloadSummary"
                  @visible-change="(v: boolean) => v && resetCustomerFilter()"
                >
                  <!-- 主数据允许同名客户（不同编码），右侧带出编码便于区分 -->
                  <el-option v-for="c in customerOptions" :key="c.id" :label="c.customerName" :value="c.customerName">
                    <span>{{ c.customerName }}</span>
                    <!-- 内联样式：下拉面板 teleport 到 body，scoped 类选择器够不到 -->
                    <span style="float: right; margin-left: 16px; font-size: 12px; color: var(--el-text-color-secondary)">{{ c.customerCode }}</span>
                  </el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="表面处理">
                <el-select v-model="sQuery.surfaceType" clearable placeholder="全部" style="width: 120px" @change="reloadSummary">
                  <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="产品类型">
                <el-select v-model="sQuery.productType" clearable placeholder="全部" style="width: 110px" @change="reloadSummary">
                  <el-option v-for="o in PRODUCT_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="下单日期">
                <el-date-picker
                  v-model="orderDateRange" type="daterange" value-format="YYYY-MM-DD"
                  start-placeholder="开始" end-placeholder="结束" style="width: 230px" @change="reloadSummary"
                />
              </el-form-item>
              <el-form-item label="订单状态">
                <el-select v-model="sQuery.orderStatus" clearable placeholder="全部" style="width: 100px" @change="reloadSummary">
                  <el-option label="进行中" :value="ORDER_STATUS_VALUE.ACTIVE" />
                  <el-option label="已完结" :value="ORDER_STATUS_VALUE.FINISHED" />
                </el-select>
              </el-form-item>
            </div>
            <!-- 次行：开关 + 关键字 + 操作按钮 -->
            <div class="filter-line">
              <el-form-item>
                <el-checkbox v-model="sQuery.onlyOwed" @change="reloadSummary">只看有欠数</el-checkbox>
              </el-form-item>
              <el-form-item>
                <el-checkbox v-model="sQuery.onlyStocked" @change="reloadSummary">只看有库存</el-checkbox>
              </el-form-item>
              <el-form-item label="关键字">
                <el-input
                  v-model="sQuery.keyword" clearable style="width: 220px"
                  placeholder="货号/型号/订单号/客户"
                  @clear="reloadSummary" @keyup.enter="reloadSummary"
                />
              </el-form-item>
              <el-form-item>
                <el-button size="small" type="primary" :icon="Search" @click="reloadSummary">查询</el-button>
                <el-button size="small" :icon="RefreshLeft" @click="resetSummaryFilters">重置</el-button>
                <el-button
                  size="small" v-permission="'product-summary:export'" plain :icon="Download"
                  :loading="exporting" @click="onExportSummary"
                >导出 Excel</el-button>
              </el-form-item>
            </div>
          </el-form>
        </el-card>

        <!-- 汇总卡：当前筛选的整体口径（不受分页影响） -->
        <div class="sum-bar">
          <app-stat-card color="slate" :value="sSummary.kinds" label="产品款数">
            <template #icon><el-icon><Collection /></el-icon></template>
          </app-stat-card>
          <app-stat-card color="blue" :value="sSummary.totalQty" label="订单总数(支)">
            <template #icon><el-icon><Goods /></el-icon></template>
          </app-stat-card>
          <app-stat-card color="green" :value="sSummary.totalIn" label="累计入库(支)">
            <template #icon><el-icon><CircleCheckFilled /></el-icon></template>
          </app-stat-card>
          <app-stat-card color="amber" :value="sSummary.totalOut" label="累计出库(支)">
            <template #icon><el-icon><Van /></el-icon></template>
          </app-stat-card>
          <app-stat-card color="teal" :value="sSummary.totalStock" label="当前库存(支)">
            <template #icon><el-icon><Box /></el-icon></template>
          </app-stat-card>
        </div>

        <el-card shadow="never">
          <div class="tip-bar">
            <div class="tip-bar__left">
              <el-icon><InfoFilled /></el-icon>
              <span>
                <b>相同产品</b> = 型号、节数、规格、料厚、表面处理{{ colorEnabled ? '、颜色' : '' }}一致，
                <b>跨订单归并成一行</b>；数量一律按<b>支</b>计。呆滞品为独立台账（不挂订单），不计入本页。
              </span>
            </div>
            <div class="tip-bar__right">
              <span class="dim-unit-label">规格单位</span>
              <el-radio-group v-model="dimViewUnit" size="small">
                <el-radio-button :value="DIMENSION_UNIT.MM">mm</el-radio-button>
                <el-radio-button :value="DIMENSION_UNIT.INCH">寸</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <app-table
            :data="sList" v-loading="sLoading" border stripe
            :page="sQuery.page" :page-size="sQuery.pageSize" row-key="key"
          >
            <!-- 行内展开：该产品的逐订单明细（按客户/产品反查的答案，随主行返回） -->
            <el-table-column type="expand" width="36" fixed="left">
              <template #default="{ row }">
                <div class="lg-detail">
                  <div class="lg-detail__sec">
                    <div class="lg-detail__title">逐订单明细（{{ row.orders.length }} 个订单产品行）</div>
                    <table v-if="row.orders.length" class="lg-grid">
                      <thead>
                        <tr>
                          <th>下单日期</th><th>订单编号</th><th>客户</th><th>订单数(支)</th>
                          <th>累计入库</th><th>累计出库</th><th>库存数</th>
                          <th>成品欠数</th><th>发货欠数</th><th>交期</th><th>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="o in row.orders" :key="o.orderProductId">
                          <td class="lg-c">{{ o.orderDate || '—' }}</td>
                          <td>{{ o.productionNo || o.orderNo || '—' }}</td>
                          <td class="lg-memo" :title="o.customerName || ''">{{ o.customerName || '—' }}</td>
                          <td class="lg-c">{{ o.qtyPcs }}</td>
                          <td class="lg-c"><span class="num-ok">{{ o.inQty }}</span></td>
                          <td class="lg-c">{{ o.outQty }}</td>
                          <td class="lg-c"><span class="num-info">{{ o.stockQty }}</span></td>
                          <td class="lg-c"><span :class="owedClass(o.productionOwed)">{{ o.productionOwed }}</span></td>
                          <td class="lg-c"><span :class="owedClass(o.deliveryOwed)">{{ o.deliveryOwed }}</span></td>
                          <td class="lg-c"><span :class="{ 'num-overdue': o.overdue }">{{ o.deliveryDate || '—' }}</span></td>
                          <td class="lg-c">
                            <el-tag v-if="o.overdue" size="small" type="danger" disable-transitions>逾期</el-tag>
                            <el-tag v-else-if="o.deliveryOwed <= 0" size="small" type="success" disable-transitions>已交清</el-tag>
                            <el-tag v-else size="small" type="warning" disable-transitions>跟进中</el-tag>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="产品型号" prop="productModel" min-width="150" class-name="col-left" show-overflow-tooltip />
            <el-table-column :label="dimColLabel" width="105" align="center">
              <template #default="{ row }">{{ dimText(row.dimensionMm) }}</template>
            </el-table-column>
            <el-table-column label="节数" width="80" align="center">
              <template #default="{ row }">{{ railSectionLabel(row.railSection) || '—' }}</template>
            </el-table-column>
            <el-table-column label="料厚" width="105" align="center">
              <template #default="{ row }">{{ row.thickness || '—' }}</template>
            </el-table-column>
            <el-table-column label="表面处理" width="90" align="center">
              <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
            </el-table-column>
            <el-table-column v-if="colorEnabled" label="颜色" width="85" align="center">
              <template #default="{ row }">{{ row.color || '—' }}</template>
            </el-table-column>
            <el-table-column label="客户" min-width="170" show-overflow-tooltip>
              <template #default="{ row }">
                <span :title="row.customers.join('、')">{{ customersText(row.customers) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="订单数" width="78" align="center">
              <template #default="{ row }">{{ row.orderCount }}</template>
            </el-table-column>
            <el-table-column label="订单总数(支)" width="105" align="center" class-name="col-key">
              <template #default="{ row }">{{ row.qtyPcs }}</template>
            </el-table-column>
            <el-table-column label="累计入库" width="90" align="center" class-name="col-key">
              <template #default="{ row }"><span class="num-ok">{{ row.inQty }}</span></template>
            </el-table-column>
            <el-table-column label="成品欠数" width="90" align="center" class-name="col-key">
              <template #default="{ row }">
                <span :class="owedClass(row.productionOwed)">{{ row.productionOwed }}</span>
              </template>
            </el-table-column>
            <el-table-column label="累计出库" width="90" align="center" class-name="col-key">
              <template #default="{ row }">{{ row.outQty }}</template>
            </el-table-column>
            <el-table-column label="发货欠数" width="90" align="center" class-name="col-key">
              <template #default="{ row }">
                <span :class="owedClass(row.deliveryOwed)">{{ row.deliveryOwed }}</span>
              </template>
            </el-table-column>
            <el-table-column label="库存数" width="85" align="center" class-name="col-key">
              <template #default="{ row }"><span class="num-info">{{ row.stockQty }}</span></template>
            </el-table-column>
          </app-table>
          <app-pagination
            class="pager" :total="sTotal"
            v-model:page="sQuery.page" v-model:size="sQuery.pageSize" @change="loadSummary"
          />
        </el-card>
      </el-tab-pane>

      <!-- ==================== Tab2 出入库汇总（期间进销存） ==================== -->
      <el-tab-pane label="出入库汇总" name="period">
        <el-card shadow="never" class="filter-card">
          <el-form :inline="true" class="filter-bar" @submit.prevent="reloadPeriod">
            <el-form-item label="单据日期" required>
              <el-date-picker
                v-model="periodRange" type="daterange" value-format="YYYY-MM-DD"
                :clearable="false" start-placeholder="开始" end-placeholder="结束"
                style="width: 240px" @change="reloadPeriod"
              />
            </el-form-item>
            <el-form-item label="客户">
              <el-select
                v-model="pQuery.customerName" clearable filterable placeholder="全部"
                :filter-method="filterCustomers"
                style="width: 200px" @change="reloadPeriod"
                @visible-change="(v: boolean) => v && resetCustomerFilter()"
              >
                <el-option v-for="c in customerOptions" :key="c.id" :label="c.customerName" :value="c.customerName">
                  <span>{{ c.customerName }}</span>
                  <!-- 内联样式：下拉面板 teleport 到 body，scoped 类选择器够不到 -->
                  <span style="float: right; margin-left: 16px; font-size: 12px; color: var(--el-text-color-secondary)">{{ c.customerCode }}</span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="表面处理">
              <el-select v-model="pQuery.surfaceType" clearable placeholder="全部" style="width: 120px" @change="reloadPeriod">
                <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="关键字">
              <el-input
                v-model="pQuery.keyword" clearable style="width: 200px"
                placeholder="货号/型号/订单号/客户"
                @clear="reloadPeriod" @keyup.enter="reloadPeriod"
              />
            </el-form-item>
            <el-form-item>
              <el-button size="small" type="primary" :icon="Search" @click="reloadPeriod">查询</el-button>
              <el-button size="small" :icon="RefreshLeft" @click="resetPeriodFilters">重置</el-button>
              <el-button
                size="small" v-permission="'product-summary:export'" plain :icon="Download"
                :loading="exporting" @click="onExportPeriod"
              >导出 Excel</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <div class="sum-bar">
          <app-stat-card color="slate" :value="pSummary.totalOpening" label="期初结存(支)">
            <template #icon><el-icon><Coin /></el-icon></template>
          </app-stat-card>
          <app-stat-card color="green" :value="pSummary.totalIn" label="期间入库(支)">
            <template #icon><el-icon><CircleCheckFilled /></el-icon></template>
          </app-stat-card>
          <app-stat-card color="amber" :value="pSummary.totalOut" label="期间出库(支)">
            <template #icon><el-icon><Van /></el-icon></template>
          </app-stat-card>
          <app-stat-card color="teal" :value="pSummary.totalEnd" label="期末结存(支)">
            <template #icon><el-icon><Box /></el-icon></template>
          </app-stat-card>
        </div>

        <el-card shadow="never">
          <div class="tip-bar">
            <div class="tip-bar__left">
              <el-icon><InfoFilled /></el-icon>
              <span>
                按<b>单据日期</b>统计：<b>期末结存 = 期初结存 + 期间入库 − 期间出库</b>；
                红字冲销计入其<b>发生期间</b>（跨期冲销会让期间数出现负数，属正常）。
              </span>
            </div>
            <div class="tip-bar__right">
              <span class="dim-unit-label">规格单位</span>
              <el-radio-group v-model="dimViewUnit" size="small">
                <el-radio-button :value="DIMENSION_UNIT.MM">mm</el-radio-button>
                <el-radio-button :value="DIMENSION_UNIT.INCH">寸</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <app-table
            :data="pList" v-loading="pLoading" border stripe
            :page="pQuery.page" :page-size="pQuery.pageSize" row-key="key"
          >
            <!-- 行内展开：期间内逐笔已确认单据（随主行返回） -->
            <el-table-column type="expand" width="36" fixed="left">
              <template #default="{ row }">
                <div class="lg-detail">
                  <div class="lg-detail__sec">
                    <div class="lg-detail__title">期间出入库明细（{{ row.flows.length }} 笔，仅已确认单据）</div>
                    <table v-if="row.flows.length" class="lg-grid">
                      <thead>
                        <tr>
                          <th>单据号</th><th>日期</th><th>类型</th><th>方向</th><th>数量(支)</th>
                          <th>边别</th><th>表面处理</th><th v-if="colorEnabled">颜色</th>
                          <th>客户</th><th>订单编号</th><th>被冲原单</th><th>登记人</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(f, i) in row.flows" :key="i">
                          <td>{{ f.docNo || '—' }}</td>
                          <td class="lg-c">{{ f.docDate || '—' }}</td>
                          <td class="lg-c">{{ labelOf(FINISHED_BIZ_TYPE_OPTIONS, f.bizType) }}</td>
                          <td class="lg-c">
                            <span :class="f.direction > 0 ? 'num-ok' : 'num-owed'">{{ f.direction > 0 ? '入' : '出' }}</span>
                          </td>
                          <td class="lg-c">{{ f.quantity }}</td>
                          <td class="lg-c">{{ sideLabel(f.side) || '整套' }}</td>
                          <td class="lg-c">{{ dictLabel(surfaceDict, f.surfaceType) }}</td>
                          <td v-if="colorEnabled" class="lg-c">{{ f.color || '—' }}</td>
                          <td class="lg-memo" :title="f.customerName || ''">{{ f.customerName || '—' }}</td>
                          <td>{{ f.productionNo || '—' }}</td>
                          <td>{{ f.originDocNo || '—' }}</td>
                          <td class="lg-c">{{ f.creatorName || '—' }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div v-else class="lg-empty">期间内无出入库单据（仅有期初结存）</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="产品型号" prop="productModel" min-width="150" class-name="col-left" show-overflow-tooltip />
            <el-table-column :label="dimColLabel" width="105" align="center">
              <template #default="{ row }">{{ dimText(row.dimensionMm) }}</template>
            </el-table-column>
            <el-table-column label="节数" width="80" align="center">
              <template #default="{ row }">{{ railSectionLabel(row.railSection) || '—' }}</template>
            </el-table-column>
            <el-table-column label="料厚" width="105" align="center">
              <template #default="{ row }">{{ row.thickness || '—' }}</template>
            </el-table-column>
            <el-table-column label="表面处理" width="90" align="center">
              <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
            </el-table-column>
            <el-table-column v-if="colorEnabled" label="颜色" width="85" align="center">
              <template #default="{ row }">{{ row.color || '—' }}</template>
            </el-table-column>
            <el-table-column label="客户" min-width="170" show-overflow-tooltip>
              <template #default="{ row }">
                <span :title="row.customers.join('、')">{{ customersText(row.customers) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="期初结存" width="95" align="center" class-name="col-key">
              <template #default="{ row }"><span :class="signClass(row.opening)">{{ row.opening }}</span></template>
            </el-table-column>
            <el-table-column label="期间入库" width="95" align="center" class-name="col-key">
              <template #default="{ row }"><span :class="signClass(row.periodIn, 'num-ok')">{{ row.periodIn }}</span></template>
            </el-table-column>
            <el-table-column label="期间出库" width="95" align="center" class-name="col-key">
              <template #default="{ row }"><span :class="signClass(row.periodOut)">{{ row.periodOut }}</span></template>
            </el-table-column>
            <el-table-column label="期末结存" width="95" align="center" class-name="col-key">
              <template #default="{ row }"><span :class="signClass(row.periodEnd, 'num-info')">{{ row.periodEnd }}</span></template>
            </el-table-column>
          </app-table>
          <app-pagination
            class="pager" :total="pTotal"
            v-model:page="pQuery.page" v-model:size="pQuery.pageSize" @change="loadPeriod"
          />
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onActivated, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Search,
  RefreshLeft,
  Download,
  Collection,
  Goods,
  CircleCheckFilled,
  Box,
  Van,
  Coin,
  InfoFilled,
} from '@element-plus/icons-vue';
import {
  getProductSummary,
  getPeriodSummary,
  downloadSummaryExport,
  downloadPeriodExport,
  type ProductSummaryRow,
  type ProductSummarySummary,
  type PeriodSummaryRow,
} from '@/api/product-summary';
import { getAllCustomers, type CustomerItem } from '@/api/customer';
import { useExcelExport } from '@/composables/useExcelExport';
import {
  PRODUCT_TYPE_OPTIONS,
  FINISHED_BIZ_TYPE_OPTIONS,
  ORDER_STATUS_VALUE,
  DIMENSION_UNIT,
  sideLabel,
  railSectionLabel,
  labelOf,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useDimensionView } from '@/composables/useDimensionView';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppStatCard from '@/components/AppStatCard.vue';

/** 「颜色」字段全局开关（展示开关；聚合键恒含颜色，与开关无关） */
const { colorEnabled } = useFeatureFlags();
/** 规格查看单位：初值取系统配置，与首页/台账/订单页同一 composable */
const { viewUnit: dimViewUnit, colLabel: dimColLabel, text: dimText } = useDimensionView();

const activeTab = ref<'summary' | 'period'>('summary');

/* ===== 公共下拉 ===== */
const customers = ref<CustomerItem[]>([]);
const customerOptions = ref<CustomerItem[]>([]);
/** 与订单新增页一致：客户下拉同时支持按客户名称、客户代码过滤。 */
function resetCustomerFilter() {
  customerOptions.value = customers.value;
}
function filterCustomers(q: string) {
  const kw = q.trim().toLowerCase();
  customerOptions.value = kw
    ? customers.value.filter(
        (c) => c.customerName.toLowerCase().includes(kw) || (c.customerCode || '').toLowerCase().includes(kw),
      )
    : customers.value;
}
getAllCustomers().then((rows) => {
  customers.value = rows;
  resetCustomerFilter();
});
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

/* ==================== Tab1 产品汇总 ==================== */
const sLoading = ref(false);
const sList = ref<ProductSummaryRow[]>([]);
const sTotal = ref(0);
const sSummary = ref<ProductSummarySummary>({
  kinds: 0, totalQty: 0, totalIn: 0, totalOut: 0, totalStock: 0,
  totalProductionOwed: 0, totalDeliveryOwed: 0,
});
const sQuery = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  customerName: undefined as string | undefined,
  surfaceType: undefined as string | undefined,
  productType: undefined as string | undefined,
  orderStatus: undefined as number | undefined,
  onlyOwed: false,
  onlyStocked: false,
});
const orderDateRange = ref<[string, string] | null>(null);

function summaryFilters() {
  return {
    keyword: sQuery.keyword || undefined,
    customerName: sQuery.customerName,
    surfaceType: sQuery.surfaceType,
    productType: sQuery.productType,
    orderStatus: sQuery.orderStatus,
    onlyOwed: sQuery.onlyOwed,
    onlyStocked: sQuery.onlyStocked,
    orderDateFrom: orderDateRange.value?.[0],
    orderDateTo: orderDateRange.value?.[1],
  };
}

async function loadSummary() {
  sLoading.value = true;
  try {
    const res = await getProductSummary({
      ...summaryFilters(),
      page: sQuery.page,
      pageSize: sQuery.pageSize,
    });
    sList.value = res.list;
    sTotal.value = res.total;
    sSummary.value = res.summary;
  } finally {
    sLoading.value = false;
  }
}
function reloadSummary() {
  sQuery.page = 1;
  loadSummary();
}
function resetSummaryFilters() {
  Object.assign(sQuery, {
    keyword: '',
    customerName: undefined,
    surfaceType: undefined,
    productType: undefined,
    orderStatus: undefined,
    onlyOwed: false,
    onlyStocked: false,
  });
  orderDateRange.value = null;
  resetCustomerFilter();
  reloadSummary();
}
loadSummary();

/* ==================== Tab2 出入库汇总（期间） ==================== */
const pLoading = ref(false);
const pList = ref<PeriodSummaryRow[]>([]);
const pTotal = ref(0);
const pSummary = ref({ kinds: 0, totalOpening: 0, totalIn: 0, totalOut: 0, totalEnd: 0 });
const pQuery = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  customerName: undefined as string | undefined,
  surfaceType: undefined as string | undefined,
});
/** 单据日期区间默认本月 1 日 ~ 今天（财务月度对账的常用口径） */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function defaultPeriodRange(): [string, string] {
  const today = new Date();
  return [
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
    localDate(today),
  ];
}
const periodRange = ref<[string, string]>(defaultPeriodRange());

function periodFilters() {
  return {
    from: periodRange.value[0],
    to: periodRange.value[1],
    keyword: pQuery.keyword || undefined,
    customerName: pQuery.customerName,
    surfaceType: pQuery.surfaceType,
  };
}

async function loadPeriod() {
  if (!periodRange.value?.[0] || !periodRange.value?.[1]) {
    ElMessage.warning('请先选择单据日期区间');
    return;
  }
  pLoading.value = true;
  try {
    const res = await getPeriodSummary({
      ...periodFilters(),
      page: pQuery.page,
      pageSize: pQuery.pageSize,
    });
    pList.value = res.list;
    pTotal.value = res.total;
    pSummary.value = res.summary;
  } finally {
    pLoading.value = false;
  }
}
function reloadPeriod() {
  pQuery.page = 1;
  loadPeriod();
}
function resetPeriodFilters() {
  Object.assign(pQuery, {
    keyword: '',
    customerName: undefined,
    surfaceType: undefined,
  });
  periodRange.value = defaultPeriodRange();
  resetCustomerFilter();
  reloadPeriod();
}

/** Tab2 惰性加载：首次切到该页签才发请求 */
const periodLoaded = ref(false);
watch(activeTab, (tab) => {
  if (tab === 'period' && !periodLoaded.value) {
    periodLoaded.value = true;
    loadPeriod();
  }
});

/** keep-alive 返回时刷新当前页签（另一页签保持懒加载状态） */
onActivated(() => {
  if (activeTab.value === 'summary') loadSummary();
  else loadPeriod();
});

/* ===== 导出（预检 → 确认 → 下载，全项目统一流程） ===== */
const { exporting, exportWithConfirm } = useExcelExport();

const onExportSummary = () => exportWithConfirm({
  name: '产品汇总',
  // 实查而不是用页面上的 total：筛选条件改了但没点「查询」时 total 还是上一次的
  getCount: async () => (await getProductSummary({ ...summaryFilters(), page: 1, pageSize: 1 })).total,
  run: () => downloadSummaryExport(summaryFilters()),
});

const onExportPeriod = () => {
  if (!periodRange.value?.[0] || !periodRange.value?.[1]) {
    ElMessage.warning('请先选择单据日期区间');
    return;
  }
  exportWithConfirm({
    name: '出入库汇总',
    getCount: async () => (await getPeriodSummary({ ...periodFilters(), page: 1, pageSize: 1 })).total,
    run: () => downloadPeriodExport(periodFilters()),
  });
};

/* ===== 展示辅助 ===== */
/** 客户列：前 2 个 + 「+N」，全量看悬浮 title（需求④不用展开就有答案） */
function customersText(customers: string[]): string {
  if (!customers.length) return '—';
  if (customers.length <= 2) return customers.join('、');
  return `${customers.slice(0, 2).join('、')} +${customers.length - 2}`;
}
function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
/** 欠数为负 = 超产/超发，正常显示负数并高亮（与台账同口径） */
function owedClass(v: number): string {
  if (v < 0) return 'num-over';
  if (v === 0) return 'num-ok';
  return 'num-owed';
}
/** 期间数：负数标红（跨期红字/日期错乱一眼可见），非负用调用方给的常规色 */
function signClass(v: number, normal = ''): string {
  return v < 0 ? 'num-over' : normal;
}
</script>

<script lang="ts">
export default { name: 'ProductSummary' };
</script>

<style scoped lang="scss">
.sum-bar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 4px 0;
}
/* 筛选区按行分组（首行筛选维度、次行开关+关键字+按钮）；行内仍是 inline form-item */
.filter-line {
  &:not(:last-child) { margin-bottom: 2px; }
}
/* 客户下拉右侧的客户编码用内联样式（下拉面板 teleport 到 body，scoped 够不到） */
.pager { margin-top: 12px; }
/* 页签本体不带卡片底，内容区沿用各自的 el-card（与系统配置页的 Tab 用法一致） */
.ps-tabs :deep(.el-tabs__header) { margin-bottom: 10px; }
.tip-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  b { color: var(--el-text-color-primary); }
  &__left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
}
.dim-unit-label {
  color: var(--el-text-color-regular);
  white-space: nowrap;
}
/* 数量列加浅底，从属性列里凸显（同台账页） */
:deep(.col-key) { background: var(--el-fill-color-light); }
.num-ok { color: var(--el-color-success); font-weight: 600; }
.num-info { color: var(--el-color-primary); font-weight: 600; }
.num-owed { color: var(--el-color-warning); font-weight: 600; }
.num-over { color: var(--el-color-danger); font-weight: 600; }
.num-overdue { color: var(--el-color-danger); font-weight: 600; }

/* 行内展开：原生 table（只读明细不需要 el-table 的排序/固定列）。
   ⚠️ sticky + max-content 是台账页踩过的坑：主表总宽远超视口，展开单元格会横跨整张表，
   不贴住视口左侧的话右滚就看不到明细；sticky 需元素窄于所在单元格，故配合 max-content。 */
.lg-detail {
  padding: 10px 16px 12px 52px;
  min-height: 40px;
  position: sticky;
  left: 0;
  width: max-content;
  min-width: 520px;
  &__sec { margin-bottom: 14px; &:last-child { margin-bottom: 0; } }
  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 6px;
    padding-left: 8px;
    border-left: 3px solid var(--el-color-primary);
  }
}
.lg-grid {
  width: max-content;
  max-width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  th, td {
    border: 1px solid var(--el-border-color-lighter);
    padding: 4px 10px;
    text-align: left;
    white-space: nowrap;
  }
  th {
    background: var(--el-fill-color-light);
    font-weight: 600;
    text-align: center;
    color: var(--el-text-color-regular);
  }
  tbody tr:hover td { background: var(--el-fill-color-lighter); }
  .lg-c { text-align: center; }
  .lg-memo {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
.lg-empty {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  padding: 6px 8px;
}
:deep(.el-table td.el-table__cell) { vertical-align: middle; }
</style>
