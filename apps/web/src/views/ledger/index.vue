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
          <el-button
            size="small" v-permission="'ledger:export'" plain :icon="Download"
            :loading="exporting" @click="onExport"
          >导出</el-button>
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
      <app-table
        :data="list" v-loading="loading" border stripe
        :page="query.page" :page-size="query.pageSize" row-key="orderPartGroupId"
        :span-method="spanMethod" @expand-change="onExpandChange"
      >
        <!-- 行内展开：该部件组的出入库 / 外发 / 装配三条流水（§5.1），展开时才加载 -->
        <el-table-column type="expand" width="36" fixed="left">
          <template #default="{ row }">
            <div v-loading="detailLoadingId === row.orderPartGroupId" class="lg-detail">
              <template v-if="detailCache[row.orderPartGroupId]">
                <div class="lg-detail__sec">
                  <div class="lg-detail__title">成品出入库流水（仅已确认单据）</div>
                  <table v-if="detailCache[row.orderPartGroupId].finished.length" class="lg-grid">
                    <thead>
                      <tr><th>单号</th><th>类型</th><th>日期</th><th>边别</th><th>方向</th><th>数量</th><th>被冲原单</th><th>制单人</th><th>备注</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="(f, i) in detailCache[row.orderPartGroupId].finished" :key="i">
                        <td>{{ f.docNo || '—' }}</td>
                        <td>{{ labelOf(FINISHED_BIZ_TYPE_OPTIONS, f.bizType) }}</td>
                        <td class="lg-c">{{ f.docDate || '—' }}</td>
                        <td class="lg-c">{{ sideLabel(f.side) || '整组' }}</td>
                        <td class="lg-c">
                          <span :class="f.direction > 0 ? 'num-ok' : 'num-owed'">{{ f.direction > 0 ? '入' : '出' }}</span>
                        </td>
                        <td class="lg-c">{{ f.quantity }}</td>
                        <td>{{ f.originDocNo || '—' }}</td>
                        <td class="lg-c">{{ f.creatorName || '—' }}</td>
                        <td>{{ f.remark || '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-else class="lg-empty">暂无已确认的出入库单据</div>
                </div>

                <div class="lg-detail__sec">
                  <div class="lg-detail__title">外发流水（已作废发坯单不计）</div>
                  <table v-if="detailCache[row.orderPartGroupId].outsource.length" class="lg-grid">
                    <thead>
                      <tr><th>发坯单号</th><th>加工商</th><th>表面处理/颜色</th><th>发出日期</th><th>要求回货</th><th>发出重量</th><th>单重</th><th>发出</th><th>已回</th><th>未回</th><th>状态</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="(o, i) in detailCache[row.orderPartGroupId].outsource" :key="i">
                        <td>{{ formatBlankNo(o.blankNo) || '—' }}</td>
                        <td>{{ o.processorName || '—' }}</td>
                        <td class="lg-c">{{ [dictLabel(surfaceDict, o.surfaceType), o.color].filter((v) => v && v !== '—').join(' / ') || '—' }}</td>
                        <td class="lg-c">{{ o.sendDate || '—' }}</td>
                        <td class="lg-c">{{ o.requireBackDate || '—' }}</td>
                        <td class="lg-c">{{ o.sendWeight }} kg</td>
                        <td class="lg-c">{{ o.unitWeight }}</td>
                        <td class="lg-c">{{ o.sendQty }}</td>
                        <td class="lg-c">{{ o.returnedQty }}</td>
                        <td class="lg-c"><span :class="o.pendingQty > 0 ? 'num-owed' : 'num-ok'">{{ o.pendingQty }}</span></td>
                        <td class="lg-c">
                          <el-tag size="small" :type="tagTypeOf(OUTSOURCE_STATUS, o.status) as any">
                            {{ labelOf(OUTSOURCE_STATUS, o.status) }}
                          </el-tag>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-else class="lg-empty">该部件组无外发记录（不需要表面处理，或尚未发外）</div>
                </div>

                <div class="lg-detail__sec">
                  <div class="lg-detail__title">装配批次</div>
                  <table v-if="detailCache[row.orderPartGroupId].assembly.length" class="lg-grid">
                    <thead>
                      <tr><th>#</th><th>边别</th><th>装配车间</th><th>计划开始</th><th>计划完成</th><th>实际完成</th><th>数量</th><th>状态</th><th>备注</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="(a, i) in detailCache[row.orderPartGroupId].assembly" :key="a.id">
                        <td class="lg-c">{{ i + 1 }}</td>
                        <td class="lg-c">{{ sideLabel(a.side) || '整组' }}</td>
                        <td class="lg-c">{{ dictLabel(workshopDict, a.workshop) }}</td>
                        <td class="lg-c">{{ a.planStartDate || '—' }}</td>
                        <td class="lg-c">{{ a.planDate || '—' }}</td>
                        <td class="lg-c">{{ a.actualDate || '—' }}</td>
                        <td class="lg-c">{{ a.qty }}</td>
                        <td class="lg-c">
                          <el-tag size="small" :type="a.completed ? 'success' : 'info'">
                            {{ a.completed ? '已完成' : '计划中' }}
                          </el-tag>
                        </td>
                        <td>{{ a.remark || '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-else class="lg-empty">尚未录入装配批次</div>
                </div>
              </template>
            </div>
          </template>
        </el-table-column>
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
          <template #default="{ row }">{{ dictLabels(workshopDict, row.assemblyWorkshops) }}</template>
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
import { computed, onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  Search,
  Download,
  Document,
  Goods,
  CircleCheckFilled,
  Box,
  Tools,
  Van,
} from '@element-plus/icons-vue';
import {
  getLedger,
  getLedgerRowDetail,
  exportLedger,
  type LedgerRow,
  type LedgerRowDetail,
  type LedgerSummary,
} from '@/api/ledger';
import {
  PRODUCT_TYPE_OPTIONS,
  UNIT_OPTIONS,
  OUTSOURCE_STATUS,
  FINISHED_BIZ_TYPE_OPTIONS,
  formatBlankNo,
  sideLabel,
  labelOf,
  tagTypeOf,
} from '@/constants/dict';
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
    // 换页/换筛选后旧明细已无意义，清空避免展开时闪出上一页的数据
    detailCache.value = {};
  } finally {
    loading.value = false;
  }
}
function reload() {
  query.page = 1;
  load();
}
load();

/* ===== 行内展开：按需加载该部件组的三条流水 ===== */
const detailCache = ref<Record<number, LedgerRowDetail>>({});
const detailLoadingId = ref<number | null>(null);

/** AppTable 是手风琴模式，展开事件的第二参是当前展开行数组 */
async function onExpandChange(row: LedgerRow, expanded: unknown) {
  const isOpen = Array.isArray(expanded)
    ? expanded.some((r: any) => r?.orderPartGroupId === row.orderPartGroupId)
    : !!expanded;
  if (!isOpen || detailCache.value[row.orderPartGroupId]) return;
  detailLoadingId.value = row.orderPartGroupId;
  try {
    detailCache.value[row.orderPartGroupId] = await getLedgerRowDetail(row.orderPartGroupId);
  } finally {
    detailLoadingId.value = null;
  }
}

/* ===== 产品级列跨行合并（§5.1）=====
 * 同一产品行拆成多个部件组时，产品级信息（客户/订单编号/规格/交期…）每行重复
 * 一遍很吵，合并成一格更贴近手工台账的观感。
 * 只合并**相邻**的同产品行：排序由服务端决定，万一同产品的组没挨着，宁可不合并
 * 也不能把中间夹着的别的产品错并进来。 */
const PRODUCT_LEVEL_COLS = new Set([
  '下单日期', '业务/跟单', '客户', '订单编号', '产品编码',
  '规格', '数量/单位', '表面处理', '订单交期',
]);

/** rowIndex → 合并跨度；0 表示本行被上一行合并掉 */
const productSpans = computed(() => {
  const spans = new Map<number, number>();
  const rows = list.value;
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].orderProductId === rows[i].orderProductId) j++;
    spans.set(i, j - i + 1);
    for (let k = i + 1; k <= j; k++) spans.set(k, 0);
    i = j + 1;
  }
  return spans;
});

