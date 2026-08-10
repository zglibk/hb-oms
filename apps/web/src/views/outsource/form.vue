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
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="加工商" prop="processorName">
              <el-input v-model="form.processorName" placeholder="做表面处理的外协厂" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="回厂日期" prop="backDate">
              <el-date-picker v-model="form.backDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <div class="head-tip">
              加工商与回厂日期为本次录入的<b>各行共用</b>值；同一天从同一家回来的货，勾多个部件组一次录完。
            </div>
          </el-col>
        </el-row>

        <div class="section-title">
          回厂明细
          <el-button size="small" type="primary" plain :icon="Plus" class="ml12" @click="openPicker">添加部件组</el-button>
          <span class="sec-sum">
            合计 <b>{{ totalQty }}</b> 支 ／ <b>{{ totalWeight }}</b> kg
          </span>
        </div>

        <el-table :data="form.items" border stripe size="small" empty-text="请点击「添加部件组」选择回厂的产品">
          <el-table-column type="index" label="#" width="46" align="center" />
          <el-table-column label="生产单号" prop="productionNo" width="120" show-overflow-tooltip />
          <el-table-column label="产品型号" prop="productModel" min-width="150" show-overflow-tooltip />
          <el-table-column label="规格" prop="dimensionText" width="90" align="center" />
          <el-table-column label="订单数量" width="100" align="center">
            <template #default="{ row }">{{ row.orderQty }} {{ unitLabel(row.unit) }}</template>
          </el-table-column>
          <el-table-column label="生产图号" width="130" show-overflow-tooltip>
            <template #default="{ row }">{{ row.drawingNo || '—' }}</template>
          </el-table-column>
          <el-table-column label="料厚" width="110" align="center">
            <template #default="{ row }">{{ row.materialThickness || '—' }}</template>
          </el-table-column>
          <el-table-column label="表面处理" width="120" align="center">
            <template #default="{ row }">
              <el-select v-model="row.surfaceType" clearable placeholder="按订单" style="width: 100%">
                <el-option v-for="o in outsourceSurfaces" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column v-if="colorEnabled" label="颜色" width="100" align="center">
            <template #default="{ row }"><el-input v-model="row.color" /></template>
          </el-table-column>
          <el-table-column label="回厂重量(kg)" width="120" align="center">
            <template #default="{ row }">
              <el-input-number
                v-model="row.returnWeight" :min="0" :precision="2" :step="1" :controls="false"
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
          <!-- 数量由重量÷单重自动折算（syncQty），仍允许人工微调；min 取 0 与重量列一致，
               「必须大于 0」在保存时统一校验（后端 DTO 亦有 @Min(1) 兜底） -->
          <el-table-column label="回厂数量(支)" width="120" align="center">
            <template #default="{ row }">
              <el-input-number v-model="row.returnQty" :min="0" :precision="0" :step="1" :controls="false" style="width: 100%" />
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
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Back, Plus, Delete, Search } from '@element-plus/icons-vue';
import {
  createOutsourceParts,
  getPartGroupOptions,
  type PartGroupOption,
} from '@/api/outsource';
import { SURFACE_NONE, UNIT_OPTIONS, qtyFromWeight } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useFeatureFlags } from '@/composables/useFeatureFlags';

/** 「颜色」字段全局开关（系统配置 → 业务字段） */
const { colorEnabled } = useFeatureFlags();

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

/** 重量或单重变化 → 自动折算数量（共享包同一口径，仍可人工微调） */
function syncQty(row: ItemRow) {
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

/* ===== 保存 ===== */
async function onSave() {
  await formRef.value?.validate();
  if (!form.items.length) {
    ElMessage.warning('请至少添加一条回厂明细');
    return;
  }
  const bad = form.items.findIndex((it) => !it.returnQty || it.returnQty <= 0);
  if (bad >= 0) {
    ElMessage.warning(`第 ${bad + 1} 行回厂数量必须大于 0`);
    return;
  }
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
.head-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 32px;
}
.section-title {
  font-size: 14px; font-weight: 600; color: var(--el-text-color-primary);
  border-left: 4px solid var(--el-color-primary);
  padding-left: 10px; line-height: 1.3;
  margin: 22px 0 14px;
  display: flex; align-items: center;
  .ml12 { margin-left: 12px; }
}
.sec-sum {
  margin-left: 16px;
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  b { color: var(--el-color-primary); }
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
</style>
