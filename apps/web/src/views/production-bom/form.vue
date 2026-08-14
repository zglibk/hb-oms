<template>
  <div class="page">
    <el-card shadow="never" v-loading="pageLoading">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">{{ pageTitle }}</span>
          <color-tag v-if="form.version" :seed="`bom-version-${form.version}`">{{ form.version }}</color-tag>
          <span v-if="readonly" class="view-tip">查看模式</span>
        </div>
        <div v-if="!readonly">
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonly" label-width="88px" size="small">
        <div class="section-title">表头信息</div>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="生产图号" prop="drawingNo">
              <el-select
                v-model="form.drawingNo"
                filterable
                allow-create
                default-first-option
                remote
                reserve-keyword
                :remote-method="loadProcessOptions"
                :loading="processLoading"
                placeholder="选择开单信息或手工输入"
                popper-class="bom-process-popper"
                style="width: 100%"
                @change="onDrawingChange"
                @visible-change="(visible: boolean) => visible && loadProcessOptions(form.drawingNo)"
              >
                <el-option v-for="p in processOptions" :key="p.id" :label="p.drawingNo" :value="p.drawingNo">
                  <span class="option-main">{{ p.drawingNo }}</span>
                  <span class="option-sub">{{ p.customerName || '—' }} · {{ p.productName || '—' }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="客户">
              <el-select
                v-model="customerPick"
                filterable
                clearable
                allow-create
                default-first-option
                :filter-method="filterCustomers"
                placeholder="选择或手工输入客户"
                popper-class="bom-customer-popper"
                style="width: 100%"
                @change="onCustomerChange"
                @visible-change="(visible: boolean) => visible && resetCustomerFilter()"
              >
                <el-option v-for="c in customerOptions" :key="c.id" :label="c.customerName" :value="c.id">
                  <span class="opt-name">{{ c.customerName }}</span>
                  <span class="opt-code">{{ c.customerCode || '无代码' }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="产品名称" prop="productName">
              <el-input v-model="form.productName" clearable maxlength="128" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="版本号" prop="version">
              <el-input v-model="form.version" clearable maxlength="32" placeholder="如 1.0" @blur="normalizeBomVersion" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="制表人" prop="preparedBy">
              <el-input v-model="form.preparedBy" clearable maxlength="64" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="制表日期" prop="preparedDate">
              <el-date-picker v-model="form.preparedDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="detail-heading">
          <div>
            <span class="section-title section-title--inline">物料明细</span>
            <span class="detail-count">共 {{ form.items.length }} 行；数量为整套总用量，数量与单耗至少填写一项</span>
          </div>
          <div v-if="!readonly" class="detail-tools">
            <el-button size="small" :icon="Plus" @click="addBlankItem">添加空白行</el-button>
            <el-button size="small" type="primary" plain :icon="Box" @click="openMaterialPicker">从部件信息批量选择</el-button>
          </div>
        </div>

        <div class="detail-table-wrap">
          <el-table :data="form.items" border stripe row-key="_key" class="detail-table">
            <el-table-column type="index" label="序号" width="54" fixed="left" align="center" />
            <el-table-column label="零件名称*" width="145">
              <template #default="{ row }"><el-input v-model="row.itemName" clearable maxlength="128" /></template>
            </el-table-column>
            <el-table-column label="图号（编号）" width="150">
              <template #default="{ row }"><el-input v-model="row.itemCode" clearable maxlength="128" /></template>
            </el-table-column>
            <el-table-column label="规格" width="135">
              <template #default="{ row }"><el-input v-model="row.spec" clearable maxlength="128" /></template>
            </el-table-column>
            <el-table-column label="数量/套" width="125" align="center">
              <template #default="{ row }">
                <el-input-number v-model="row.quantityPerSet" :min="0" :precision="4" :controls="false" placeholder="可空" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="单位" width="90">
              <template #default="{ row }">
                <el-select v-model="row.quantityUnit" filterable allow-create default-first-option>
                  <el-option v-for="u in unitOptions" :key="u" :label="u" :value="u" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="分左右" width="88" align="center">
              <template #default="{ row }"><el-switch v-model="row.splitLeftRight" /></template>
            </el-table-column>
            <el-table-column label="材料厚度" width="110">
              <template #default="{ row }"><el-input v-model="row.materialThickness" clearable maxlength="32" /></template>
            </el-table-column>
            <el-table-column label="单耗kg/支" width="125" align="center">
              <template #default="{ row }">
                <el-input-number v-model="row.unitConsumption" :min="0" :precision="6" :controls="false" placeholder="可空" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="表面处理" width="130">
              <template #default="{ row }">
                <el-select v-model="row.surfaceTreatment" clearable filterable allow-create default-first-option>
                  <el-option v-for="s in surfaceOptions" :key="s" :label="s" :value="s" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="材质" width="110">
              <template #default="{ row }"><el-input v-model="row.sheetMaterial" clearable maxlength="64" /></template>
            </el-table-column>
            <el-table-column label="供应商" width="160">
              <template #default="{ row }">
                <el-select
                  v-model="row.supplierPick"
                  clearable filterable allow-create default-first-option
                  placeholder="选择或输入"
                  @change="(value: number | string) => onSupplierChange(row, value)"
                >
                  <el-option v-for="s in suppliers" :key="s.id" :label="s.supplierName" :value="s.id">
                    <span class="option-main">{{ s.supplierName }}</span>
                    <span class="option-sub">{{ s.supplierCode }}</span>
                  </el-option>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="备注" width="180">
              <template #default="{ row }"><el-input v-model="row.remark" clearable maxlength="255" /></template>
            </el-table-column>
            <!-- 明细行多、列又宽，操作列固定在右侧随时可点；按钮只留图标（配 title/aria-label
                 说明用途），与本模块列表页的操作列写法一致 -->
            <el-table-column v-if="!readonly" label="操作" width="112" fixed="right" align="center">
              <template #default="{ row, $index }">
                <el-button link type="primary" :icon="CopyDocument" title="复制本行" aria-label="复制本行" @click="copyItem(row, $index)" />
                <el-button link type="primary" :icon="Top" title="上移" aria-label="上移" :disabled="$index === 0" @click="moveItem($index, -1)" />
                <el-button link type="primary" :icon="Bottom" title="下移" aria-label="下移" :disabled="$index === form.items.length - 1" @click="moveItem($index, 1)" />
                <el-button link type="danger" :icon="Delete" title="删除本行" aria-label="删除本行" @click="removeItem($index)" />
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="!readonly" class="form-footer">
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </el-form>

      <el-descriptions v-if="editId" :column="4" border size="small" class="audit-block">
        <el-descriptions-item label="创建人">{{ audit.creatorName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ audit.createdAt ? formatDateTime(audit.createdAt) : '—' }}</el-descriptions-item>
        <el-descriptions-item label="更新人">{{ audit.updaterName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ audit.updatedAt ? formatDateTime(audit.updatedAt) : '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-dialog v-model="materialPickerVisible" title="从部件信息批量选择" width="1040px">
      <div class="picker-toolbar">
        <el-input
          v-model="materialKeyword"
          clearable
          placeholder="部件代码/品号/产品名称/图号"
          style="width: 300px"
          @input="scheduleMaterialSearch"
          @keyup.enter="runMaterialSearch"
        />
        <el-button size="small" type="primary" :icon="Search" @click="runMaterialSearch">查询</el-button>
        <span class="picker-tip">可多选；带入后仍可修改BOM快照</span>
      </div>
      <app-table v-loading="materialLoading" :data="materialOptions" border stripe height="430" @selection-change="onMaterialSelection">
        <el-table-column type="selection" width="42" />
        <el-table-column label="部件代码" prop="materialCode" width="120" />
        <el-table-column label="品号" prop="itemNo" width="115" />
        <el-table-column label="零件名称" prop="productName" min-width="145" show-overflow-tooltip />
        <el-table-column label="图号" prop="drawingNo" width="140" show-overflow-tooltip />
        <el-table-column label="规格" prop="spec" width="120" show-overflow-tooltip />
        <el-table-column label="料厚" prop="materialThickness" width="90" />
        <el-table-column label="单重" prop="unitWeight" width="90" align="right" />
        <el-table-column label="材质" prop="sheetMaterial" width="95" />
      </app-table>
      <template #footer>
        <el-button size="small" @click="materialPickerVisible = false">取消</el-button>
        <el-button size="small" type="primary" :disabled="!materialSelection.length" @click="appendSelectedMaterials">
          添加所选 {{ materialSelection.length }} 项
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance } from 'element-plus';
import { Back, Bottom, Box, CopyDocument, Delete, Plus, Search, Top } from '@element-plus/icons-vue';
import {
  createProductionBom,
  getProductionBomDetail,
  getProductionBomMaterialOptions,
  getProductionBomProcessOptions,
  updateProductionBom,
  type MaterialBomOption,
  type ProcessBomOption,
  type ProductionBomItem,
  type ProductionBomPayload,
} from '@/api/production-bom';
import { getAllCustomers, type CustomerItem } from '@/api/customer';
import { getSupplierOptions, type SupplierOption } from '@/api/supplier';
import { useUserStore } from '@/stores/user';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import { loadDict } from '@/composables/useDict';
import { formatDateTime } from '@/utils/date';
import AppTable from '@/components/AppTable.vue';
import ColorTag from '@/components/ColorTag.vue';

interface EditableBomItem extends ProductionBomItem {
  _key: number;
  supplierPick: number | string;
}

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const editId = ref(route.query.id ? Number(route.query.id) : null);
const readonly = computed(() => route.query.mode === 'view');
const pageTitle = computed(() => readonly.value ? '查看生产BOM' : editId.value ? '编辑生产BOM' : '新增生产BOM');
const pageLoading = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
let rowKey = 0;

function todayText() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const form = reactive({
  processInfoId: null as number | null,
  drawingNo: '',
  customerId: null as number | null,
  customerName: '',
  productName: '',
  version: '1.0',
  preparedBy: userStore.userInfo?.realName || userStore.userInfo?.username || '',
  preparedDate: todayText(),
  items: [] as EditableBomItem[],
});
const audit = reactive({ creatorName: '', updaterName: '', createdAt: '', updatedAt: '' });
const rules = {
  drawingNo: [{ required: true, message: '请选择或输入生产图号', trigger: 'change' }],
  productName: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
  preparedBy: [{ required: true, message: '请输入制表人', trigger: 'blur' }],
  preparedDate: [{ required: true, message: '请选择制表日期', trigger: 'change' }],
};

function blankItem(partial: Partial<EditableBomItem> = {}): EditableBomItem {
  return {
    _key: ++rowKey,
    materialId: null,
    itemName: '',
    itemCode: '',
    spec: '',
    quantityPerSet: null,
    quantityUnit: 'PCS',
    splitLeftRight: false,
    materialThickness: '',
    unitConsumption: null,
    surfaceTreatment: '',
    sheetMaterial: '',
    supplierId: null,
    supplierName: '',
    supplierPick: '',
    remark: '',
    ...partial,
  };
}

const unitOptions = ['PCS', '支', '套', '个', 'kg', '米'];
const surfaceOptions = ref<string[]>([]);
const customers = ref<CustomerItem[]>([]);
const customerOptions = ref<CustomerItem[]>([]);
const customerPick = ref<number | string>('');
const suppliers = ref<SupplierOption[]>([]);

function resetCustomerFilter() {
  customerOptions.value = customers.value;
}
function filterCustomers(value: string) {
  const keyword = value.trim().toLowerCase();
  customerOptions.value = keyword
    ? customers.value.filter((c) => c.customerName.toLowerCase().includes(keyword) || (c.customerCode || '').toLowerCase().includes(keyword))
    : customers.value;
}
function onCustomerChange(value: number | string) {
  if (typeof value === 'number') {
    const hit = customers.value.find((c) => c.id === value);
    form.customerId = hit?.id ?? null;
    form.customerName = hit?.customerName ?? '';
  } else {
    form.customerId = null;
    form.customerName = String(value ?? '').trim();
  }
}

const processOptions = ref<ProcessBomOption[]>([]);
const processLoading = ref(false);
const linkedDrawingNo = ref('');
let processRequest = 0;
async function loadProcessOptions(keyword = '') {
  const requestNo = ++processRequest;
  processLoading.value = true;
  try {
    const rows = await getProductionBomProcessOptions(keyword.trim() || undefined);
    if (requestNo === processRequest) processOptions.value = rows;
  } finally {
    if (requestNo === processRequest) processLoading.value = false;
  }
}
function onDrawingChange(value: string) {
  const hit = processOptions.value.find((p) => p.drawingNo === value);
  if (!hit) {
    form.processInfoId = null;
    linkedDrawingNo.value = '';
    return;
  }
  form.processInfoId = hit.id;
  linkedDrawingNo.value = hit.drawingNo;
  form.customerId = hit.customerId;
  form.customerName = hit.customerName || '';
  form.productName = hit.productName || form.productName;
  customerPick.value = hit.customerId && customers.value.some((c) => c.id === hit.customerId)
    ? hit.customerId
    : hit.customerName || '';
}
watch(() => form.drawingNo, (value) => {
  if (form.processInfoId && value !== linkedDrawingNo.value) form.processInfoId = null;
});

function onSupplierChange(row: EditableBomItem, value: number | string) {
  if (typeof value === 'number') {
    const hit = suppliers.value.find((s) => s.id === value);
    row.supplierId = hit?.id ?? null;
    row.supplierName = hit?.supplierName ?? '';
  } else {
    row.supplierId = null;
    row.supplierName = String(value ?? '').trim();
  }
}

function normalizeBomVersion() {
  let value = form.version.trim().replace(/^v(?:er)?\s*/i, '').replace(/版本$/, '').trim();
  if (/^\d+$/.test(value)) value = `${value}.0`;
  form.version = value;
}

function addBlankItem() {
  form.items.push(blankItem());
}
function copyItem(row: EditableBomItem, index: number) {
  const { _key: _oldKey, id: _oldId, bomId: _oldBomId, ...snapshot } = row;
  const copy = blankItem(snapshot);
  form.items.splice(index + 1, 0, copy);
}
function moveItem(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= form.items.length) return;
  const [row] = form.items.splice(index, 1);
  if (row) form.items.splice(target, 0, row);
}
function removeItem(index: number) {
  form.items.splice(index, 1);
}

const materialPickerVisible = ref(false);
const materialKeyword = ref('');
const materialLoading = ref(false);
const materialOptions = ref<MaterialBomOption[]>([]);
const materialSelection = ref<MaterialBomOption[]>([]);
async function loadMaterials() {
  materialLoading.value = true;
  try {
    materialOptions.value = await getProductionBomMaterialOptions(materialKeyword.value.trim() || undefined);
  } finally {
    materialLoading.value = false;
  }
}
const { schedule: scheduleMaterialSearch, flush: runMaterialSearch } = useDebouncedSearch(loadMaterials);
function openMaterialPicker() {
  materialSelection.value = [];
  materialPickerVisible.value = true;
  void loadMaterials();
}
function onMaterialSelection(rows: MaterialBomOption[]) {
  materialSelection.value = rows;
}
function appendSelectedMaterials() {
  materialSelection.value.forEach((m) => {
    const weight = m.unitWeight === null || m.unitWeight === '' ? null : Number(m.unitWeight);
    form.items.push(blankItem({
      materialId: m.id,
      itemName: m.productName || m.itemNo || m.materialCode,
      itemCode: m.drawingNo || m.itemNo || m.materialCode,
      spec: m.spec || '',
      materialThickness: m.materialThickness || '',
      unitConsumption: Number.isFinite(weight) ? weight : null,
      sheetMaterial: m.sheetMaterial || '',
    }));
  });
  materialPickerVisible.value = false;
  ElMessage.success(`已添加 ${materialSelection.value.length} 条部件明细`);
}

function editableItem(item: ProductionBomItem): EditableBomItem {
  const supplierPick = item.supplierId && suppliers.value.some((s) => s.id === item.supplierId)
    ? item.supplierId
    : item.supplierName || '';
  return blankItem({ ...item, supplierPick });
}

async function init() {
  pageLoading.value = true;
  try {
    const [customerRows, supplierRows, surfaces] = await Promise.all([
      getAllCustomers(),
      getSupplierOptions(),
      loadDict('surface_type'),
      loadProcessOptions(),
    ]);
    customers.value = customerRows;
    customerOptions.value = customerRows;
    suppliers.value = supplierRows;
    surfaceOptions.value = surfaces.map((row) => row.dictLabel);
    if (editId.value) {
      const detail = await getProductionBomDetail(editId.value);
      Object.assign(form, {
        processInfoId: detail.processInfoId,
        drawingNo: detail.drawingNo,
        customerId: detail.customerId,
        customerName: detail.customerName || '',
        productName: detail.productName,
        version: detail.version,
        preparedBy: detail.preparedBy,
        preparedDate: String(detail.preparedDate).slice(0, 10),
        items: detail.items.map(editableItem),
      });
      linkedDrawingNo.value = detail.processInfoId ? detail.drawingNo : '';
      customerPick.value = detail.customerId && customerRows.some((c) => c.id === detail.customerId)
        ? detail.customerId
        : detail.customerName || '';
      Object.assign(audit, detail);
    } else {
      addBlankItem();
    }
  } finally {
    pageLoading.value = false;
  }
}

function validateItems(): boolean {
  if (!form.items.length) {
    ElMessage.warning('至少添加一条BOM明细');
    return false;
  }
  for (let index = 0; index < form.items.length; index += 1) {
    const item = form.items[index]!;
    if (!item.itemName.trim()) {
      ElMessage.warning(`第 ${index + 1} 行请填写零件名称`);
      return false;
    }
    if (!(Number(item.quantityPerSet) > 0) && !(Number(item.unitConsumption) > 0)) {
      ElMessage.warning(`第 ${index + 1} 行的数量/套和单耗kg/支至少填写一项且必须大于0`);
      return false;
    }
  }
  return true;
}

async function onSave() {
  await formRef.value?.validate();
  normalizeBomVersion();
  if (!validateItems()) return;
  const payload: ProductionBomPayload = {
    processInfoId: form.processInfoId,
    drawingNo: form.drawingNo.trim(),
    customerId: form.customerId,
    customerName: form.customerName.trim() || null,
    productName: form.productName.trim(),
    version: form.version,
    preparedBy: form.preparedBy.trim(),
    preparedDate: form.preparedDate,
    items: form.items.map((item) => ({
      materialId: item.materialId,
      itemName: item.itemName.trim(),
      itemCode: item.itemCode?.trim() || null,
      spec: item.spec?.trim() || null,
      quantityPerSet: item.quantityPerSet,
      quantityUnit: item.quantityUnit?.trim() || 'PCS',
      splitLeftRight: item.splitLeftRight,
      materialThickness: item.materialThickness?.trim() || null,
      unitConsumption: item.unitConsumption,
      surfaceTreatment: item.surfaceTreatment?.trim() || null,
      sheetMaterial: item.sheetMaterial?.trim() || null,
      supplierId: item.supplierId,
      supplierName: item.supplierName?.trim() || null,
      remark: item.remark?.trim() || null,
      sort: undefined,
    })),
  };
  saving.value = true;
  try {
    if (editId.value) {
      await updateProductionBom(editId.value, payload);
      ElMessage.success('生产BOM已保存');
    } else {
      await createProductionBom(payload);
      ElMessage.success('生产BOM已新增');
    }
    goBack();
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/process/bom');
}

void init();
</script>

<script lang="ts">
export default { name: 'ProductionBomForm' };
</script>

<style scoped lang="scss">
.form-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; margin-bottom: 4px; border-bottom: 1px solid var(--el-border-color-lighter);
}
.form-title { display: flex; align-items: center; gap: 10px; }
.title-text { font-size: 16px; font-weight: 600; }
.view-tip { color: var(--el-text-color-secondary); font-size: 13px; }
.section-title {
  margin: 18px 0 14px; padding-left: 9px; border-left: 4px solid var(--el-color-primary);
  color: var(--el-text-color-primary); font-size: 14px; font-weight: 600;
}
.section-title--inline { display: inline-block; margin: 0 10px 0 0; }
.detail-heading { display: flex; justify-content: space-between; align-items: center; margin: 18px 0 10px; }
.detail-count, .picker-tip { color: var(--el-text-color-secondary); font-size: 12px; }
.detail-tools, .picker-toolbar { display: flex; align-items: center; gap: 8px; }
/*
 * ⚠️ 横向滚动必须由 **el-table 自己** 承担，别在外层再包一个 overflow-x:auto，
 * 也别给表格设 min-width：那样滚动发生在外层容器、el-table 自身的滚动区永远不溢出，
 * `fixed="left"/"right"` 的列就没有可吸附的滚动上下文，写了也不生效（本页实测踩过：
 * 序号列与操作列都固定不住）。列宽已逐列写死，el-table 会自行算出滚动条。
 */
.detail-table-wrap { width: 100%; }
.form-footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 18px; }
.audit-block { margin-top: 18px; }
.picker-toolbar { margin-bottom: 12px; }
.option-main {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.option-sub {
  flex: 0 0 auto; margin-left: 16px;
  color: var(--el-text-color-secondary); font-size: 12px;
}
</style>

<style lang="scss">
.bom-process-popper {
  .el-select-dropdown__item {
    display: flex; align-items: center; justify-content: space-between;
    box-sizing: border-box; width: 100%; min-width: 0;
  }
  .option-main {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .option-sub {
    flex: 0 0 auto; margin-left: 16px;
    color: var(--el-text-color-secondary); font-size: 12px;
  }
}

// 与订单新增/编辑页的客户字段保持一致：名称自适应，代码固定在面板右侧。
.bom-customer-popper {
  .el-select-dropdown__item {
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
    min-width: 320px;
    height: auto;
    padding: 8px 16px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    transition: background-color 0.15s, color 0.15s;
    &:last-child { border-bottom: none; }

    .opt-name {
      min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 13px;
    }
    .opt-code {
      flex: none; min-width: 76px; text-align: right;
      color: var(--el-text-color-secondary);
      font-size: 12px; font-family: Consolas, monospace;
    }

    &.hover, &:hover {
      background-color: var(--el-color-primary-light-9);
      .opt-name { color: var(--el-color-primary); }
      .opt-code { color: var(--el-color-primary); opacity: 0.85; }
    }

    &.selected {
      background-color: var(--el-color-primary-light-9);
      font-weight: 600;
      position: relative;
      &::before {
        content: '';
        position: absolute; left: 0; top: 0; bottom: 0;
        width: 3px; background: var(--el-color-primary);
      }
      .opt-name { color: var(--el-color-primary); font-weight: 600; }
      .opt-code { color: var(--el-color-primary); }
    }
  }
}
</style>
