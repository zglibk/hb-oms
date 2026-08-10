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
        :page="query.page" :page-size="query.pageSize" row-key="orderProductId"
        @expand-change="onExpandChange"
      >
        <!-- 行内展开：部件组明细（随主行返回）+ 该产品行的出入库 / 外发 / 装配三条流水，
             流水展开时才加载（§5.1） -->
        <el-table-column type="expand" width="36" fixed="left">
          <template #default="{ row }">
            <div v-loading="detailLoadingId === row.orderProductId" class="lg-detail">
              <!-- 部件组明细：工艺属性（生产图号/版本/料厚）与外发回厂进度仍在组级 -->
              <div class="lg-detail__sec">
                <div class="lg-detail__title">部件组明细（工艺属性与外发回厂在组级）</div>
                <table v-if="row.partGroups?.length" class="lg-grid">
                  <thead>
                    <tr><th>部件组</th><th>组型号</th><th>生产图号</th><th>版本</th><th>料厚</th><th>组支数</th><th>外发已回货(支)</th><th>外发欠数(支)</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="g in row.partGroups" :key="g.orderPartGroupId">
                      <td class="lg-c">{{ partGroupLabel(g.groupType) || '—' }}</td>
                      <td>{{ g.productModel || '—' }}</td>
                      <td>{{ g.drawingNo || '—' }}</td>
                      <td class="lg-c">{{ g.drawingVersion || '—' }}</td>
                      <td class="lg-c">{{ g.materialThickness || '—' }}</td>
                      <td class="lg-c">{{ g.qtyPcs }}</td>
                      <td class="lg-c">
                        <span :class="{ 'num-ok': g.returnedQty > 0 }">{{ g.returnedQty }}</span>
                      </td>
                      <!-- 主行的外发欠数是这一列的合计；哪个部件还没回来，看这里 -->
                      <td class="lg-c">
                        <span v-if="g.outsourceOwed == null" class="num-na">—</span>
                        <span v-else :class="owedClass(g.outsourceOwed)">{{ g.outsourceOwed }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-else class="lg-empty">该产品没有部件组</div>
              </div>

              <template v-if="detailCache[row.orderProductId]">
                <div class="lg-detail__sec">
                  <div class="lg-detail__title">成品出入库流水（仅已确认单据）</div>
                  <table v-if="detailCache[row.orderProductId].finished.length" class="lg-grid">
                    <thead>
                      <tr><th>单号</th><th>类型</th><th>日期</th><th>边别</th><th>方向</th><th>数量</th><th>被冲原单</th><th>制单人</th><th>备注</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="(f, i) in detailCache[row.orderProductId].finished" :key="i">
                        <td>{{ f.docNo || '—' }}</td>
                        <td>{{ labelOf(FINISHED_BIZ_TYPE_OPTIONS, f.bizType) }}</td>
                        <td class="lg-c">{{ f.docDate || '—' }}</td>
                        <td class="lg-c">{{ sideLabel(f.side) || '整套' }}</td>
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
                  <div class="lg-detail__title">外发回厂流水（逐笔；外发仍锚部件组）</div>
                  <table v-if="detailCache[row.orderProductId].outsource.length" class="lg-grid">
                    <thead>
                      <tr><th>部件组</th><th>回厂日期</th><th>加工商</th><th>{{ colorEnabled ? '表面处理/颜色' : '表面处理' }}</th><th>重量(kg)</th><th>单重</th><th>数量(支)</th><th>登记人</th><th>备注</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="(o, i) in detailCache[row.orderProductId].outsource" :key="i">
                        <td class="lg-c">{{ partGroupLabel(o.groupType) || '—' }}</td>
                        <td class="lg-c">{{ o.backDate || '—' }}</td>
                        <td>{{ o.processorName || '—' }}</td>
                        <td class="lg-c">{{ [dictLabel(surfaceDict, o.surfaceType), colorEnabled ? o.color : ''].filter((v) => v && v !== '—').join(' / ') || '—' }}</td>
                        <td class="lg-c">{{ o.returnWeight }}</td>
                        <td class="lg-c">{{ o.unitWeight }}</td>
                        <td class="lg-c">{{ o.returnQty }}</td>
                        <td class="lg-c">{{ o.creatorName || '—' }}</td>
                        <td>{{ o.remark || '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-else class="lg-empty">该产品下各部件组均无外发回厂记录（不需要表面处理，或尚未回厂）</div>
                </div>

                <div class="lg-detail__sec">
                  <div class="lg-detail__title">装配批次</div>
                  <table v-if="detailCache[row.orderProductId].assembly.length" class="lg-grid">
                    <thead>
                      <tr><th>#</th><th>边别</th><th>装配车间</th><th>计划开始</th><th>计划完成</th><th>实际完成</th><th>数量</th><th>状态</th><th>备注</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="(a, i) in detailCache[row.orderProductId].assembly" :key="a.id">
                        <td class="lg-c">{{ i + 1 }}</td>
                        <td class="lg-c">{{ sideLabel(a.side) || '整套' }}</td>
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
        <!-- 生产图号/版本/料厚是**组级**字段，一个产品可能有多组，故移入展开行 -->
        <el-table-column label="部件组" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ groupTypesText(row) }}</template>
        </el-table-column>
        <el-table-column label="外发已回货" width="100" align="center">
          <template #default="{ row }">{{ row.returnedQty }}</template>
        </el-table-column>
        <!-- 外发欠数 = 应外发量(Σ组支数) − 已回货；不外发的产品显示 —（见服务端注释） -->
        <el-table-column label="外发欠数" width="95" align="center">
          <template #default="{ row }">
            <span v-if="row.outsourceOwed == null" class="num-na">—</span>
            <span v-else :class="owedClass(row.outsourceOwed)">{{ row.outsourceOwed }}</span>
          </template>
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
import { onActivated, reactive, ref } from 'vue';
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
  FINISHED_BIZ_TYPE_OPTIONS,
  sideLabel,
  partGroupLabel,
  labelOf,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppStatCard from '@/components/AppStatCard.vue';

/** 「颜色」字段全局开关（系统配置 → 业务字段） */
const { colorEnabled } = useFeatureFlags();

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

/* ===== 行内展开：按需加载该产品行的三条流水 =====
 * 部件组明细（组类型/图号/版本/料厚/外发回货）已随主行返回，展开即可见，无需再请求；
 * 逐笔流水才走这个接口——一页十几行全查三张流水表太重。 */
const detailCache = ref<Record<number, LedgerRowDetail>>({});
const detailLoadingId = ref<number | null>(null);

/** AppTable 是手风琴模式，展开事件的第二参是当前展开行数组 */
async function onExpandChange(row: LedgerRow, expanded: unknown) {
  const isOpen = Array.isArray(expanded)
    ? expanded.some((r: any) => r?.orderProductId === row.orderProductId)
    : !!expanded;
  if (!isOpen || detailCache.value[row.orderProductId]) return;
  detailLoadingId.value = row.orderProductId;
  try {
    detailCache.value[row.orderProductId] = await getLedgerRowDetail(row.orderProductId);
  } finally {
    detailLoadingId.value = null;
  }
}

/* 注：主行升到产品级后一行即一个产品，原先「相邻同产品行跨行合并」的
 * span-method 已无用武之地，随之整段删除。 */

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

onActivated(load);

/* ===== 展示辅助 ===== */
/** 多值字典展示：数组逐个转中文标签后并列（无值显示 —） */
function dictLabels(opts: Array<{ label: string; value: string }>, vs: string[] | null | undefined): string {
  if (!vs?.length) return '—';
  return vs.map((v) => opts.find((o) => o.value === v)?.label ?? v).join('/');
}
/** 主行的部件组一览：按组序并列（明细在展开行里） */
function groupTypesText(row: LedgerRow): string {
  const vs = (row.partGroups ?? []).map((g) => partGroupLabel(g.groupType) || '').filter(Boolean);
  return vs.length ? vs.join('/') : '—';
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
/* 不适用（如不需要表面处理的产品没有外发欠数），与「0」在视觉上区分开 */
.num-na { color: var(--el-text-color-placeholder); }
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
:deep(.el-table td.el-table__cell) { vertical-align: middle; }
</style>
