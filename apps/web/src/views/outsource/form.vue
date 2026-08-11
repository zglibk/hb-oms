<template>
  <div class="page">
    <el-card shadow="never">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">登记外发件回厂</span>
        </div>
        <div>
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <!-- 区 1：公共信息——录入方式决定明细该填哪列，加工商/日期各行共用 -->
        <div class="shared-block">
          <div class="shared-block__title">公共信息</div>
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="录入方式">
                <el-radio-group v-model="entryMode">
                  <el-radio v-for="o in ENTRY_MODE_OPTIONS" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </el-radio>
                </el-radio-group>
                <span class="mode-tip">
                  <template v-if="isQtyMode">
                    （以加工商<span class="mode-tip__em">送货单的数量</span>为准；重量与单重<span class="mode-tip__em">选填</span>，填了也不会反过来改数量。）
                  </template>
                  <template v-else>
                    （填<span class="mode-tip__em">重量与单重</span>自动算出数量（重量 ÷ 单重），算完仍可微调。）
                  </template>
                </span>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16" class="shared-block__fields">
            <el-col :xs="24" :sm="12" :md="10" :lg="8">
              <el-form-item label="加工商" prop="processorName">
                <el-input v-model="form.processorName" placeholder="做表面处理的外协厂" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="10" :lg="8">
              <el-form-item label="回厂日期" prop="backDate">
                <el-date-picker
                  v-model="form.backDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  class="shared-block__date"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <!-- 区 2：回厂明细 -->
        <div class="section-title">
          <span class="section-title__left">
            回厂明细
            <el-button size="small" type="primary" plain :icon="Plus" class="ml12" @click="openPicker">添加部件组</el-button>
          </span>
          <span class="sec-sum">
            合计 <b>{{ totalQty }}</b> 支 ／ <b>{{ totalWeight }}</b> kg
          </span>
        </div>

        <div v-if="!form.items.length" class="detail-empty">
          <p class="detail-empty__text">还没有回厂明细，请先选择本次回来的部件组</p>
          <el-button type="primary" :icon="Plus" @click="openPicker">添加部件组</el-button>
        </div>
        <el-table v-else :data="form.items" border stripe size="small" class="detail-table">
          <el-table-column type="index" label="#" width="46" align="center" />
          <el-table-column label="生产单号" prop="productionNo" width="120" fixed="left" show-overflow-tooltip />
          <el-table-column label="产品型号" prop="productModel" min-width="140" show-overflow-tooltip />
          <el-table-column label="规格" prop="dimensionText" width="80" align="center" show-overflow-tooltip />
          <el-table-column label="订单数量" width="88" align="center">
            <template #default="{ row }">{{ row.orderQty }} {{ unitLabel(row.unit) }}</template>
          </el-table-column>
          <el-table-column label="生产图号" width="100" show-overflow-tooltip>
            <template #default="{ row }">{{ row.drawingNo || '—' }}</template>
          </el-table-column>
          <el-table-column label="料厚" width="72" align="center" show-overflow-tooltip>
            <template #default="{ row }">{{ row.materialThickness || '—' }}</template>
          </el-table-column>
          <el-table-column label="表面处理" width="120" align="center">
            <template #default="{ row }">
              <el-select v-model="row.surfaceType" clearable placeholder="按订单" style="width: 100%">
                <el-option v-for="o in outsourceSurfaces" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column v-if="colorEnabled" label="颜色" width="90" align="center">
            <template #default="{ row }"><el-input v-model="row.color" /></template>
          </el-table-column>
          <!-- 数量列排在重量之前：它才是入账依据；必填校验在保存时统一做 -->
          <el-table-column width="125" align="center" class-name="col-focus" label-class-name="col-focus">
            <template #header>
              回厂数量(支)<span v-if="isQtyMode" class="col-req">*</span>
            </template>
            <template #default="{ row }">
              <el-input-number
                v-model="row.returnQty" :min="0" :precision="0" :step="1" :controls="false"
                style="width: 100%" :placeholder="isQtyMode ? '按送货单' : '自动折算'"
              />
            </template>
          </el-table-column>
          <el-table-column width="125" align="center" class-name="col-focus" label-class-name="col-focus">
            <template #header>
              回厂重量(kg)<span v-if="isQtyMode" class="col-opt">选填</span>
            </template>
            <template #default="{ row }">
              <el-input-number
                v-model="row.returnWeight" :min="0" :precision="2" :step="1" :controls="false"
                style="width: 100%" @change="() => syncQty(row)"
              />
            </template>
          </el-table-column>
          <el-table-column width="120" align="center" class-name="col-focus" label-class-name="col-focus">
            <template #header>
              单重(kg/支)<span v-if="isQtyMode" class="col-opt">选填</span>
            </template>
            <template #default="{ row }">
              <el-input-number
                v-model="row.unitWeight" :min="0" :precision="4" :step="0.01" :controls="false"
                style="width: 100%" @change="() => syncQty(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" width="110">
            <template #default="{ row }"><el-input v-model="row.remark" /></template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center" fixed="right">
            <template #default="{ $index }">
              <el-button size="small" link type="danger" :icon="Delete" @click="form.items.splice($index, 1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
    </el-card>

    <!-- 可外发部件组选择器 -->
    <el-dialog v-model="pickerVisible" title="选择回厂的部件组" width="1000px" top="6vh" @open="loadOptions">
      <div class="picker-bar">
        <el-input
          v-model="pickerKeyword"
          clearable
          placeholder="订单号/客户/生产单号/产品型号/图号"
          style="width: 320px"
          @keyup.enter="loadOptions"
          @clear="loadOptions"
        />
        <el-button size="small" type="primary" :icon="Search" @click="loadOptions">查询</el-button>
        <span class="picker-tip">只列出需要表面处理（非「无」）的部件组；同一组分批回厂可重复选。</span>
      </div>
      <el-table
        ref="pickerTableRef"
        :data="options"
        v-loading="optionsLoading"
        border
        stripe
        size="small"
        height="46vh"
        @selection-change="onPickChange"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column label="订单号" prop="orderNo" width="130" show-overflow-tooltip />
        <el-table-column label="客户" prop="customerName" width="120" show-overflow-tooltip />
        <el-table-column label="生产单号" prop="productionNo" width="120" show-overflow-tooltip />
        <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
        <el-table-column label="规格" prop="dimensionText" width="90" align="center" />
        <el-table-column label="表面处理" width="100" align="center">
          <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
        </el-table-column>
        <el-table-column label="组需求(支)" prop="qtyPcs" width="100" align="center" />
        <el-table-column label="已回厂(支)" prop="returnedQty" width="100" align="center" />
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
defineOptions({ name: 'OutsourceForm' });

