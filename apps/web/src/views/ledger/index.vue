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

    <!-- 汇总卡：当前筛选口径的整体六数（不受分页影响）。
         左图标(1) + 右上下(数字2/标签1)，数字与图标同色，各卡片色系区分。 -->
    <div class="sum-bar">
      <div class="sum-card sum-card--slate">
        <div class="sum-card__icon"><el-icon><Document /></el-icon></div>
        <div class="sum-card__body">
          <div class="sum-card__value">{{ summary.rows }}</div>
          <div class="sum-card__label-row">
            <span class="sum-card__label">台账行数</span>
            <button class="sum-card__link" @click="goDetail">详情&gt;</button>
          </div>
        </div>
      </div>
      <div class="sum-card sum-card--blue">
        <div class="sum-card__icon"><el-icon><Goods /></el-icon></div>
        <div class="sum-card__body">
          <div class="sum-card__value">{{ summary.totalQty }}</div>
          <div class="sum-card__label-row">
            <span class="sum-card__label">订单数(支)</span>
            <button class="sum-card__link" @click="goDetail">详情&gt;</button>
          </div>
        </div>
      </div>
      <div class="sum-card sum-card--green">
        <div class="sum-card__icon"><el-icon><CircleCheckFilled /></el-icon></div>
        <div class="sum-card__body">
          <div class="sum-card__value">{{ summary.totalIn }}</div>
          <div class="sum-card__label-row">
            <span class="sum-card__label">完成数(支)</span>
            <button class="sum-card__link" @click="goDetail">详情&gt;</button>
          </div>
        </div>
      </div>
      <div class="sum-card sum-card--teal">
        <div class="sum-card__icon"><el-icon><Box /></el-icon></div>
        <div class="sum-card__body">
          <div class="sum-card__value">{{ summary.totalStock }}</div>
          <div class="sum-card__label-row">
            <span class="sum-card__label">库存数(支)</span>
            <button class="sum-card__link" @click="goDetail">详情&gt;</button>
          </div>
        </div>
      </div>
      <div class="sum-card sum-card--amber">
        <div class="sum-card__icon"><el-icon><Tools /></el-icon></div>
        <div class="sum-card__body">
          <div class="sum-card__value">{{ summary.totalProductionOwed }}</div>
          <div class="sum-card__label-row">
            <span class="sum-card__label">生产欠数(支)</span>
            <button class="sum-card__link" @click="goDetail">详情&gt;</button>
          </div>
        </div>
      </div>
      <div class="sum-card sum-card--red">
        <div class="sum-card__icon"><el-icon><Van /></el-icon></div>
        <div class="sum-card__body">
          <div class="sum-card__value">{{ summary.totalDeliveryOwed }}</div>
          <div class="sum-card__label-row">
            <span class="sum-card__label">发货欠数(支)</span>
            <button class="sum-card__link" @click="goDetail">详情&gt;</button>
          </div>
        </div>
      </div>
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
/**
 * 汇总卡：左图标(宽1) + 右上下(高 数字2 / 标签1)，数字与图标同色。
 * 各卡片色系区分（slate/blue/green/teal/amber/red），半透明底+主色图标数字，
 * 深色模式下底色自动叠加变深，保持可读。
 */
.sum-bar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 4px 0;

  .sum-card {
    --card-color: #64748b;
    --card-bg: rgba(100, 116, 139, 0.10);
    --card-border: rgba(100, 116, 139, 0.25);
    --card-icon-bg: rgba(100, 116, 139, 0.16);

    flex: 1 1 150px;
    min-width: 165px;
    display: flex;
    align-items: stretch;
    gap: 12px;
    padding: 20px 16px;
    border-radius: 10px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    transition: transform 0.15s, box-shadow 0.15s;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    /* 左侧图标区：正方形，固定尺寸不随容器拉伸 */
    &__icon {
      width: 48px;
      height: 48px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: var(--card-color);
      background: var(--card-icon-bg);
      border-radius: 8px;
    }

    /* 右侧内容区：占满剩余空间，上下结构 */
    &__body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
    }

    /* 数字：高度占比 2，大字号突出 */
    &__value {
      flex: 2;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.1;
      color: var(--card-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* 标签行：左标签 + 右「详情>」按钮，两端对齐 */
    &__label-row {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      line-height: 1.2;
    }

    &__label {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* 「详情>」文字按钮：跟随卡片色系，hover 加深 */
    &__link {
      flex-shrink: 0;
      padding: 0;
      border: none;
      background: transparent;
      font-size: 12px;
      line-height: 1.2;
      color: var(--card-color);
      cursor: pointer;
      opacity: 0.85;
      transition: opacity 0.15s;

      &:hover {
        opacity: 1;
        text-decoration: underline;
      }
    }

    /* 六色系区分 */
    &--slate {
      --card-color: #64748b;
      --card-bg: rgba(100, 116, 139, 0.10);
      --card-border: rgba(100, 116, 139, 0.25);
      --card-icon-bg: rgba(100, 116, 139, 0.16);
    }
    &--blue {
      --card-color: var(--el-color-primary);
      --card-bg: rgba(64, 158, 255, 0.10);
      --card-border: rgba(64, 158, 255, 0.25);
      --card-icon-bg: rgba(64, 158, 255, 0.16);
    }
    &--green {
      --card-color: var(--el-color-success);
      --card-bg: rgba(103, 194, 58, 0.10);
      --card-border: rgba(103, 194, 58, 0.25);
      --card-icon-bg: rgba(103, 194, 58, 0.16);
    }
    &--teal {
      --card-color: #14b8a6;
      --card-bg: rgba(20, 184, 166, 0.10);
      --card-border: rgba(20, 184, 166, 0.25);
      --card-icon-bg: rgba(20, 184, 166, 0.16);
    }
    &--amber {
      --card-color: var(--el-color-warning);
      --card-bg: rgba(230, 162, 60, 0.10);
      --card-border: rgba(230, 162, 60, 0.25);
      --card-icon-bg: rgba(230, 162, 60, 0.16);
    }
    &--red {
      --card-color: var(--el-color-danger);
      --card-bg: rgba(245, 108, 108, 0.10);
      --card-border: rgba(245, 108, 108, 0.25);
      --card-icon-bg: rgba(245, 108, 108, 0.16);
    }
  }
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
