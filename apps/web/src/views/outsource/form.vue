<template>
  <div class="page">
    <el-card shadow="never" v-loading="pageLoading">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">{{ editId ? '编辑发坯单' : '新增发坯单' }}</span>
          <span v-if="blankNo" class="title-sub">{{ formatBlankNo(blankNo) }}</span>
        </div>
        <div>
          <!-- 已建单才可打印：新建态还没有发坯单号，印出来 No. 是空的 -->
          <el-button
            v-if="editId"
            size="small" v-permission.disable="'outsource:print'" :icon="Printer"
            @click="openPrint"
          >打印发外单</el-button>
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <div class="section-title">单据信息</div>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="加工商" prop="processorName">
              <el-input v-model="form.processorName" placeholder="外协加工厂名称" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="表面处理" prop="surfaceType">
              <el-select v-model="form.surfaceType" placeholder="选择表面处理" style="width: 100%" @change="onSurfaceChange">
                <el-option v-for="o in outsourceSurfaces" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="颜色">
              <el-input v-model="form.color" placeholder="如 黑色" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="计划发外">
              <el-date-picker v-model="form.planSendDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="要求回货">
              <el-date-picker v-model="form.requireBackDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="18">
            <el-form-item label="备注">
              <el-input v-model="form.remark" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="section-title">
          发出明细
          <el-button size="small" type="primary" plain :icon="Plus" class="ml12" @click="openPicker">添加部件组</el-button>
          <span class="sec-sum">
            合计 <b>{{ totalQty }}</b> 支 ／ <b>{{ totalWeight }}</b> kg
          </span>
        </div>

        <el-table :data="form.items" border stripe size="small" empty-text="请点击「添加部件组」选择要发外的产品">
          <el-table-column type="index" label="#" width="46" align="center" />
          <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
          <el-table-column label="生产单号" prop="productionNo" width="120" show-overflow-tooltip />
          <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
          <el-table-column label="规格" prop="dimensionText" width="90" align="center" />
          <el-table-column label="客户" prop="customerName" width="120" show-overflow-tooltip />
          <el-table-column label="组需求/已发" width="110" align="center">
            <template #default="{ row }">{{ row.qtyPcs }} / {{ row.sentQty }}</template>
          </el-table-column>
          <el-table-column label="发出重量(kg)" width="120" align="center">
            <template #default="{ row }">
              <el-input-number
                v-model="row.sendWeight" :min="0" :precision="2" :step="1" :controls="false"
                style="width: 100%" @change="() => syncQty(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="单重(kg/支)" width="115" align="center">
            <template #default="{ row }">
              <el-input-number
                v-model="row.unitWeight" :min="0" :precision="4" :step="0.01" :controls="false"
                style="width: 100%" @change="() => syncQty(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="发出数量(支)" width="120" align="center">
            <template #default="{ row }">
              <el-input-number v-model="row.sendQty" :min="1" :precision="0" :step="1" :controls="false" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="120">
            <template #default="{ row }">
              <el-input v-model="row.remark" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center" fixed="right">
            <template #default="{ $index }">
              <el-button size="small" link type="danger" :icon="Delete" @click="form.items.splice($index, 1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
    </el-card>

    <!-- 可发外部件组选择器 -->
    <el-dialog v-model="pickerVisible" title="选择要发外的部件组" width="1000px" top="6vh" @open="loadOptions">
      <div class="picker-bar">
        <el-input
          v-model="pickerKeyword"
          clearable
          size="small"
          placeholder="订单号/客户/生产单号/产品型号/图号"
          style="width: 280px"
          @clear="loadOptions"
          @keyup.enter="loadOptions"
        />
        <el-button size="small" type="primary" :icon="Search" @click="loadOptions">查询</el-button>
        <span class="picker-tip">仅列出表面处理非「无」的产品；已发数为全部未作废发坯单合计</span>
      </div>
      <el-table
        ref="pickerTableRef"
        :data="options"
        v-loading="pickerLoading"
        border stripe size="small" height="52vh"
        @selection-change="onPickChange"
      >
        <el-table-column type="selection" width="42" :selectable="isSelectable" />
        <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
        <el-table-column label="客户" prop="customerName" width="120" show-overflow-tooltip />
        <el-table-column label="生产单号" prop="productionNo" width="120" show-overflow-tooltip />
        <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
        <el-table-column label="规格" prop="dimensionText" width="90" align="center" />
        <el-table-column label="表面处理" width="100" align="center">
          <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
        </el-table-column>
        <el-table-column label="组需求(支)" prop="qtyPcs" width="100" align="center" />
        <el-table-column label="已发(支)" prop="sentQty" width="90" align="center" />
        <el-table-column label="剩余(支)" width="90" align="center">
          <template #default="{ row }">
            <span :class="{ 'remain-zero': row.remainQty <= 0 }">{{ row.remainQty }}</span>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <span class="picker-count">已选 {{ picked.length }} 条</span>
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
import { Back, Plus, Delete, Search, Printer } from '@element-plus/icons-vue';
import {
  getOutsourceDetail,
  getPartGroupOptions,
  createOutsource,
  updateOutsource,
  type PartGroupOption,
} from '@/api/outsource';
import { SURFACE_NONE, formatBlankNo, qtyFromWeight } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';