import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Back, Plus, Delete, Search } from '@element-plus/icons-vue';
import {
  createOutsourceParts,
  getPartGroupOptions,
  type PartGroupOption,
} from '@/api/outsource';
import { SURFACE_NONE, UNIT_OPTIONS, qtyFromWeight } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import {
  ENTRY_MODE_OPTIONS,
  mismatchedQty,
  useOutsourceEntryMode,
} from '@/composables/useOutsourceEntry';

/** 「颜色」字段全局开关（系统配置 → 业务字段） */
const { colorEnabled } = useFeatureFlags();

/** 录入方式：按数量 / 按重量折算（记住上次选择，口径见 useOutsourceEntry） */
const { entryMode, isQtyMode } = useOutsourceEntryMode();

const router = useRouter();
const formRef = ref<FormInstance>();
const saving = ref(false);

interface ItemRow {
  orderPartGroupId: number;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  orderQty: number;
  unit: string | null;
  drawingNo: string | null;
  materialThickness: string | null;
  surfaceType: string;
  color: string;
  returnWeight: number;
  unitWeight: number;
  returnQty: number;
  remark: string;
}

const form = reactive({
  processorName: '',
  /** 实际回厂日期，默认今天——本模块只记已回厂的件 */
  backDate: new Date().toISOString().slice(0, 10),
  items: [] as ItemRow[],
});

const rules: FormRules = {
  processorName: [{ required: true, message: '请填写加工商', trigger: 'blur' }],
  backDate: [{ required: true, message: '请选择回厂日期', trigger: 'change' }],
};

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
const outsourceSurfaces = computed(() => surfaceDict.value.filter((o) => o.value !== SURFACE_NONE));

const totalQty = computed(() => form.items.reduce((s, it) => s + (it.returnQty || 0), 0));
const totalWeight = computed(
  () => Math.round(form.items.reduce((s, it) => s + (it.returnWeight || 0), 0) * 100) / 100,
);

/**
 * 重量或单重变化 → 折算数量（共享包同一口径，折算后仍可人工微调）。
 * **仅「按重量折算」模式生效**：按数量模式下这两列只是记录值，
 * 再驱动数量就会把录入员按送货单填好的数字改掉（原实现的坑）。
 */
function syncQty(row: ItemRow) {
  if (isQtyMode.value) return;
  const qty = qtyFromWeight(row.returnWeight, row.unitWeight);
  if (qty > 0) row.returnQty = qty;
}

/* ===== 部件组选择器 ===== */
const pickerVisible = ref(false);
const pickerKeyword = ref('');
const pickerTableRef = ref<any>();
const options = ref<PartGroupOption[]>([]);
const optionsLoading = ref(false);
const picked = ref<PartGroupOption[]>([]);

