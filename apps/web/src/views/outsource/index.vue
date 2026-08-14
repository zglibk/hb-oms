<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="加工商/订单号/生产单号/产品型号/图号"
            style="width: 260px"
            @input="scheduleKeywordSearch"
            @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="query.surfaceType" clearable placeholder="全部" style="width: 130px" @change="runKeywordSearch">
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
            @change="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
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
        <el-table-column label="加工商" prop="processorName" min-width="120" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">
            <color-tag v-if="row.processorName" :seed="row.processorName">{{ row.processorName }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
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
          <template #default="{ row }">
            <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ dictLabel(surfaceDict, row.surfaceType) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="colorEnabled" label="颜色" width="80" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.color" :seed="row.color">{{ row.color }}</color-tag>
            <span v-else>—</span>
          </template>
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
        <el-table-column label="回货数量(支)" width="118" align="center">
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
        <!-- 录入方式排在首项，与登记页一致：它决定下面重量改动会不会回算数量。
             口径同登记页（按数量时重量/单重只是记录值）；默认按这条记录已有的数据
             推断——原本就是过磅折算出来的，编辑时自然还按重量走 -->
        <el-form-item label="录入方式" class="ed-mode">
          <el-radio-group v-model="editMode">
            <el-radio v-for="o in ENTRY_MODE_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="加工商" required>
          <!-- 同登记页：下拉取自「基础数据 → 供应商」，允许手输新值 -->
          <el-select
            v-model="editForm.processorName"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="选择或直接输入"
            style="width: 100%"
          >
            <el-option v-for="s in supplierOptions" :key="s.id" :label="s.supplierName" :value="s.supplierName" />
          </el-select>
        </el-form-item>
        <el-form-item label="回厂日期" required>
          <el-date-picker v-model="editForm.backDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="editForm.surfaceType" clearable placeholder="按订单带出" style="width: 100%">
            <el-option v-for="o in outsourceSurfaces" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <!-- 停用时仅隐藏输入框，editForm.color 仍随提交原样回传，不洗掉历史值 -->
        <el-form-item v-if="colorEnabled" label="颜色">
          <el-input v-model="editForm.color" />
        </el-form-item>
        <el-form-item label="回厂数量" required>
          <el-input-number v-model="editForm.returnQty" :min="1" :precision="0" :step="1" style="width: 140px" />
          <span class="unit-tip">支{{ editQtyMode ? '（以送货单为准）' : '（重量÷单重折算，可改）' }}</span>
        </el-form-item>
        <el-form-item label="回厂重量">
          <el-input-number
            v-model="editForm.returnWeight" :min="0" :precision="2" :step="1" :controls="false"
            style="width: 140px" @change="syncEditQty"
          />
          <span class="unit-tip">kg{{ editQtyMode ? '（选填）' : '' }}</span>
        </el-form-item>
        <el-form-item label="单重">
          <el-input-number
            v-model="editForm.unitWeight" :min="0" :precision="4" :step="0.01" :controls="false"
            style="width: 140px" @change="syncEditQty"
          />
          <span class="unit-tip">kg/支{{ editQtyMode ? '（选填）' : '' }}</span>
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
import { getSupplierOptions, type SupplierOption } from '@/api/supplier';
import { SURFACE_NONE, UNIT_OPTIONS, qtyFromWeight } from '@/constants/dict';
import {
  ENTRY_MODE_OPTIONS,
  mismatchedQty,
  type OutsourceEntryMode,
} from '@/composables/useOutsourceEntry';
import { loadDict } from '@/composables/useDict';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';
import ColorTag from '@/components/ColorTag.vue';

/** 「颜色」字段全局开关（系统配置 → 业务字段） */
const { colorEnabled } = useFeatureFlags();

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

/** 加工商下拉：基础数据里维护的启用供应商（同登记页） */
const supplierOptions = ref<SupplierOption[]>([]);
getSupplierOptions().then((rows) => {
  supplierOptions.value = rows;
});

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
function reload() {
  query.page = 1;
  load();
}
const { schedule: scheduleKeywordSearch, flush: runKeywordSearch } = useDebouncedSearch(reload);
load();
onActivated(load);

function resetQuery() {
  query.keyword = '';
  query.surfaceType = undefined;
  dateRange.value = null;
  runKeywordSearch();
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

/**
 * 编辑弹窗的录入方式。默认**按这条记录已有的数据推断**：
 * 原本就带重量与单重的，说明当初是过磅折算出来的，编辑时继续按重量走；
 * 只有数量的（送货单没印重量），进来就是「按数量」，不会被折算改掉。
 */
const editMode = ref<OutsourceEntryMode>('qty');
const editQtyMode = computed(() => editMode.value === 'qty');

function openEdit(row: OutsourcePartRow) {
  editRow.value = row;
  const weight = Number(row.returnWeight) || 0;
  const unit = Number(row.unitWeight) || 0;
  editMode.value = weight > 0 && unit > 0 ? 'weight' : 'qty';
  Object.assign(editForm, {
    processorName: row.processorName,
    backDate: String(row.backDate).slice(0, 10),
    surfaceType: row.surfaceType ?? undefined,
    color: row.color ?? '',
    returnWeight: weight,
    unitWeight: unit,
    returnQty: row.returnQty,
    remark: row.remark ?? '',
  });
  editVisible.value = true;
}

/** 重量或单重变化 → 折算数量；**仅「按重量折算」模式生效**（同登记页口径） */
function syncEditQty() {
  if (editQtyMode.value) return;
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
  // 数量与重量折算对不上时确认一次（只提示不拦截，口径见 useOutsourceEntry）
  const calc = mismatchedQty(editForm);
  if (calc !== null) {
    try {
      await ElMessageBox.confirm(
        `登记 ${editForm.returnQty} 支，按重量折算 ${calc} 支。确认以登记的数量入账吗？`,
        '数量与重量折算不一致',
        { type: 'warning', confirmButtonText: '按登记数量入账', cancelButtonText: '返回修改' },
      );
    } catch {
      return;
    }
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
/* 录入方式加浅底，与登记页同一处理：让人改重量之前先看清是哪种方式 */
.ed-mode {
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 6px 12px 0 0;
  margin-bottom: 14px;
}
.unit-tip {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
