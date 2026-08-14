<template>
  <div class="page">
    <el-card shadow="never" v-loading="pageLoading">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">{{ editId ? '编辑' : '新增' }}{{ bizLabel }}</span>
          <span v-if="docNo" class="title-sub">{{ docNo }}</span>
        </div>
        <div>
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存草稿</el-button>
        </div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="业务类型">
              <el-tag :type="tagTypeOf(FINISHED_BIZ_TYPE_OPTIONS, form.bizType)">{{ bizLabel }}</el-tag>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="单据日期" prop="docDate">
              <el-date-picker v-model="form.docDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col v-if="isInbound" :xs="24" :sm="12" :md="6">
            <!-- 展示名 2026-08-13 由「班组」改为「车间」，字段仍是 workTeam（命名稳定性约定）；
                 选项走 assembly_workshop 字典（装一~装九），历史自由文本值原样回显 -->
            <el-form-item label="车间">
              <el-select v-model="form.workTeam" clearable placeholder="选填，供追溯" style="width: 100%">
                <el-option v-for="o in workshopDict" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="section-title">
          出入库明细
          <el-button size="small" type="primary" plain :icon="Plus" class="ml12" @click="openPicker">添加产品</el-button>
          <span class="sec-sum">合计 <b>{{ totalQty }}</b> 支</span>
        </div>

        <el-table :data="form.items" border stripe size="small" empty-text="请点击「添加产品」选择要出入库的产品">
          <el-table-column type="index" label="#" width="46" align="center" />
          <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
          <el-table-column label="生产单号" prop="productionNo" width="115" show-overflow-tooltip />
          <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
          <el-table-column label="规格" prop="dimensionText" width="95" align="center" />
          <el-table-column label="表面处理" width="95" align="center">
            <template #default="{ row }">
              <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ surfaceLabel(row.surfaceType) }}</color-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <!-- 「颜色」是可停用的业务字段（§5.7），停用时整列不显示 -->
          <el-table-column v-if="colorEnabled" label="颜色" width="80" align="center">
            <template #default="{ row }">
              <color-tag v-if="row.color" :seed="row.color">{{ row.color }}</color-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="边别" width="70" align="center">
            <template #default="{ row }">
              <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column :label="limitLabel" width="110" align="center">
            <template #default="{ row }">
              <span :class="row.limit > 0 ? 'lim-ok' : 'lim-zero'">{{ row.limit }}</span>
            </template>
          </el-table-column>
          <el-table-column label="数量(支)" width="130" align="center">
            <template #default="{ row }">
              <el-input-number v-model="row.quantity" :min="1" :precision="0" :step="1" :controls="false" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="120">
            <template #default="{ row }"><el-input v-model="row.remark" /></template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center" fixed="right">
            <template #default="{ $index }">
              <el-button size="small" link type="danger" :icon="Delete" @click="form.items.splice($index, 1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="overRows.length" class="over-tip">
          <el-icon><WarningFilled /></el-icon>
          以下行超过{{ limitLabel }}，确认时会被后端拒绝：
          {{ overRows.map((r) => `${r.productModel}${r.side ? ` ${sideLabel(r.side)}边` : ''}（${r.quantity} > ${r.limit}）`).join('；') }}
        </div>
      </el-form>
    </el-card>

    <!-- 产品选择器：按边别展开成可选行（成品是装配产出的整套滑轨，锚订单产品行） -->
    <el-dialog v-model="pickerVisible" title="选择订单产品" width="1040px" top="6vh" @open="loadOptions">
      <div class="picker-bar">
        <el-input
          v-model="pickerKeyword" clearable size="small" style="width: 280px"
          placeholder="订单号/客户/生产单号/型号/货号"
          @clear="loadOptions" @keyup.enter="loadOptions"
        />
        <el-button size="small" type="primary" :icon="Search" @click="loadOptions">查询</el-button>
        <span class="picker-tip">
          {{ isInbound ? '「可入库量」= 已完成装配 − 已入库，为 0 说明装配还没录' : '「当前结存」为出库上限' }}
        </span>
      </div>
      <el-table ref="pickerTableRef" :data="pickerRows" v-loading="pickerLoading" border stripe size="small" height="52vh"
        @selection-change="onPickChange">
        <el-table-column type="selection" width="42" :selectable="isSelectable" />
        <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
        <el-table-column label="客户" prop="customerName" width="110" show-overflow-tooltip />
        <el-table-column label="生产单号" prop="productionNo" width="115" show-overflow-tooltip />
        <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
        <el-table-column label="规格" prop="dimensionText" width="95" align="center" />
        <!-- 选货时也要看得到表面处理与颜色：同货号不同表面处理是两批货，选错了要冲销 -->
        <el-table-column label="表面处理" width="95" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ surfaceLabel(row.surfaceType) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="colorEnabled" label="颜色" width="80" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.color" :seed="row.color">{{ row.color }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="边别" width="70" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="订单数" prop="qtyPcs" width="80" align="center" />
        <el-table-column :label="limitLabel" width="110" align="center">
          <template #default="{ row }">
            <span :class="row.limit > 0 ? 'lim-ok' : 'lim-zero'">{{ row.limit }}</span>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <span class="picker-count">已选 {{ picked.length }} 行</span>
        <el-button size="small" @click="pickerVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="confirmPick">添加到明细</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Back, Plus, Delete, Search, WarningFilled } from '@element-plus/icons-vue';