function openPicker() {
  pickerVisible.value = true;
}
async function loadOptions() {
  optionsLoading.value = true;
  try {
    options.value = await getPartGroupOptions({ keyword: pickerKeyword.value || undefined });
  } finally {
    optionsLoading.value = false;
  }
}
function onPickChange(rows: PartGroupOption[]) {
  picked.value = rows;
}
function confirmPick() {
  picked.value.forEach((o) => {
    form.items.push({
      orderPartGroupId: o.orderPartGroupId,
      orderNo: o.orderNo,
      customerName: o.customerName,
      productionNo: o.productionNo,
      productModel: o.productModel,
      dimensionText: o.dimensionText,
      orderQty: o.orderQty,
      unit: o.unit,
      drawingNo: o.drawingNo,
      materialThickness: o.materialThickness,
      // 表面处理与颜色自订单带出，可改（实际做的与订单登记的可能不同）
      surfaceType: o.surfaceType,
      color: o.color ?? '',
      // 单重自部件信息带出；重量与数量留空，等过磅实测录入——
      // 拿订单数预填会让人顺手存下一个没过磅的假数，对账时才发现对不上
      unitWeight: o.unitWeight,
      returnWeight: 0,
      returnQty: 0,
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
function unitLabel(v: string | null): string {
  return UNIT_OPTIONS.find((o: any) => o.value === v)?.label ?? (v ?? '');
}

/**
 * 数量与「重量÷单重」对不上时确认一次（偏差 >10%，口径见 useOutsourceEntry）。
 * **只提示不拦截**：过磅本就有误差，且两个数不一致时以送货单数量为准是业务惯例；
 * 但相差太多多半是某一处录错了，让人当场核一眼比事后对账划算。
 */
async function confirmQtyConsistent(): Promise<boolean> {
  const bad = form.items
    .map((it, i) => ({ it, no: i + 1, calc: mismatchedQty(it) }))
    .filter((r) => r.calc !== null);
  if (!bad.length) return true;
  const lines = bad
    .map((r) => `第 ${r.no} 行：登记 ${r.it.returnQty} 支，按重量折算 ${r.calc} 支`)
    .join('；');
  try {
    await ElMessageBox.confirm(`${lines}。确认以登记的数量入账吗？`, '数量与重量折算不一致', {
      type: 'warning',
      confirmButtonText: '按登记数量入账',
      cancelButtonText: '返回修改',
    });
    return true;
  } catch {
    return false;
  }
}

/* ===== 保存 ===== */
async function onSave() {
  await formRef.value?.validate();
  if (!form.items.length) {
    ElMessage.warning('请至少添加一条回厂明细');
    return;
  }
  const bad = form.items.findIndex((it) => !it.returnQty || it.returnQty <= 0);
  if (bad >= 0) {
    ElMessage.warning(
      isQtyMode.value
        ? `第 ${bad + 1} 行请按送货单填写回厂数量`
        : `第 ${bad + 1} 行回厂数量必须大于 0（填写重量与单重可自动折算）`,
    );
    return;
  }
  if (!(await confirmQtyConsistent())) return;
  saving.value = true;
  try {
    const res = await createOutsourceParts({
      processorName: form.processorName.trim(),
      backDate: form.backDate,
      items: form.items.map((it) => ({
        orderPartGroupId: it.orderPartGroupId,
        returnWeight: it.returnWeight || 0,
        unitWeight: it.unitWeight || 0,
        returnQty: it.returnQty,
        surfaceType: it.surfaceType || undefined,
        color: it.color || undefined,
        remark: it.remark || undefined,
      })),
    });
    ElMessage.success(`已登记 ${res.count} 条回厂记录`);
    goBack();
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/outsource');
}
</script>

<style scoped lang="scss">
.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.form-title {
  display: flex;
  align-items: center;
  gap: 12px;
  .title-text { font-size: 15px; font-weight: 600; }
}

/* 区 1：本次共用——整块浅底，字段左聚，说明沉底 */
.shared-block {
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px 16px 14px;
  margin-bottom: 8px;

  /* 与「回厂明细」同款左侧竖条，两个区块的标题看起来才是同一级 */
  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    border-left: 4px solid var(--el-color-primary);
    padding-left: 10px;
    margin-bottom: 10px;
    line-height: 1.3;
  }
  &__fields {
    max-width: 720px;
  }
  /* Element Plus 日期选择器默认偏窄，YYYY-MM-DD 会被裁切 */
  &__date {
    width: 100% !important;
    min-width: 180px;
  }
  :deep(.shared-block__date.el-date-editor) {
    width: 100% !important;
    max-width: none;
  }
  :deep(.el-form-item) {
    margin-bottom: 14px;
  }
  :deep(.shared-block__fields .el-form-item) {
    margin-bottom: 0;
  }
}
.mode-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  &__em {
    color: var(--el-color-danger);
    font-weight: 400;
  }
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-left: 4px solid var(--el-color-primary);
  padding-left: 10px;
  line-height: 1.3;
  margin: 20px 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  &__left {
    display: inline-flex;
    align-items: center;
  }
  .ml12 { margin-left: 12px; }
}
.sec-sum {
  margin-left: auto;
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  b { color: var(--el-color-primary); }
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 200px;
  padding: 32px 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  &__text {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

/* 录入列浅底强调，与订单快照列区分 */
.detail-table {
  :deep(th.col-focus),
  :deep(td.col-focus) {
    background-color: color-mix(in srgb, var(--el-color-primary) 6%, transparent) !important;
  }
  :deep(th.col-focus) {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.picker-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.picker-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.picker-count {
  float: left;
  line-height: 32px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.col-req {
  color: var(--el-color-danger);
  margin-left: 2px;
}
.col-opt {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
  margin-left: 4px;
  font-size: 11px;
}
</style>
