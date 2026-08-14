<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword" clearable style="width: 240px"
            placeholder="货号 / 型号 / 客户 / 生产单号"
            @input="scheduleKeywordSearch" @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="query.surfaceType" clearable placeholder="全部" style="width: 130px" @change="runKeywordSearch">
            <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="边别">
          <el-select v-model="query.side" clearable placeholder="全部" style="width: 100px" @change="runKeywordSearch">
            <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyInStock" @change="runKeywordSearch">只看有结存</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'dull-stock:create'" type="primary" :icon="Plus" @click="openForm()">
          新增呆滞品
        </el-button>
        <el-button size="small" v-permission="'dull-stock:import'" :icon="Upload" @click="importVisible = true">
          批量导入
        </el-button>
        <el-button
          size="small" v-permission="'dull-stock:export'" :icon="Download"
          :loading="exporting" @click="onExport"
        >导出</el-button>
        <span class="tip">
          <el-icon><InfoFilled /></el-icon>
          已完结订单剩下的成品，<b>一条记录 = 一批货</b>。
          <b>结存数 = 期初数 + 入库数 − 出库数</b>，后两个数只能靠「登记出入库」产生，点行首箭头看流水。
          本页是<b>独立台账</b>，不进订单跟踪台账、也不进成品库存。
        </span>
        <span class="total">
          当前筛选 {{ summary.rows }} 行，结存合计 <b>{{ summary.totalBalancePcs }}</b> 支
        </span>
      </div>

      <app-table
        :data="list" v-loading="loading" border stripe
        :page="query.page" :page-size="query.pageSize" row-key="id"
        @expand-change="onExpand"
      >
        <el-table-column type="expand" width="36" fixed="left">
          <template #default="{ row }">
            <div class="expand-wrap" v-loading="flowLoadingId === row.id">
              <table v-if="(flows[row.id] ?? []).length" class="expand-grid">
                <thead>
                  <tr>
                    <th>日期</th><th>方向</th><th>数量</th><th>变动后结存</th>
                    <th>原因</th><th>备注</th><th>操作人</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in flows[row.id]" :key="f.id">
                    <td class="c">{{ f.flowDate }}</td>
                    <td class="c">
                      <el-tag size="small" :type="f.direction === STOCK_DIRECTION.IN ? 'success' : 'danger'">
                        {{ f.direction === STOCK_DIRECTION.IN ? '入库' : '出库' }}
                      </el-tag>
                    </td>
                    <td class="c">
                      <span :class="f.direction === STOCK_DIRECTION.IN ? 'delta-in' : 'delta-out'">
                        {{ f.direction === STOCK_DIRECTION.IN ? '+' : '−' }}{{ f.quantity }}
                      </span>
                    </td>
                    <td class="c">{{ f.balanceAfter }}</td>
                    <td>{{ f.reason }}</td>
                    <td>{{ f.remark || '—' }}</td>
                    <td class="c">{{ f.creatorName || '—' }}</td>
                    <td class="c">
                      <el-button
                        size="small" v-permission.disable="'dull-stock:stock'" link type="danger"
                        :icon="Delete" @click="onDeleteFlow(row, f)"
                      >删除</el-button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <el-empty v-else description="暂无出入库流水" :image-size="48" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="货号" width="100" align="center">
          <template #default="{ row }">
            {{ row.itemNo || '—' }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.customerName || '—' }}</template>
        </el-table-column>
        <el-table-column label="生产单号" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productionNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="产品型号" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productModel || '—' }}</template>
        </el-table-column>
        <el-table-column label="节数" width="75" align="center">
          <template #default="{ row }">{{ railSectionLabel(row.railSection) || '—' }}</template>
        </el-table-column>
        <el-table-column label="规格" width="75" align="center">
          <template #default="{ row }">{{ row.dimensionText || '—' }}</template>
        </el-table-column>
        <el-table-column label="表面处理" width="100" align="center">
          <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
        </el-table-column>
        <el-table-column v-if="colorEnabled" label="颜色" width="60" align="center">
          <template #default="{ row }">{{ row.color || '—' }}</template>
        </el-table-column>
        <el-table-column label="边别" width="52" align="center">
          <template #default="{ row }">{{ sideLabel(row.side) || '—' }}</template>
        </el-table-column>
        <el-table-column label="单位" width="64" align="center">
          <template #default="{ row }">{{ labelOf(UNIT_OPTIONS, row.unit) }}</template>
        </el-table-column>
        <el-table-column label="期初数" width="80" align="center">
          <template #default="{ row }">{{ row.openingQty }}</template>
        </el-table-column>
        <el-table-column label="入库数" width="80" align="center">
          <template #default="{ row }">
            <span :class="row.inboundQty > 0 ? 'delta-in' : ''">{{ row.inboundQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="出库数" width="80" align="center">
          <template #default="{ row }">
            <span :class="row.outboundQty > 0 ? 'delta-out' : ''">{{ row.outboundQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="结存数" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <span :class="row.balanceQty > 0 ? 'num-ok' : 'num-zero'">
              {{ row.balanceQty }}{{ unitLabel(row.unit) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button
                size="small" v-permission.disable="'dull-stock:stock'" link type="primary" :icon="Sort"
                @click="openFlow(row)"
              >出入库</el-button>
              <el-button
                size="small" v-permission.disable="'dull-stock:update'" link type="primary" :icon="EditPen"
                @click="openForm(row)"
              >编辑</el-button>
              <el-button
                size="small" v-permission.disable="'dull-stock:delete'" link type="danger" :icon="Delete"
                @click="onDelete(row)"
              >删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <!-- 建档 / 编辑 -->
    <el-dialog v-model="formVisible" :title="editRow ? '编辑呆滞品' : '新增呆滞品'" width="760px">
      <el-alert
        v-if="editRow && hasFlow"
        type="info" :closable="false" show-icon class="mb12"
        title="该记录已有出入库流水，单位不可再改（改了历史流水记的数含义就变了）；入库数/出库数只能靠登记出入库变动"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="货号" prop="itemNo">
              <el-input v-model="form.itemNo" placeholder="如 53#" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <!-- 客户 / 生产单号至少填一项，两者互为条件，见 validateSource -->
            <el-form-item label="客户" prop="customerName">
              <el-select
                v-model="form.customerName" filterable allow-create default-first-option
                clearable placeholder="可选择或直接输入" style="width: 100%"
              >
                <el-option v-for="c in customers" :key="c.id" :label="c.customerName" :value="c.customerName" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生产单号" prop="productionNo">
              <el-input v-model="form.productionNo" placeholder="与客户至少填一项" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品类型">
              <!-- 多选不折叠（2026-08-13）：选了什么要一眼看全，折叠成 +N 反而要点开确认 -->
              <el-select v-model="form.productTypes" multiple placeholder="可多选" style="width: 100%">
                <el-option v-for="o in PRODUCT_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="节数">
              <el-select v-model="form.railSection" clearable style="width: 100%">
                <el-option v-for="o in RAIL_SECTION_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="规格(mm)">
              <el-input-number v-model="form.dimensionMm" :min="0" :precision="0" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="表面处理">
              <el-select v-model="form.surfaceType" clearable style="width: 100%" @change="onSurfaceChange">
                <el-option v-for="o in surfaceDict" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="colorEnabled" :span="12">
            <el-form-item label="颜色">
              <el-select
                v-model="form.color" filterable allow-create default-first-option
                clearable placeholder="可选择或直接输入" style="width: 100%"
              >
                <el-option v-for="o in colorDict" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="边别">
              <el-select
                v-model="form.side"
                clearable
                :disabled="!sideEnabled"
                :placeholder="sideEnabled ? '请选择左右' : '非卡口不可选'"
                style="width: 100%"
              >
                <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位" prop="unit">
              <!-- 复选框形态的单选（2026-08-13）：勾另一个即切换；点已勾中的不放开——
                   单位必选其一，不允许空。有流水后禁改的规则不变 -->
              <el-checkbox
                v-for="o in UNIT_OPTIONS" :key="o.value"
                :model-value="form.unit === o.value"
                :disabled="hasFlow"
                @change="(v: any) => onUnitCheck(o.value, v)"
              >{{ o.label }}</el-checkbox>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="期初数" prop="openingQty">
              <el-input-number v-model="form.openingQty" :min="0" :precision="0" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品型号">
              <el-input v-model="form.productModel" placeholder="留空按 货号+类型 自动拼" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" maxlength="255" show-word-limit />
            </el-form-item>
          </el-col>
        </el-row>
        <div v-if="editRow" class="preview" :class="{ bad: previewBalance < 0 }">
          结存数将变为：<b>{{ previewBalance }}</b> {{ unitLabel(form.unit) }}
          （期初 {{ form.openingQty || 0 }} + 入库 {{ editRow.inboundQty }} − 出库 {{ editRow.outboundQty }}）
          {{ previewBalance < 0 ? '——为负，将被拒绝' : '' }}
        </div>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSubmitForm">确定</el-button>
      </template>
    </el-dialog>

    <!-- 登记出入库 -->
    <el-dialog v-model="flowVisible" title="登记出入库" width="560px">
      <el-alert
        v-if="flowRow"
        type="info" :closable="false" show-icon class="mb12"
        :title="`${flowRow.itemNo}${flowRow.productModel ? ' / ' + flowRow.productModel : ''} — 当前结存 ${flowRow.balanceQty} ${unitLabel(flowRow.unit)}`"
      />
      <el-form ref="flowFormRef" :model="flowForm" :rules="flowRules" label-width="90px" size="small">
        <el-form-item label="方向" prop="direction">
          <el-radio-group v-model="flowForm.direction">
            <el-radio-button :value="STOCK_DIRECTION.IN">入库</el-radio-button>
            <el-radio-button :value="STOCK_DIRECTION.OUT">出库</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="日期" prop="flowDate">
          <el-date-picker v-model="flowForm.flowDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="数量" prop="quantity">
          <!-- 单位内嵌在输入框右侧（2026-08-13），不再另起一行文案 -->
          <el-input-number v-model="flowForm.quantity" :min="1" :precision="0" :controls="false" style="width: 100%">
            <template #suffix>{{ flowRow ? unitLabel(flowRow.unit) : '' }}</template>
          </el-input-number>
        </el-form-item>
        <el-form-item label="原因" prop="reason">
          <!-- 选项随「方向」切换只列本向预设（key 强制重建，避免残留对向高亮）；仍可手输 -->
          <el-select
            :key="flowForm.direction"
            v-model="flowForm.reason" filterable allow-create default-first-option
            placeholder="可选择或直接输入" style="width: 100%"
          >
            <el-option v-for="r in flowReasonOptions" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="flowForm.remark" maxlength="255" show-word-limit />
        </el-form-item>
        <div class="preview" :class="{ bad: previewFlowBalance < 0 }">
          变动后结存：<b>{{ previewFlowBalance }}</b> {{ flowRow ? unitLabel(flowRow.unit) : '' }}
          {{ previewFlowBalance < 0 ? '（为负，将被拒绝）' : '' }}
        </div>
      </el-form>
      <template #footer>
        <el-button size="small" @click="flowVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSubmitFlow">确定</el-button>
      </template>
    </el-dialog>

    <!--
      批量导入。呆滞品刻意不设唯一键（同货号同客户先后剩下的几批要各建各的档），
      所以导入是「每行新建一条」，重复导入会重复建档——提示条里必须说清楚。
    -->
    <import-dialog
      v-model="importVisible"
      title="批量导入呆滞品"
      tip="每一行都会新建一条呆滞品记录（本模块允许同货号多批，不会合并、不会覆盖）；整批校验通过才入库，任一行有问题会列出行号并整批回滚"
      confirm-text="即将导入文件「{n}」，每一行都会<b>新建</b>一条呆滞品记录。<br/>同一份文件重复导入会<b>重复建档</b>，请确认没有导过。"
      :download-template="downloadDullStockTemplate"
      :do-import="importDullStock"
      :summarize="(r: any) => `导入成功：新建 ${r.created} 条呆滞品记录`"
      @done="reload"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  Search, Plus, EditPen, Delete, Sort, InfoFilled, Upload, Download,
} from '@element-plus/icons-vue';
import {
  getDullStockList,
  getDullStockSummary,
  getDullStockFlows,
  createDullStock,
  updateDullStock,
  deleteDullStock,
  createDullStockFlow,
  deleteDullStockFlow,
  downloadDullStockExport,
  downloadDullStockTemplate,
  importDullStock,
  type DullStockRow,
  type DullStockFlowRow,
} from '@/api/dull-stock';
import ImportDialog from '@/components/ImportDialog.vue';
import { useExcelExport } from '@/composables/useExcelExport';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import { getAllCustomers, type CustomerItem } from '@/api/customer';
import {
  SIDE_OPTIONS,
  RAIL_SECTION_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  UNIT_OPTIONS,
  // 数值对象在 dict.ts 里统一以 _VALUE 结尾（§4.1 命名约定）
  STOCK_DIRECTION_VALUE as STOCK_DIRECTION,
  SURFACE_DEFAULT_COLOR,
  sideLabel,
  railSectionLabel,
  normalizeProductTypes,
  parseProductTypes,
  hasSocket,
  labelOf,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

/**
 * 呆滞品**自己的**颜色开关（系统配置 → 业务字段 → 呆滞品颜色）。
 *
 * 刻意不用全局的 `colorEnabled`：呆滞品建档时表面处理与颜色是配套联动带出的
 * （电泳→黑色 / 喷涂→白色），颜色是这本账辨认货物的主要依据；全局颜色开关
 * 是给「订单/外发口径用不到颜色」的厂关的。两者各管各的，**不要相与**。
 */
const { dullStockColorEnabled: colorEnabled } = useFeatureFlags();

const today = () => new Date().toISOString().slice(0, 10);
const unitLabel = (unit: string) => labelOf(UNIT_OPTIONS, unit);

/**
 * 出入库原因预设，**按方向分列**（2026-08-13）：入库单只该选入向原因，
 * 混在一张列表里迟早有人给出库单选上「退货入库」。仅前端引导，
 * 服务端不做枚举校验（「原因」本质是自由文本），仍可手输。
 * （flowReasonOptions 依赖 flowForm，定义在下方 flowForm 之后。）
 */
const FLOW_REASON_PRESETS: Record<number, string[]> = {
  [STOCK_DIRECTION.IN]: ['退货入库', '盘盈入库'],
  [STOCK_DIRECTION.OUT]: ['销售出库', '清库处理', '降价销售', '内部领用', '盘亏出库'],
};

const loading = ref(false);
const saving = ref(false);
const list = ref<DullStockRow[]>([]);
const total = ref(0);
const summary = ref({ rows: 0, totalBalancePcs: 0 });
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  surfaceType: undefined as string | undefined,
  side: undefined as string | undefined,
  onlyInStock: true,
});

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
const colorDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_color').then((rows: any[]) => {
  colorDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
const dictLabel = (dict: Array<{ label: string; value: string }>, v: string) =>
  dict.find((d) => d.value === v)?.label || v || '—';

const customers = ref<CustomerItem[]>([]);
getAllCustomers().then((rows) => (customers.value = rows));

async function load() {
  loading.value = true;
  try {
    const [res, sum] = await Promise.all([
      getDullStockList({ ...query }),
      getDullStockSummary({ ...query }),
    ]);
    list.value = res.list;
    total.value = res.total;
    summary.value = sum;
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

/* ===== 批量导入 / 导出 ===== */
const importVisible = ref(false);
const { exporting, exportWithConfirm } = useExcelExport();

const onExport = () => exportWithConfirm({
  name: '呆滞品',
  // 实查而不是用页面上的 summary：筛选条件改了但没点「查询」时汇总是旧的
  getCount: async () => (await getDullStockSummary({ ...query })).rows,
  run: () => downloadDullStockExport({ ...query }),
});

/* ===== 展开行：出入库流水（按需加载） ===== */
const flows = reactive<Record<number, DullStockFlowRow[]>>({});
const flowLoadingId = ref<number | null>(null);

async function onExpand(row: DullStockRow, expandedRows: DullStockRow[]) {
  const isOpen = Array.isArray(expandedRows)
    ? expandedRows.some((r) => r.id === row.id)
    : !!expandedRows;
  if (!isOpen || flows[row.id]) return;
  await loadFlows(row.id);
}

async function loadFlows(id: number) {
  flowLoadingId.value = id;
  try {
    const res = await getDullStockFlows({ dullId: id, pageSize: 100 });
    flows[id] = res.list;
  } finally {
    flowLoadingId.value = null;
  }
}

/** 改过数的行，展开缓存已过期，清掉让下次展开重新拉 */
function dropFlowCache(id?: number) {
  if (id != null) delete flows[id];
  else Object.keys(flows).forEach((k) => delete flows[Number(k)]);
}

async function onDeleteFlow(row: DullStockRow, flow: DullStockFlowRow) {
  const dir = flow.direction === STOCK_DIRECTION.IN ? '入库' : '出库';
  await ElMessageBox.confirm(
    `确定删除这笔 ${flow.flowDate} 的${dir} ${flow.quantity} ${unitLabel(row.unit)} 吗？删除后结存会跟着回滚。`,
    '删除出入库流水',
    { type: 'warning' },
  );
  const res = await deleteDullStockFlow(flow.id);
  ElMessage.success(`已删除，当前结存 ${res.balanceQty} ${unitLabel(row.unit)}`);
  await loadFlows(row.id);
  load();
}

/* ===== 建档 / 编辑 ===== */
const formVisible = ref(false);
const editRow = ref<DullStockRow | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({
  itemNo: '',
  customerName: '',
  productionNo: '',
  productModel: '',
  productTypes: [] as string[],
  railSection: '' as string | undefined,
  dimensionMm: 0,
  surfaceType: 'electrophoresis',
  color: '黑色',
  side: '' as string | undefined,
  // 默认「套」（2026-08-13 使用部门要求；车间盘点习惯按套报数）
  unit: 'set',
  openingQty: 0,
  remark: '',
});

/**
 * 单位复选框的单选语义：勾另一个 → 切换；点掉当前已勾中的 → 忽略。
 * 单位必选其一，允许取消会出现「两个都没勾」的空档。
 */
function onUnitCheck(value: string, checked: unknown) {
  if (checked) form.unit = value;
}

/**
 * 客户 / 生产单号**至少填一项**。
 *
 * 呆滞品脱离了订单，这两项是日后认领这批货的仅有线索，两个都空的档案
 * 事后没人说得清是谁的货、从哪张单剩下的。二者互为条件，故两个字段各挂
 * 一条同样的校验，并在任一变动时联动重校，否则填了其中一个另一个的
 * 红字不会自己消。服务端另有一道同样的校验（前端拦的是手滑，API 直调拦不住）。
 */
const validateSource = (_rule: unknown, _value: unknown, callback: (e?: Error) => void) => {
  const filled = !!form.customerName?.trim() || !!form.productionNo?.trim();
  callback(filled ? undefined : new Error('客户与生产单号至少填写一项'));
};

const rules: FormRules = {
  itemNo: [{ required: true, message: '请填写货号', trigger: 'blur' }],
  customerName: [{ validator: validateSource, trigger: ['blur', 'change'] }],
  productionNo: [{ validator: validateSource, trigger: ['blur', 'change'] }],
  unit: [{ required: true, message: '请选择单位', trigger: 'change' }],
  openingQty: [{ required: true, message: '请填写期初数', trigger: 'blur' }],
};

/**
 * openForm 赋值期间抑制联动重校。缺了它会打开弹窗就闪红字：
 * openForm 的字段赋值触发本 watch 时 formVisible 已翻真，validateField 的
 * 异步错误态与 nextTick 里的 clearValidate 存在微任务竞争，竞争结果取决于
 * async-validator 内部实现——不能赌，用标志位把这段窗口整个关掉。
 */
let suppressCrossValidate = false;

watch(
  () => [form.customerName, form.productionNo],
  () => {
    if (!formVisible.value || suppressCrossValidate) return;
    // 任一填上，另一个的红字要跟着消（validateField 校验不过会 reject，吞掉即可）
    formRef.value?.validateField(['customerName', 'productionNo']).catch(() => {});
  },
);

/** 已有流水的记录不许改单位 */
const hasFlow = computed(
  () => !!editRow.value && (editRow.value.inboundQty > 0 || editRow.value.outboundQty > 0),
);

/** 边别只在产品类型含「卡口」时可用（含卡口才分左右） */
const sideEnabled = computed(() => hasSocket(form.productTypes));

watch(sideEnabled, (on) => {
  if (!on) form.side = '';
});

const previewBalance = computed(() =>
  editRow.value
    ? (form.openingQty || 0) + editRow.value.inboundQty - editRow.value.outboundQty
    : form.openingQty || 0,
);

/**
 * 表面处理联动颜色：只在颜色为空、或还是上一个表面处理带出的默认色时才改写，
 * 用户手工填过的颜色不能被覆盖。
 */
function onSurfaceChange(next: string) {
  const preset = SURFACE_DEFAULT_COLOR[next];
  if (!preset) return;
  const isUntouched =
    !form.color || Object.values(SURFACE_DEFAULT_COLOR).includes(form.color);
  if (isUntouched) form.color = preset;
}

function openForm(row?: DullStockRow) {
  suppressCrossValidate = true;
  editRow.value = row ?? null;
  form.itemNo = row?.itemNo ?? '';
  form.customerName = row?.customerName ?? '';
  form.productionNo = row?.productionNo ?? '';
  form.productModel = row?.productModel ?? '';
  form.productTypes = parseProductTypes(row?.productType ?? '');
  form.railSection = row?.railSection ?? '';
  form.dimensionMm = row?.dimensionMm ?? 0;
  // 新增默认「电泳 / 黑色」——厂里呆滞品绝大多数是这个搭配
  form.surfaceType = row?.surfaceType ?? 'electrophoresis';
  form.color = row ? row.color : '黑色';
  form.side = row?.side ?? '';
  form.unit = row?.unit ?? 'piece';
  form.openingQty = row?.openingQty ?? 0;
  form.remark = row?.remark ?? '';
  formVisible.value = true;
  // 刚打开就飘红不合理（用户还没动手）：清掉上一次遗留的校验状态，再放开联动重校
  nextTick(() => {
    formRef.value?.clearValidate();
    suppressCrossValidate = false;
  });
}

async function onSubmitForm() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = {
      itemNo: form.itemNo.trim(),
      customerName: form.customerName?.trim() || undefined,
      productionNo: form.productionNo?.trim() || undefined,
      productModel: form.productModel?.trim() || undefined,
      // 组合串必须规范化后再传，否则「普通,自锁」与「自锁,普通」在筛选与型号上表现不一致
      productType: normalizeProductTypes(form.productTypes),
      railSection: form.railSection || undefined,
      dimensionMm: form.dimensionMm || undefined,
      surfaceType: form.surfaceType || undefined,
      color: form.color || undefined,
      side: sideEnabled.value ? (form.side || '') : '',
      unit: form.unit,
      openingQty: form.openingQty || 0,
      remark: form.remark || undefined,
    };
    const res = editRow.value
      ? await updateDullStock(editRow.value.id, payload)
      : await createDullStock(payload);
    ElMessage.success(`${editRow.value ? '已保存' : '已新增'}，当前结存 ${res.balanceQty} ${unitLabel(form.unit)}`);
    formVisible.value = false;
    dropFlowCache(editRow.value?.id);
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: DullStockRow) {
  await ElMessageBox.confirm(
    `确定删除呆滞品「${row.itemNo}${row.productModel ? ' / ' + row.productModel : ''}」吗？`,
    '删除呆滞品',
    { type: 'warning' },
  );
  await deleteDullStock(row.id);
  ElMessage.success('已删除');
  dropFlowCache(row.id);
  load();
}

/* ===== 登记出入库 ===== */
const flowVisible = ref(false);
const flowRow = ref<DullStockRow | null>(null);
const flowFormRef = ref<FormInstance>();
const flowForm = reactive({
  direction: STOCK_DIRECTION.IN as number,
  quantity: 1,
  flowDate: today(),
  reason: '',
  remark: '',
});

/** 当前方向的原因预设（入向/出向各一列，见 FLOW_REASON_PRESETS） */
const flowReasonOptions = computed(() => FLOW_REASON_PRESETS[flowForm.direction] ?? []);

// 切方向时，已选的若是**对向预设**就清空（选着「退货入库」切到出库，留着必错）；
// 手输的自由文本不动——那是用户自己的措辞，方向切换不该吞掉
watch(() => flowForm.direction, () => {
  const allPresets = Object.values(FLOW_REASON_PRESETS).flat();
  if (
    flowForm.reason
    && allPresets.includes(flowForm.reason)
    && !flowReasonOptions.value.includes(flowForm.reason)
  ) {
    flowForm.reason = '';
  }
});

const flowRules: FormRules = {
  direction: [{ required: true, message: '请选择方向', trigger: 'change' }],
  quantity: [{ required: true, message: '请填写数量', trigger: 'blur' }],
  flowDate: [{ required: true, message: '请选择日期', trigger: 'change' }],
  reason: [{ required: true, message: '请填写原因', trigger: 'change' }],
};

const previewFlowBalance = computed(() => {
  if (!flowRow.value) return 0;
  return flowRow.value.balanceQty + flowForm.direction * (flowForm.quantity || 0);
});

function openFlow(row: DullStockRow) {
  flowRow.value = row;
  flowForm.direction = STOCK_DIRECTION.IN;
  flowForm.quantity = 1;
  flowForm.flowDate = today();
  flowForm.reason = '';
  flowForm.remark = '';
  flowVisible.value = true;
}

async function onSubmitFlow() {
  await flowFormRef.value?.validate();
  if (!flowRow.value) return;
  saving.value = true;
  try {
    const res = await createDullStockFlow(flowRow.value.id, {
      direction: flowForm.direction,
      quantity: flowForm.quantity,
      flowDate: flowForm.flowDate,
      reason: flowForm.reason.trim(),
      remark: flowForm.remark || undefined,
    });
    ElMessage.success(`已登记，当前结存 ${res.balanceQty} ${unitLabel(flowRow.value.unit)}`);
    flowVisible.value = false;
    dropFlowCache(flowRow.value.id);
    load();
  } finally {
    saving.value = false;
  }
}
</script>

<script lang="ts">
export default { name: 'DullStock' };
</script>

<style scoped lang="scss">
.toolbar {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
  .tip {
    display: flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--el-text-color-secondary);
    b { color: var(--el-text-color-primary); }
  }
  .total { margin-left: auto; font-size: 12px; color: var(--el-text-color-secondary); }
  .total b { color: var(--el-color-primary); font-size: 14px; }
}
.pager { margin-top: 12px; }
.mb12 { margin-bottom: 12px; }
.preview {
  margin: 4px 0 0 90px; font-size: 13px; color: var(--el-color-primary);
  &.bad { color: var(--el-color-danger); }
}
.num-ok { color: var(--el-color-success); font-weight: 600; }
.num-zero { color: var(--el-text-color-placeholder); }
.delta-in { color: var(--el-color-success); font-weight: 600; }
.delta-out { color: var(--el-color-danger); font-weight: 600; }
.expand-wrap { padding: 8px 16px 8px 56px; }
.expand-grid {
  width: 100%; max-width: 1200px; border-collapse: collapse; font-size: 13px;
  th, td { border: 1px solid var(--el-border-color); padding: 5px 10px; text-align: left; }
  th { background: var(--el-fill-color-light); font-weight: 600; text-align: center; white-space: nowrap; }
  .c { text-align: center; }
}
</style>
