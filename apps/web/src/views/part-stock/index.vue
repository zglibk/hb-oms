<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword" clearable style="width: 200px" placeholder="货号 / 料厚"
            @input="scheduleKeywordSearch" @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="部件">
          <el-select v-model="query.partType" clearable placeholder="全部" style="width: 110px" @change="runKeywordSearch">
            <el-option v-for="o in PART_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="边别">
          <el-select v-model="query.side" clearable placeholder="全部" style="width: 100px" @change="runKeywordSearch">
            <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="节数">
          <el-select v-model="query.railSection" clearable placeholder="全部" style="width: 120px" @change="runKeywordSearch">
            <el-option v-for="o in RAIL_SECTION_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品类型">
          <el-select v-model="query.productType" clearable placeholder="全部" style="width: 110px" @change="runKeywordSearch">
            <el-option v-for="o in PRODUCT_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyInStock" @change="runKeywordSearch">只看有余量</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'part-stock:adjust'" type="primary" :icon="Plus" @click="openAdjust()">
          调整余量
        </el-button>
        <el-button size="small" v-permission="'part-stock:import'" :icon="Upload" @click="importVisible = true">
          批量导入
        </el-button>
        <el-button
          size="small" v-permission="'part-stock:export'" :icon="Download"
          :loading="exporting" @click="onExport"
        >导出</el-button>
        <span class="tip">
          <el-icon><InfoFilled /></el-icon>
          V1 为<b>独立参考台账</b>：只有「期初录入 + 手工调整」两个入口，
          <b>不与外发/成品单据联动</b>；每次余量变动都会留一条流水，点行首箭头可展开查看。
        </span>
        <span class="total">当前筛选合计 <b>{{ summary.totalQty }}</b> 支 / {{ summary.rows }} 行</span>
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
                    <th>时间</th><th>来源</th><th>调整量</th><th>调整后余量</th><th>原因</th><th>操作人</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in flows[row.id]" :key="f.id">
                    <td class="c">{{ (f.createdAt || '').replace('T', ' ').slice(0, 19) }}</td>
                    <td class="c">
                      <el-tag size="small" :type="tagTypeOf(PART_ADJUST_SOURCE, f.source)">
                        {{ labelOf(PART_ADJUST_SOURCE, f.source) }}
                      </el-tag>
                    </td>
                    <td class="c">
                      <span :class="f.delta > 0 ? 'delta-in' : 'delta-out'">
                        {{ f.delta > 0 ? '+' : '' }}{{ f.delta }}
                      </span>
                    </td>
                    <td class="c">{{ f.quantityAfter }}</td>
                    <td>{{ f.reason }}</td>
                    <td class="c">{{ f.creatorName || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <el-empty v-else description="暂无变动流水" :image-size="48" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="货号" width="100" align="center">
          <template #default="{ row }">
            {{ row.itemNo }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="部件" width="90" align="center">
          <template #default="{ row }">{{ partTypeLabel(row.partType) }}</template>
        </el-table-column>
        <el-table-column label="边别" width="70" align="center">
          <template #default="{ row }">{{ sideLabel(row.side) || '—' }}</template>
        </el-table-column>
        <el-table-column label="产品类型" min-width="130" align="center">
          <template #default="{ row }">{{ formatProductTypes(row.productType) || '—' }}</template>
        </el-table-column>
        <el-table-column label="节数" width="100" align="center">
          <template #default="{ row }">{{ railSectionLabel(row.railSection) || '—' }}</template>
        </el-table-column>
        <el-table-column label="料厚" width="120" align="center">
          <template #default="{ row }">{{ row.materialThickness || '—' }}</template>
        </el-table-column>
        <el-table-column label="规格(mm)" width="100" align="center">
          <template #default="{ row }">{{ row.dimensionMm || '—' }}</template>
        </el-table-column>
        <el-table-column label="备注" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="余量(支)" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <span :class="row.quantity > 0 ? 'num-ok' : 'num-zero'">{{ row.quantity }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button
                size="small" v-permission.disable="'part-stock:adjust'" link type="primary" :icon="EditPen"
                @click="openAdjust(row)"
              >调整</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <!-- 调整弹窗：新建行时 7 维可填，既有行锁定 7 维只改数量 -->
    <el-dialog v-model="dialogVisible" :title="editRow ? '调整部件余量' : '新增/调整部件余量'" width="680px">
      <el-alert
        v-if="editRow"
        type="info" :closable="false" show-icon class="mb12"
        :title="`当前余量 ${editRow.quantity} 支；7 维属性是台账唯一键，不可修改——要改属性请把本行调为 0 后另建一行`"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="货号" prop="itemNo">
              <el-input v-model="form.itemNo" :disabled="!!editRow" placeholder="如 53#" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="部件" prop="partType">
              <el-select v-model="form.partType" :disabled="!!editRow" style="width: 100%">
                <el-option v-for="o in PART_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="边别">
              <el-select v-model="form.side" :disabled="!!editRow" clearable placeholder="非卡口留空" style="width: 100%">
                <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="节数">
              <el-select v-model="form.railSection" :disabled="!!editRow" clearable style="width: 100%">
                <el-option v-for="o in RAIL_SECTION_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品类型">
              <el-select
                v-model="form.productTypes" :disabled="!!editRow" multiple collapse-tags
                placeholder="可多选" style="width: 100%"
              >
                <el-option v-for="o in PRODUCT_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="料厚">
              <el-input v-model="form.materialThickness" :disabled="!!editRow" placeholder="如 1.2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="规格(mm)">
              <el-input-number v-model="form.dimensionMm" :disabled="!!editRow" :min="0" :precision="0" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="调整量" prop="delta">
              <el-input-number v-model="form.delta" :precision="0" :step="1" style="width: 100%" />
              <div class="hint">正为增、负为减；不接受 0</div>
            </el-form-item>
          </el-col>
          <!-- 调整原因收敛成几个预设，便于事后按类统计；选「其他」再补充具体原因，
               否则流水上留一个光秃秃的「其他」等于没写，失去追溯意义 -->
          <el-col :span="isOtherReason ? 10 : 24">
            <el-form-item label="调整原因" prop="reason">
              <el-select v-model="form.reason" placeholder="请选择" style="width: 100%">
                <el-option v-for="r in PART_ADJUST_REASON_OPTIONS" :key="r" :label="r" :value="r" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="isOtherReason" :span="14">
            <el-form-item label="具体原因" prop="reasonDetail" label-width="80px">
              <el-input
                v-model="form.reasonDetail" placeholder="请说明具体原因" maxlength="240" show-word-limit
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" />
            </el-form-item>
          </el-col>
        </el-row>
        <div v-if="previewQty !== null" class="preview" :class="{ bad: previewQty < 0 }">
          调整后余量：<b>{{ previewQty }}</b> 支{{ previewQty < 0 ? '（为负，将被拒绝）' : '' }}
        </div>
      </el-form>
      <template #footer>
        <el-button size="small" @click="dialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!--
      批量导入 = **批量调整余量**。部件台账没有「直接设余量」的通道（§4.6 不直接改数无痕），
      所以模板填的是调整量与原因，导入会在现有余量上加减并逐行留流水——
      重复导入会再加一遍，提示条里必须讲清楚。
    -->
    <import-dialog
      v-model="importVisible"
      title="批量导入调整余量"
      tip="导入的是「调整量」而不是「余量」：每行会在现有余量上加减并留一条流水。整批校验通过才落库，任一行失败整批回滚"
      confirm-text="即将导入文件「{n}」，每一行都会按<b>调整量</b>在现有余量上<b>加减</b>并留一条流水。<br/>同一份文件重复导入会<b>再加一遍</b>，请确认没有导过。"
      :download-template="downloadPartStockTemplate"
      :do-import="importPartStock"
      :summarize="(r: any) => `导入成功：${r.affected} 行余量已调整`"
      @done="reload"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Search, Plus, EditPen, InfoFilled, Upload, Download } from '@element-plus/icons-vue';
import {
  getPartStockList,
  getPartStockSummary,
  getPartAdjustList,
  adjustPartStock,
  downloadPartStockExport,
  downloadPartStockTemplate,
  importPartStock,
  type PartBalanceRow,
  type PartAdjustRow,
} from '@/api/part-stock';
import ImportDialog from '@/components/ImportDialog.vue';
import { useExcelExport } from '@/composables/useExcelExport';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import {
  PART_TYPE_OPTIONS,
  SIDE_OPTIONS,
  RAIL_SECTION_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  PART_ADJUST_SOURCE,
  PART_ADJUST_REASON_OPTIONS,
  PART_ADJUST_REASON_OTHER,
  partTypeLabel,
  sideLabel,
  railSectionLabel,
  formatProductTypes,
  normalizeProductTypes,
  parseProductTypes,
  labelOf,
  tagTypeOf,
} from '@/constants/dict';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

const loading = ref(false);
const list = ref<PartBalanceRow[]>([]);
const total = ref(0);
const summary = ref({ rows: 0, totalQty: 0 });
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  partType: undefined as string | undefined,
  side: undefined as string | undefined,
  railSection: undefined as string | undefined,
  productType: undefined as string | undefined,
  onlyInStock: true,
});

async function load() {
  loading.value = true;
  try {
    const [res, sum] = await Promise.all([
      getPartStockList({ ...query }),
      getPartStockSummary({ ...query }),
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
  name: '部件台账',
  // 实查而不是用页面上的 summary：筛选条件改了但没点「查询」时汇总是旧的
  getCount: async () => (await getPartStockSummary({ ...query })).rows,
  run: () => downloadPartStockExport({ ...query }),
});

/* ===== 展开行：变动流水 ===== */
const flows = reactive<Record<number, PartAdjustRow[]>>({});
const flowLoadingId = ref<number | null>(null);

/** 展开时才拉流水：列表页不预取，避免每页多打 N 次请求 */
async function onExpand(row: PartBalanceRow, expandedRows: PartBalanceRow[]) {
  const isOpen = Array.isArray(expandedRows)
    ? expandedRows.some((r) => r.id === row.id)
    : !!expandedRows;
  if (!isOpen || flows[row.id]) return;
  flowLoadingId.value = row.id;
  try {
    const res = await getPartAdjustList({ balanceId: row.id, pageSize: 50 });
    flows[row.id] = res.list;
  } finally {
    flowLoadingId.value = null;
  }
}

/* ===== 调整弹窗 ===== */
const dialogVisible = ref(false);
const saving = ref(false);
const editRow = ref<PartBalanceRow | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({
  itemNo: '',
  partType: 'outer',
  side: '' as string | undefined,
  railSection: '' as string | undefined,
  productTypes: [] as string[],
  materialThickness: '',
  dimensionMm: 0,
  delta: 0,
  reason: '',
  /** 仅「其他」时使用；提交时与 reason 合并成一句落库 */
  reasonDetail: '',
  remark: '',
});

const rules: FormRules = {
  itemNo: [{ required: true, message: '请填写货号', trigger: 'blur' }],
  partType: [{ required: true, message: '请选择部件', trigger: 'change' }],
  delta: [{ required: true, message: '请填写调整量', trigger: 'blur' }],
  reason: [{ required: true, message: '请选择调整原因', trigger: 'change' }],
  reasonDetail: [
    {
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        isOtherReason.value && !String(v ?? '').trim()
          ? cb(new Error('选择「其他」时请说明具体原因'))
          : cb(),
      trigger: 'blur',
    },
  ],
};

/** 选了「其他」才展开具体原因输入框 */
const isOtherReason = computed(() => form.reason === PART_ADJUST_REASON_OTHER);

/** 既有行才能预览调整后余量（新建行基数未知） */
const previewQty = computed(() =>
  editRow.value ? (editRow.value.quantity || 0) + (form.delta || 0) : null,
);

function openAdjust(row?: PartBalanceRow) {
  editRow.value = row ?? null;
  form.itemNo = row?.itemNo ?? '';
  form.partType = row?.partType ?? 'outer';
  form.side = row?.side ?? '';
  form.railSection = row?.railSection ?? '';
  form.productTypes = parseProductTypes(row?.productType ?? '');
  form.materialThickness = row?.materialThickness ?? '';
  form.dimensionMm = row?.dimensionMm ?? 0;
  form.delta = 0;
  form.reason = '';
  form.reasonDetail = '';
  form.remark = row?.remark ?? '';
  dialogVisible.value = true;
}

async function onSubmit() {
  await formRef.value?.validate();
  if (!form.delta) {
    ElMessage.warning('调整量不能为 0');
    return;
  }
  saving.value = true;
  try {
    const res = await adjustPartStock({
      itemNo: form.itemNo.trim(),
      partType: form.partType,
      side: form.side || '',
      railSection: form.railSection || '',
      // 组合串必须规范化后再传，否则「普通,自锁」与「自锁,普通」会分裂成两行
      productType: normalizeProductTypes(form.productTypes),
      materialThickness: form.materialThickness.trim(),
      dimensionMm: form.dimensionMm || 0,
      delta: form.delta,
      // 「其他」拼上具体原因一起落库（存成「其他：xxx」），流水上既看得出归类、
      // 又留得住细节；其余预设直接存类目名，便于事后按类统计
      reason: isOtherReason.value
        ? `${PART_ADJUST_REASON_OTHER}：${form.reasonDetail.trim()}`
        : form.reason,
      remark: form.remark || undefined,
    });
    ElMessage.success(`已调整，当前余量 ${res.quantity} 支`);
    dialogVisible.value = false;
    // 展开过的流水已过期，清掉让下次展开重新拉
    Object.keys(flows).forEach((k) => delete flows[Number(k)]);
    load();
  } finally {
    saving.value = false;
  }
}
</script>

<script lang="ts">
export default { name: 'PartStock' };
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
.hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.4; }
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
  width: 100%; max-width: 1100px; border-collapse: collapse; font-size: 13px;
  th, td { border: 1px solid var(--el-border-color); padding: 5px 10px; text-align: left; }
  th { background: var(--el-fill-color-light); font-weight: 600; text-align: center; white-space: nowrap; }
  .c { text-align: center; }
}
</style>