const route = useRoute();
const router = useRouter();
const editId = ref<number | null>(route.query.id ? Number(route.query.id) : null);
const blankNo = ref('');

const pageLoading = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();

/** 明细行（含选择器带来的展示字段，提交时只取锚点与数量口径） */
interface ItemRow {
  orderPartGroupId: number;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  qtyPcs: number;
  sentQty: number;
  sendWeight: number;
  unitWeight: number;
  sendQty: number;
  remark: string;
}

const form = reactive({
  processorName: '',
  surfaceType: '',
  color: '',
  planSendDate: '' as string | null,
  requireBackDate: '' as string | null,
  remark: '',
  items: [] as ItemRow[],
});

const rules: FormRules = {
  processorName: [{ required: true, message: '请填写加工商', trigger: 'blur' }],
  surfaceType: [{ required: true, message: '请选择表面处理', trigger: 'change' }],
};

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
/** 外发可选表面处理 = 字典项去掉保留值 none（无表面处理不外发） */
const outsourceSurfaces = computed(() => surfaceDict.value.filter((o) => o.value !== SURFACE_NONE));

const totalQty = computed(() => form.items.reduce((s, it) => s + (it.sendQty || 0), 0));
const totalWeight = computed(
  () => Math.round(form.items.reduce((s, it) => s + (it.sendWeight || 0), 0) * 100) / 100,
);

async function init() {
  if (!editId.value) return;
  pageLoading.value = true;
  try {
    const doc = await getOutsourceDetail(editId.value);
    blankNo.value = doc.blankNo;
    form.processorName = doc.processorName;
    form.surfaceType = doc.surfaceType;
    form.color = doc.color ?? '';
    form.planSendDate = doc.planSendDate ? String(doc.planSendDate).slice(0, 10) : '';
    form.requireBackDate = doc.requireBackDate ? String(doc.requireBackDate).slice(0, 10) : '';
    form.remark = doc.remark ?? '';
    form.items = (doc.items ?? []).map((it) => ({
      orderPartGroupId: it.orderPartGroupId,
      orderNo: it.orderNo,
      customerName: it.customerName,
      productionNo: it.productionNo,
      productModel: it.productModel,
      dimensionText: it.dimensionText,
      // 组需求与「他单已发」由详情接口带出（已排除本单，口径同选择器），供编辑时对照超发
      qtyPcs: it.qtyPcs ?? 0,
      sentQty: it.sentQty ?? 0,
      sendWeight: Number(it.sendWeight) || 0,
      unitWeight: Number(it.unitWeight) || 0,
      sendQty: it.sendQty,
      remark: it.remark ?? '',
    }));
  } finally {
    pageLoading.value = false;
  }
}
init();

