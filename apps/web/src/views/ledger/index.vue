<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="reload">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword" clearable style="width: 240px"
            placeholder="订单号/客户/生产单号/型号/货号"
            @clear="reload" @keyup.enter="reload"
          />
        </el-form-item>
        <el-form-item label="业务员">
          <el-input v-model="query.salesman" clearable style="width: 100px" @clear="reload" @keyup.enter="reload" />
        </el-form-item>
        <el-form-item label="跟单员">
          <el-input v-model="query.merchandiser" clearable style="width: 100px" @clear="reload" @keyup.enter="reload" />
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="query.surfaceType" clearable placeholder="全部" style="width: 120px" @change="reload">
            <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="装配车间">
          <el-select v-model="query.assemblyWorkshop" clearable placeholder="全部" style="width: 110px" @change="reload">
            <el-option v-for="o in workshopDict" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品类型">
          <el-select v-model="query.productType" clearable placeholder="全部" style="width: 110px" @change="reload">
            <el-option v-for="o in PRODUCT_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="交期">
          <el-date-picker
            v-model="deliveryRange" type="daterange" value-format="YYYY-MM-DD"
            start-placeholder="开始" end-placeholder="结束" style="width: 230px" @change="reload"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyOwed" @change="reload">只看有欠数</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyOverdue" @change="reload">只看逾期</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="reload">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 汇总卡：当前筛选口径的整体六数（不受分页影响）。版式见 AppStatCard -->
    <div class="sum-bar">
      <app-stat-card color="slate" :value="summary.rows" label="台账行数" link-text="详情&gt;" @link="goDetail">
        <template #icon><el-icon><Document /></el-icon></template>
      </app-stat-card>
      <app-stat-card color="blue" :value="summary.totalQty" label="订单数(支)" link-text="详情&gt;" @link="goDetail">
        <template #icon><el-icon><Goods /></el-icon></template>
      </app-stat-card>
      <app-stat-card color="green" :value="summary.totalIn" label="完成数(支)" link-text="详情&gt;" @link="goDetail">
        <template #icon><el-icon><CircleCheckFilled /></el-icon></template>
      </app-stat-card>
      <app-stat-card color="teal" :value="summary.totalStock" label="库存数(支)" link-text="详情&gt;" @link="goDetail">
        <template #icon><el-icon><Box /></el-icon></template>
      </app-stat-card>
      <app-stat-card color="amber" :value="summary.totalProductionOwed" label="生产欠数(支)" link-text="详情&gt;" @link="goDetail">
        <template #icon><el-icon><Tools /></el-icon></template>
      </app-stat-card>
      <app-stat-card color="red" :value="summary.totalDeliveryOwed" label="发货欠数(支)" link-text="详情&gt;" @link="goDetail">
        <template #icon><el-icon><Van /></el-icon></template>
      </app-stat-card>
    </div>

    <el-card shadow="never">
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="orderPartGroupId">
        <el-table-column label="下单日期" width="100" align="center">
          <template #default="{ row }">{{ dateText(row.orderDate) }}</template>
        </el-table-column>
        <el-table-column label="业务/跟单" width="110" align="center">
          <template #default="{ row }">{{ [row.salesman, row.merchandiser].filter(Boolean).join('/') || '—' }}</template>
        </el-table-column>
        <el-table-column label="客户" prop="customerName" min-width="120" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="订单编号" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productionNo || row.orderNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="产品编码" prop="materialCode" width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.materialCode || '—' }}</template>
        </el-table-column>
        <el-table-column label="产品型号" prop="productModel" min-width="150" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="规格" width="105" align="center">
          <template #default="{ row }">{{ row.dimensionText || '—' }}</template>
        </el-table-column>
        <el-table-column label="数量/单位" width="95" align="center">
          <template #default="{ row }">{{ row.orderQty }}{{ unitLabel(row.unit) }}</template>
        </el-table-column>
        <el-table-column label="表面处理" width="95" align="center">
          <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
        </el-table-column>
        <el-table-column label="图号/版本" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ [row.drawingNo, row.drawingVersion].filter(Boolean).join(' ') || '—' }}</template>
        </el-table-column>
        <el-table-column label="料厚" width="95" align="center">
          <template #default="{ row }">{{ row.materialThickness || '—' }}</template>
        </el-table-column>
        <el-table-column label="外发已回货" width="100" align="center">
          <template #default="{ row }">{{ row.returnedQty }}</template>
        </el-table-column>
        <el-table-column label="装配车间" width="90" align="center">
          <template #default="{ row }">{{ dictLabel(workshopDict, row.assemblyWorkshop) }}</template>
        </el-table-column>
        <el-table-column label="装配完成" width="90" align="center">
          <template #default="{ row }">
            <span :class="{ 'num-ok': row.assemblyPendingQty <= 0 }">{{ row.assembledQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="订单数" width="85" align="center" class-name="col-key">
          <template #default="{ row }">{{ row.qtyPcs }}</template>
        </el-table-column>
        <el-table-column label="成品入库" width="90" align="center" class-name="col-key">
          <template #default="{ row }"><span class="num-ok">{{ row.inQty }}</span></template>
        </el-table-column>
        <el-table-column label="生产欠数" width="90" align="center" class-name="col-key">
          <template #default="{ row }">
            <span :class="owedClass(row.productionOwed)">{{ row.productionOwed }}</span>
          </template>
        </el-table-column>
        <el-table-column label="订单交期" width="100" align="center">
          <template #default="{ row }">
            <span :class="{ 'num-overdue': row.overdue }">{{ dateText(row.deliveryDate) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="成品出货" width="90" align="center" class-name="col-key">
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
        <el-table-column label="状态" width="80" align="center" fixed="right">
          <template #default="{ row }">
            <el-tag v-if="row.overdue" size="small" type="danger">逾期</el-tag>
            <el-tag v-else-if="row.deliveryOwed <= 0" size="small" type="success">已交清</el-tag>
            <el-tag v-else size="small" type="warning">跟进中</el-tag>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" :page-sizes="[15, 20, 50, 100]" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Search,
  Document,
  Goods,
  CircleCheckFilled,
  Box,
  Tools,
  Van,
} from '@element-plus/icons-vue';
import { getLedger, type LedgerRow, type LedgerSummary } from '@/api/ledger';
import { PRODUCT_TYPE_OPTIONS, UNIT_OPTIONS } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppStatCard from '@/components/AppStatCard.vue';

const router = useRouter();
const loading = ref(false);
const list = ref<LedgerRow[]>([]);
const total = ref(0);
const summary = ref<LedgerSummary>({
  rows: 0, totalQty: 0, totalIn: 0, totalOut: 0,
  totalStock: 0, totalProductionOwed: 0, totalDeliveryOwed: 0,
});
const query = reactive({
  page: 1,
  pageSize: 15,
  keyword: '',
  salesman: '',
  merchandiser: '',
  surfaceType: undefined as string | undefined,
  assemblyWorkshop: undefined as string | undefined,
  productType: undefined as string | undefined,
  onlyOwed: false,
  onlyOverdue: false,
});
const deliveryRange = ref<[string, string] | null>(null);

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
const workshopDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
loadDict('assembly_workshop').then((rows: any[]) => {
  workshopDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

async function load() {
  loading.value = true;
  try {
    const res = await getLedger({
      ...query,
      salesman: query.salesman || undefined,
      merchandiser: query.merchandiser || undefined,
      deliveryFrom: deliveryRange.value?.[0],
      deliveryTo: deliveryRange.value?.[1],
    });
    list.value = res.list;
    total.value = res.total;
    summary.value = res.summary;
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

/* ===== 展示辅助 ===== */
function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
function unitLabel(v: string | null): string {
  return UNIT_OPTIONS.find((o) => o.value === v)?.label ?? (v ?? '');
}
function dateText(v: string | null): string {
  return v ? String(v).slice(0, 10) : '—';
}
/** 欠数为负 = 超产/超发，正常显示负数并高亮，不截断为 0（§5.1） */
function owedClass(v: number): string {
  if (v < 0) return 'num-over';
  if (v === 0) return 'num-ok';
  return 'num-owed';
}

/** 卡片「详情>」跳转：当前统一跳台账页（后续可按卡片类型细化目标） */
function goDetail() {
  router.push('/ledger');
}
</script>

<script lang="ts">
export default { name: 'OrderLedger' };
</script>

<style scoped lang="scss">
/* 卡片本体样式已下沉 AppStatCard（首页看板共用），此处只管排布 */
.sum-bar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 4px 0;
}
.pager { margin-top: 12px; }
/* 四数列加浅底，从一堆属性列里凸显出来 */
:deep(.col-key) { background: var(--el-fill-color-light); }
.num-ok { color: var(--el-color-success); font-weight: 600; }
.num-info { color: var(--el-color-primary); font-weight: 600; }
.num-owed { color: var(--el-color-warning); font-weight: 600; }
.num-over { color: var(--el-color-danger); font-weight: 600; }
.num-overdue { color: var(--el-color-danger); font-weight: 600; }
</style>