/* ===== 导出 Excel ===== */
const exporting = ref(false);
async function onExport() {
  if (!total.value) {
    ElMessage.warning('当前筛选无台账数据，无需导出');
    return;
  }
  exporting.value = true;
  try {
    // 只传筛选条件，不传分页——导出的是当前筛选的全量，不是当前这一页
    const blob = await exportLedger({
      keyword: query.keyword || undefined,
      salesman: query.salesman || undefined,
      merchandiser: query.merchandiser || undefined,
      surfaceType: query.surfaceType,
      assemblyWorkshop: query.assemblyWorkshop,
      productType: query.productType,
      onlyOwed: query.onlyOwed,
      onlyOverdue: query.onlyOverdue,
      deliveryFrom: deliveryRange.value?.[0],
      deliveryTo: deliveryRange.value?.[1],
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `订单跟踪台账_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

function spanMethod({ column, rowIndex }: { column: { label?: string }; rowIndex: number }) {
  if (!column?.label || !PRODUCT_LEVEL_COLS.has(column.label)) return;
  const span = productSpans.value.get(rowIndex) ?? 1;
  return span === 0 ? { rowspan: 0, colspan: 0 } : { rowspan: span, colspan: 1 };
}
onActivated(load);

/* ===== 展示辅助 ===== */
/** 多值字典展示：数组逐个转中文标签后并列（无值显示 —） */
function dictLabels(opts: Array<{ label: string; value: string }>, vs: string[] | null | undefined): string {
  if (!vs?.length) return '—';
  return vs.map((v) => opts.find((o) => o.value === v)?.label ?? v).join('/');
}
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

/* 行内展开：三段流水。用原生 table 而非 el-table——展开区是只读明细，
   不需要排序/固定列/虚拟滚动，嵌套 el-table 反而带来对齐与性能负担 */
.lg-detail {
  padding: 10px 16px 12px 52px;
  min-height: 40px;
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
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  th, td {
    border: 1px solid var(--el-border-color-lighter);
    padding: 5px 8px;
    text-align: left;
    white-space: nowrap;
  }
  th { background: var(--el-fill-color-light); font-weight: 600; }
  tbody tr:hover td { background: var(--el-fill-color-lighter); }
  .lg-c { text-align: center; }
}
.lg-empty {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  padding: 6px 8px;
}
/* 合并单元格后仍要有清晰的行边界 */
:deep(.el-table td.el-table__cell) { vertical-align: middle; }
</style>
