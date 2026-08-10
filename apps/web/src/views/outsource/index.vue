<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="load">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="加工商/订单号/生产单号/产品型号/图号"
            style="width: 260px"
            @clear="load"
            @keyup.enter="load"
          />
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="query.surfaceType" clearable placeholder="全部" style="width: 130px" @change="load">
            <el-option v-for="o in outsourceSurfaces" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="回厂日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 240px"
            @change="load"
          />
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="load">查询</el-button>
          <el-button size="small" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'outsource:create'" type="primary" :icon="Plus" @click="openCreate">
          登记回厂
        </el-button>
        <span class="toolbar-sum">
          当前筛选合计回厂 <b>{{ totalQty }}</b> 支 ／ <b>{{ totalWeight }}</b> kg
        </span>
      </div>

      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize">
        <el-table-column label="回厂日期" width="115" fixed="left">
          <template #default="{ row }">
            {{ dateText(row.backDate) }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="加工商" prop="processorName" min-width="120" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="生产单号" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productionNo || row.orderNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="产品型号" prop="productModel" min-width="150" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="规格" width="90" align="center">
          <template #default="{ row }">{{ row.dimensionText || '—' }}</template>
        </el-table-column>
        <el-table-column label="订单数量" width="100" align="center">
          <template #default="{ row }">{{ row.orderQty }} {{ unitLabel(row.unit) }}</template>
        </el-table-column>
        <el-table-column label="表面处理" width="100" align="center">
          <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
        </el-table-column>
        <el-table-column label="颜色" width="80" align="center">
          <template #default="{ row }">{{ row.color || '—' }}</template>
        </el-table-column>
        <el-table-column label="生产图号" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.drawingNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="料厚" width="110" align="center">
          <template #default="{ row }">{{ row.materialThickness || '—' }}</template>
        </el-table-column>
        <el-table-column label="重量(kg)" width="95" align="center">
          <template #default="{ row }">{{ Number(row.returnWeight) }}</template>
        </el-table-column>
        <el-table-column label="单重" width="90" align="center">
          <template #default="{ row }">{{ Number(row.unitWeight) }}</template>
        </el-table-column>
        <el-table-column label="数量(支)" width="95" align="center">
          <template #default="{ row }"><b>{{ row.returnQty }}</b></template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="120" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button
                size="small" v-permission.disable="'outsource:update'"
                link type="primary" class="btn-edit" :icon="Edit"
                @click="openEdit(row)"
              >编辑</el-button>
              <el-button
                size="small" v-permission.disable="'outsource:delete'"
                link type="danger" class="btn-delete" :icon="Delete"
                :loading="deletingId === row.id" @click="onDelete(row)"
              >删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <!-- 编辑单条：锚点与订单侧快照不可改，只改加工商/日期/表面处理/数量口径/备注 -->
    <el-dialog v-model="editVisible" title="编辑回厂记录" width="560px">
      <el-descriptions v-if="editRow" :column="2" border size="small" class="ed-snap">
        <el-descriptions-item label="生产单号">{{ editRow.productionNo || editRow.orderNo || '—' }}</el-descriptions-item>
        <el-descriptions-item label="产品型号">{{ editRow.productModel || '—' }}</el-descriptions-item>
        <el-descriptions-item label="规格">{{ editRow.dimensionText || '—' }}</el-descriptions-item>
        <el-descriptions-item label="订单数量">{{ editRow.orderQty }} {{ unitLabel(editRow.unit) }}</el-descriptions-item>
        <el-descriptions-item label="生产图号">{{ editRow.drawingNo || '—' }}</el-descriptions-item>
        <el-descriptions-item label="料厚">{{ editRow.materialThickness || '—' }}</el-descriptions-item>
      </el-descriptions>
      <el-form :model="editForm" label-width="90px" size="small" class="ed-form">
        <el-form-item label="加工商" required>
          <el-input v-model="editForm.processorName" />
        </el-form-item>
        <el-form-item label="回厂日期" required>
          <el-date-picker v-model="editForm.backDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="editForm.surfaceType" clearable placeholder="按订单带出" style="width: 100%">
            <el-option v-for="o in outsourceSurfaces" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="颜色">
          <el-input v-model="editForm.color" />
        </el-form-item>
        <el-form-item label="回厂重量">
          <el-input-number
            v-model="editForm.returnWeight" :min="0" :precision="2" :step="1" :controls="false"
            style="width: 140px" @change="syncEditQty"
          />
          <span class="unit-tip">kg</span>
        </el-form-item>
        <el-form-item label="单重">
          <el-input-number
            v-model="editForm.unitWeight" :min="0" :precision="4" :step="0.01" :controls="false"
            style="width: 140px" @change="syncEditQty"
          />
          <span class="unit-tip">kg/支</span>
        </el-form-item>
        <el-form-item label="回厂数量">
          <el-input-number v-model="editForm.returnQty" :min="1" :precision="0" :step="1" style="width: 140px" />
          <span class="unit-tip">支（重量÷单重自动折算，可改）</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="editVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onEditSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// keep-alive 缓存键取组件 name；本项目多数页面文件同名 index.vue，
// 不显式命名会导致缓存互相顶替、onActivated 打在错误实例上（刷新失效）。
defineOptions({ name: 'OutsourceList' });

import { computed, onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Search } from '@element-plus/icons-vue';
import {
  getOutsourceList,
  updateOutsourcePart,
  removeOutsourcePart,
  type OutsourcePartRow,
} from '@/api/outsource';
import { SURFACE_NONE, UNIT_OPTIONS, qtyFromWeight } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

const router = useRouter();
const loading = ref(false);
const list = ref<OutsourcePartRow[]>([]);
const total = ref(0);
const deletingId = ref<number | null>(null);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  surfaceType: undefined as string | undefined,
});
const dateRange = ref<[string, string] | null>(null);

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
/** 外发可选表面处理 = 字典项去掉保留值 none（无表面处理不外发） */
const outsourceSurfaces = computed(() => surfaceDict.value.filter((o) => o.value !== SURFACE_NONE));