/** 重量或单重变化 → 自动折算发出数量（共享包同一口径，仍可人工微调） */
function syncQty(row: ItemRow) {
  const qty = qtyFromWeight(row.sendWeight, row.unitWeight);
  if (qty > 0) row.sendQty = qty;
}

function onSurfaceChange() {
  // 表面处理变了，选择器的候选集合随之变化，已选明细保留由用户自行核对
  options.value = [];
}

/* ===== 可发外部件组选择器 ===== */
const pickerVisible = ref(false);
const pickerLoading = ref(false);
const pickerKeyword = ref('');
const options = ref<PartGroupOption[]>([]);
const picked = ref<PartGroupOption[]>([]);
const pickerTableRef = ref<any>();

function openPicker() {
  if (!form.surfaceType) {
    ElMessage.warning('请先选择表面处理，再添加部件组');
    return;
  }
  pickerVisible.value = true;
}
async function loadOptions() {
  pickerLoading.value = true;
  try {
    options.value = await getPartGroupOptions({
      keyword: pickerKeyword.value || undefined,
      surfaceType: form.surfaceType || undefined,
      excludeDocId: editId.value ?? undefined,
      limit: 300,
    });
  } finally {
    pickerLoading.value = false;
  }
}
/** 已在明细中的部件组不可重复选择 */
function isSelectable(row: PartGroupOption): boolean {
  return !form.items.some((it) => it.orderPartGroupId === row.orderPartGroupId);
}
function onPickChange(rows: PartGroupOption[]) {
  picked.value = rows;
}
function confirmPick() {
  picked.value.forEach((o) => {
    if (form.items.some((it) => it.orderPartGroupId === o.orderPartGroupId)) return;
    const sendQty = o.remainQty > 0 ? o.remainQty : o.qtyPcs;
    form.items.push({
      orderPartGroupId: o.orderPartGroupId,
      orderNo: o.orderNo,
      customerName: o.customerName,
      productionNo: o.productionNo,
      productModel: o.productModel,
      dimensionText: o.dimensionText,
      qtyPcs: o.qtyPcs,
      sentQty: o.sentQty,
      unitWeight: o.unitWeight,
      // 单重已知时按剩余支数反算默认重量，未知则留 0 由人工录入
      sendWeight: o.unitWeight > 0 ? Math.round(sendQty * o.unitWeight * 100) / 100 : 0,
      sendQty,
      remark: '',
    });
  });
  picked.value = [];
  pickerTableRef.value?.clearSelection?.();
  pickerVisible.value = false;
}

function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}

/* ===== 保存 ===== */
async function onSave() {
  await formRef.value?.validate();
  if (!form.items.length) {
    ElMessage.warning('请至少添加一条发出明细');
    return;
  }
  const bad = form.items.findIndex((it) => !it.sendQty || it.sendQty <= 0);
  if (bad >= 0) {
    ElMessage.warning(`第 ${bad + 1} 行发出数量必须大于 0`);
    return;
  }
  const payload = {
    processorName: form.processorName,
    surfaceType: form.surfaceType,
    color: form.color || undefined,
    planSendDate: form.planSendDate || undefined,
    requireBackDate: form.requireBackDate || undefined,
    remark: form.remark || undefined,
    items: form.items.map((it, i) => ({
      orderPartGroupId: it.orderPartGroupId,
      sendWeight: it.sendWeight || 0,
      unitWeight: it.unitWeight || 0,
      sendQty: it.sendQty,
      remark: it.remark || undefined,
      sort: i,
    })),
  };
  saving.value = true;
  try {
    if (editId.value) {
      await updateOutsource(editId.value, payload);
      ElMessage.success('保存成功');
    } else {
      const res = await createOutsource(payload);
      ElMessage.success(`发坯单 ${formatBlankNo(res.blankNo)} 创建成功`);
    }
    goBack();
  } finally {
    saving.value = false;
  }
}

function openPrint() {
  router.push({ name: 'OutsourcePrint', query: { id: editId.value } });
}

function goBack() {
  router.push('/outsource');
}
</script>

<script lang="ts">
export default { name: 'OutsourceForm' };
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
.remain-zero { color: var(--el-color-warning); }
</style>