import {
  getFinishedDocDetail,
  getStockGroupOptions,
  createFinishedDoc,
  updateFinishedDoc,
} from '@/api/finished-stock';
import {
  FINISHED_BIZ_TYPE,
  FINISHED_BIZ_TYPE_OPTIONS,
  labelOf,
  tagTypeOf,
  sideLabel,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import ColorTag from '@/components/ColorTag.vue';

const route = useRoute();
const router = useRouter();
const editId = ref<number | null>(route.query.id ? Number(route.query.id) : null);
const docNo = ref('');
const pageLoading = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();

interface ItemRow {
  orderProductId: number;
  side: string;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  /** 表面处理（字典 surface_type）与颜色：同货号不同表面处理是两批货，选货与核对都要看 */
  surfaceType: string | null;
  color: string | null;
  /** 入库=可入库量，出库=当前结存 */
  limit: number;
  quantity: number;
  remark: string;
}

const form = reactive({
  bizType: (route.query.bizType as string) || FINISHED_BIZ_TYPE.INBOUND,
  docDate: new Date().toISOString().slice(0, 10),
  workTeam: '',
  remark: '',
  items: [] as ItemRow[],
});

/** 车间下拉（字典 assembly_workshop：装一~装九），与装配批次同一套选项 */
const workshopDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('assembly_workshop').then((rows: any[]) => {
  workshopDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

/** 表面处理字典：明细与选货表都要出中文（英文码等于没显示）；取不到回原值 */
const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
function surfaceLabel(v: string | null | undefined): string {
  if (!v) return '—';
  return surfaceDict.value.find((o) => o.value === v)?.label ?? v;
}

/** 「颜色」是可停用的业务字段（§5.7） */
const { colorEnabled } = useFeatureFlags();

const rules: FormRules = {
  docDate: [{ required: true, message: '请选择单据日期', trigger: 'change' }],
};

const isInbound = computed(
  () => form.bizType === FINISHED_BIZ_TYPE.INBOUND || form.bizType === FINISHED_BIZ_TYPE.OPENING_BALANCE,
);
const bizLabel = computed(() => labelOf(FINISHED_BIZ_TYPE_OPTIONS, form.bizType));
const limitLabel = computed(() => (isInbound.value ? '可入库量' : '当前结存'));
const totalQty = computed(() => form.items.reduce((s, it) => s + (it.quantity || 0), 0));
const overRows = computed(() => form.items.filter((it) => (it.quantity || 0) > it.limit));

async function init() {
  if (!editId.value) return;
  pageLoading.value = true;
  try {
    const doc = await getFinishedDocDetail(editId.value);
    docNo.value = doc.docNo;
    form.bizType = doc.bizType;
    form.docDate = String(doc.docDate).slice(0, 10);
    form.workTeam = doc.workTeam ?? '';
    form.remark = doc.remark ?? '';
    form.items = (doc.items ?? []).map((it) => ({
      orderProductId: it.orderProductId,
      side: it.side,
      orderNo: it.orderNo,
      customerName: it.customerName,
      productionNo: it.productionNo,
      productModel: it.productModel,
      dimensionText: it.dimensionText,
      surfaceType: it.surfaceType,
      color: it.color,
      limit: 0,
      quantity: it.quantity,
      remark: it.remark ?? '',
    }));
    await refreshLimits();
  } finally {
    pageLoading.value = false;
  }
}
init();

/** 编辑态回填额度/结存：选项接口按产品行返回，按 (产品行,边别) 对齐 */
async function refreshLimits() {
  if (!form.items.length) return;
  const opts = await getStockGroupOptions({ bizType: form.bizType, limit: 500 });
  const map = new Map<string, number>();
  opts.forEach((o) => {
    o.sides.forEach((s) =>
      map.set(`${o.orderProductId}#${s.side}`, isInbound.value ? s.quota : s.stockQty),
    );
  });
  form.items.forEach((it) => {
    it.limit = map.get(`${it.orderProductId}#${it.side}`) ?? 0;
  });
}

/* ===== 选择器 ===== */
const pickerVisible = ref(false);
const pickerLoading = ref(false);
const pickerKeyword = ref('');
const pickerRows = ref<ItemRow[]>([]);
const picked = ref<ItemRow[]>([]);
const pickerTableRef = ref<any>();

function openPicker() {
  pickerVisible.value = true;
}

/** 选项按边别展开：含卡口的产品展开左右两行，其余一行 */
async function loadOptions() {
  pickerLoading.value = true;
  try {
    const opts = await getStockGroupOptions({
      keyword: pickerKeyword.value || undefined,
      bizType: form.bizType,
      limit: 300,
    });
    pickerRows.value = opts.flatMap((o) =>
      o.sides.map((s) => ({
        orderProductId: o.orderProductId,
        side: s.side,
        orderNo: o.orderNo,
        customerName: o.customerName,
        productionNo: o.productionNo,
        productModel: o.productModel,
        dimensionText: o.dimensionText,
        surfaceType: o.surfaceType,
        color: o.color,
        qtyPcs: o.qtyPcs,
        limit: isInbound.value ? s.quota : s.stockQty,
        quantity: 0,
        remark: '',
      })) as any,
    );
  } finally {
    pickerLoading.value = false;
  }
}
/** 已在明细中的 (产品行,边别) 不可重复选 */
function isSelectable(row: ItemRow): boolean {
  return !form.items.some(
    (it) => it.orderProductId === row.orderProductId && it.side === row.side,
  );
}
function onPickChange(rows: ItemRow[]) {
  picked.value = rows;
}
function confirmPick() {
  picked.value.forEach((o) => {
    if (form.items.some((it) => it.orderProductId === o.orderProductId && it.side === o.side)) return;
    form.items.push({
      orderProductId: o.orderProductId,
      side: o.side,
      orderNo: o.orderNo,
      customerName: o.customerName,
      productionNo: o.productionNo,
      productModel: o.productModel,
      dimensionText: o.dimensionText,
      surfaceType: o.surfaceType,
      color: o.color,
      limit: o.limit,
      // 默认按上限带出，额度为 0 时给 1 让用户自己改（后端仍会拦）
      quantity: o.limit > 0 ? o.limit : 1,
      remark: '',
    });
  });
  picked.value = [];
  pickerTableRef.value?.clearSelection?.();
  pickerVisible.value = false;
}

/* ===== 保存 ===== */
async function onSave() {
  await formRef.value?.validate();
  if (!form.items.length) {
    ElMessage.warning('请至少添加一条明细');
    return;
  }
  const bad = form.items.findIndex((it) => !it.quantity || it.quantity <= 0);
  if (bad >= 0) {
    ElMessage.warning(`第 ${bad + 1} 行数量必须大于 0`);
    return;
  }
  const payload = {
    bizType: form.bizType,
    docDate: form.docDate,
    workTeam: form.workTeam || undefined,
    remark: form.remark || undefined,
    items: form.items.map((it, i) => ({
      orderProductId: it.orderProductId,
      side: it.side,
      quantity: it.quantity,
      remark: it.remark || undefined,
      sort: i,
    })),
  };
  saving.value = true;
  try {
    if (editId.value) {
      await updateFinishedDoc(editId.value, payload);
      ElMessage.success('保存成功');
    } else {
      const res = await createFinishedDoc(payload);
      ElMessage.success(`单据 ${res.docNo} 已保存为草稿，请在列表中确认`);
    }
    goBack();
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/finished-stock');
}
</script>

<script lang="ts">
export default { name: 'FinishedStockForm' };
</script>

<style scoped lang="scss">
.form-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; margin-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  .form-title { display: flex; align-items: center; gap: 12px; }
  .title-text { font-size: 16px; font-weight: 600; }
  .title-sub { color: var(--el-text-color-secondary); font-size: 13px; }
}
.section-title {
  display: flex; align-items: center;
  font-size: 14px; font-weight: 600; margin: 16px 0 12px;
  padding-left: 8px; border-left: 3px solid var(--el-color-primary);
  .ml12 { margin-left: 12px; }
  .sec-sum { margin-left: auto; font-weight: 400; font-size: 13px; color: var(--el-text-color-secondary); }
}
.picker-bar {
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
  .picker-tip { color: var(--el-text-color-secondary); font-size: 12px; }
}
.picker-count { margin-right: auto; float: left; color: var(--el-text-color-secondary); font-size: 13px; line-height: 24px; }
.lim-ok { color: var(--el-color-success); font-weight: 600; }
.lim-zero { color: var(--el-color-danger); font-weight: 600; }
.over-tip {
  display: flex; align-items: center; gap: 6px; margin-top: 10px;
  color: var(--el-color-warning); font-size: 12px;
}
</style>