/** 本页合计（仅当前页——分页数据，标题已写明「当前筛选」由后端分页限制） */
const totalQty = computed(() => list.value.reduce((s, r) => s + (r.returnQty || 0), 0));
const totalWeight = computed(
  () => Math.round(list.value.reduce((s, r) => s + Number(r.returnWeight || 0), 0) * 100) / 100,
);

async function load() {
  loading.value = true;
  try {
    const res = await getOutsourceList({
      ...query,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
    });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}
load();
onActivated(load);

function resetQuery() {
  query.keyword = '';
  query.surfaceType = undefined;
  query.page = 1;
  dateRange.value = null;
  load();
}

function openCreate() {
  router.push({ name: 'OutsourceForm' });
}

/* ===== 编辑 ===== */
const editVisible = ref(false);
const saving = ref(false);
const editRow = ref<OutsourcePartRow | null>(null);
const editForm = reactive({
  processorName: '',
  backDate: '',
  surfaceType: '' as string | undefined,
  color: '',
  returnWeight: 0,
  unitWeight: 0,
  returnQty: 0,
  remark: '',
});

function openEdit(row: OutsourcePartRow) {
  editRow.value = row;
  Object.assign(editForm, {
    processorName: row.processorName,
    backDate: String(row.backDate).slice(0, 10),
    surfaceType: row.surfaceType ?? undefined,
    color: row.color ?? '',
    returnWeight: Number(row.returnWeight) || 0,
    unitWeight: Number(row.unitWeight) || 0,
    returnQty: row.returnQty,
    remark: row.remark ?? '',
  });
  editVisible.value = true;
}

/** 重量或单重变化 → 自动折算数量（共享包同一口径，仍可人工微调） */
function syncEditQty() {
  const qty = qtyFromWeight(editForm.returnWeight, editForm.unitWeight);
  if (qty > 0) editForm.returnQty = qty;
}

async function onEditSave() {
  if (!editRow.value) return;
  if (!editForm.processorName.trim()) {
    ElMessage.warning('请填写加工商');
    return;
  }
  if (!editForm.backDate) {
    ElMessage.warning('请选择回厂日期');
    return;
  }
  if (!editForm.returnQty || editForm.returnQty <= 0) {
    ElMessage.warning('回厂数量必须大于 0');
    return;
  }
  saving.value = true;
  try {
    await updateOutsourcePart(editRow.value.id, {
      processorName: editForm.processorName.trim(),
      backDate: editForm.backDate,
      surfaceType: editForm.surfaceType || undefined,
      color: editForm.color || undefined,
      returnWeight: editForm.returnWeight || 0,
      unitWeight: editForm.unitWeight || 0,
      returnQty: editForm.returnQty,
      remark: editForm.remark || undefined,
    });
    ElMessage.success('已保存');
    editVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: OutsourcePartRow) {
  await ElMessageBox.confirm(
    `确定删除「${row.productModel || ''}」${dateText(row.backDate)} 的回厂记录（${row.returnQty} 支）吗？删除后台账「外发已回货」会同步减少。`,
    '提示',
    { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  );
  deletingId.value = row.id;
  try {
    await removeOutsourcePart(row.id);
    ElMessage.success('已删除');
    load();
  } finally {
    deletingId.value = null;
  }
}

/* ===== 展示辅助 ===== */
function dateText(v: string | null): string {
  return v ? String(v).slice(0, 10) : '—';
}
function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
function unitLabel(v: string | null): string {
  return UNIT_OPTIONS.find((o: any) => o.value === v)?.label ?? (v ?? '');
}
</script>

<style scoped lang="scss">
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.toolbar-sum {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  b { color: var(--el-color-primary); }
}
.pager { margin-top: 12px; }
.ed-snap { margin-bottom: 12px; }
.ed-form { padding-right: 12px; }
.unit-tip {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
