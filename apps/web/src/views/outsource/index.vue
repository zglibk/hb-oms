<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="load">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="发坯单号/加工商/生产单号/产品型号"
            style="width: 240px"
            @clear="load"
            @keyup.enter="load"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 110px" @change="load">
            <el-option v-for="o in OUTSOURCE_STATUS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="表面处理">
          <el-select v-model="query.surfaceType" clearable placeholder="全部" style="width: 130px" @change="load">
            <el-option v-for="o in outsourceSurfaces" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="计划发外">
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
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'outsource:create'" type="primary" :icon="Plus" @click="openCreate">新增发坯单</el-button>
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="id">
        <el-table-column type="expand" width="36" fixed="left">
          <template #default="{ row }">
            <div class="expand-wrap">
              <table class="expand-grid">
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>生产单号</th>
                    <th>产品型号</th>
                    <th>规格</th>
                    <th>周期码</th>
                    <th>发出重量(kg)</th>
                    <th>单重(kg/支)</th>
                    <th>发出数(支)</th>
                    <th>已回(支)</th>
                    <th>未回(支)</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="it in row.items" :key="it.id">
                    <td>{{ it.orderNo || '—' }}</td>
                    <td>{{ it.productionNo || '—' }}</td>
                    <td>{{ it.productModel || '—' }}</td>
                    <td class="eg-center">{{ it.dimensionText || '—' }}</td>
                    <td class="eg-center">{{ it.cycleCode || '—' }}</td>
                    <td class="eg-center">{{ Number(it.sendWeight) }}</td>
                    <td class="eg-center">{{ Number(it.unitWeight) }}</td>
                    <td class="eg-center">{{ it.sendQty }}</td>
                    <td class="eg-center" :class="{ 'eg-over': it.returnedQty > it.sendQty }">{{ it.returnedQty }}</td>
                    <td class="eg-center">{{ Math.max(it.sendQty - it.returnedQty, 0) }}</td>
                    <td>{{ it.remark || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="发坯单号" width="120" fixed="left">
          <template #default="{ row }">{{ formatBlankNo(row.blankNo) }}</template>
        </el-table-column>
        <el-table-column label="加工商" prop="processorName" min-width="130" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="表面处理" width="100">
          <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
        </el-table-column>
        <el-table-column label="颜色" prop="color" width="80">
          <template #default="{ row }">{{ row.color || '—' }}</template>
        </el-table-column>
        <el-table-column label="计划发外" width="105">
          <template #default="{ row }">{{ dateText(row.planSendDate) }}</template>
        </el-table-column>
        <el-table-column label="实际发外" width="105">
          <template #default="{ row }">{{ dateText(row.actualSendDate) }}</template>
        </el-table-column>
        <el-table-column label="要求回货" width="105">
          <template #default="{ row }">{{ dateText(row.requireBackDate) }}</template>
        </el-table-column>
        <el-table-column label="明细" width="60">
          <template #default="{ row }">{{ row.itemCount ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="发出/回货(支)" width="120">
          <template #default="{ row }">
            <span>{{ row.totalSendQty ?? 0 }}</span>
            <span class="sep">/</span>
            <span :class="{ 'qty-over': (row.totalReturnedQty ?? 0) > (row.totalSendQty ?? 0) }">{{ row.totalReturnedQty ?? 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="tagTypeOf(OUTSOURCE_STATUS, row.status)">{{ labelOf(OUTSOURCE_STATUS, row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="290" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button
                v-if="row.status === OUTSOURCE_STATUS_VALUE.PENDING"
                size="small" v-permission.disable="'outsource:update'"
                link type="primary" class="btn-edit" :icon="Edit"
                @click="openEdit(row)"
              >编辑</el-button>
              <el-button
                v-if="row.status === OUTSOURCE_STATUS_VALUE.PENDING"
                size="small" v-permission.disable="'outsource:send'" link type="success" :icon="Promotion"
                @click="openSend(row)"
              >登记发出</el-button>
              <el-button
                v-if="canReturn(row)"
                size="small" v-permission.disable="'outsource:return'" link type="warning" :icon="Box"
                @click="openReturn(row)"
              >回货登记</el-button>
              <el-button
                v-if="row.status === OUTSOURCE_STATUS_VALUE.PARTIAL_RETURNED"
                size="small" v-permission.disable="'outsource:close'" link type="info" :icon="CircleCheck"
                @click="onClose(row)"
              >关闭</el-button>
              <el-button
                v-if="row.status === OUTSOURCE_STATUS_VALUE.PENDING"
                size="small" v-permission.disable="'outsource:cancel'" link type="danger" :icon="Delete"
                :loading="actingId === row.id" @click="onCancel(row)"
              >作废</el-button>
              <el-button
                size="small" v-permission.disable="'outsource:print'" link type="primary" :icon="Printer"
                @click="openPrint(row)"
              >打印</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <!-- 登记发出：填实际发外日期 -->
    <el-dialog v-model="sendVisible" title="登记发出" width="380px">
      <el-form label-width="100px" size="small">
        <el-form-item label="发坯单号">
          <span>{{ formatBlankNo(sendRow?.blankNo) }}</span>
        </el-form-item>
        <el-form-item label="实际发外日期" required>
          <el-date-picker v-model="sendDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="sendVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="sendLoading" @click="onSendConfirm">确定</el-button>
      </template>
    </el-dialog>

    <return-dialog v-model="returnVisible" :doc-id="returnDocId" @changed="load" />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Search, CircleCheck, Promotion, Box, Printer } from '@element-plus/icons-vue';
import {
  getOutsourceList,
  sendOutsource,
  closeOutsource,
  cancelOutsource,
  type OutsourceDocItem,
} from '@/api/outsource';
import {
  OUTSOURCE_STATUS,
  OUTSOURCE_STATUS_VALUE,
  SURFACE_NONE,
  formatBlankNo,
  labelOf,
  tagTypeOf,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';
import ReturnDialog from './components/ReturnDialog.vue';

const router = useRouter();
const loading = ref(false);
const list = ref<OutsourceDocItem[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: undefined as number | undefined,
  surfaceType: undefined as string | undefined,
});
const dateRange = ref<[string, string] | null>(null);

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
/** 外发可选表面处理 = 字典项去掉保留值 none（无表面处理不外发） */
const outsourceSurfaces = computed(() => surfaceDict.value.filter((o) => o.value !== SURFACE_NONE));

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

function openCreate() {
  router.push({ name: 'OutsourceForm' });
}
function openEdit(row: OutsourceDocItem) {
  router.push({ name: 'OutsourceForm', query: { id: row.id } });
}
function openPrint(row: OutsourceDocItem) {
  router.push({ name: 'OutsourcePrint', query: { id: row.id } });
}

/* ===== 展示辅助 ===== */
function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
function dateText(v: string | null): string {
  return v ? String(v).slice(0, 10) : '—';
}
/** 已发出~已回齐之间均可继续登记回货（已回齐后补登尾数亦允许） */
function canReturn(row: OutsourceDocItem): boolean {
  return [
    OUTSOURCE_STATUS_VALUE.SENT,
    OUTSOURCE_STATUS_VALUE.PARTIAL_RETURNED,
    OUTSOURCE_STATUS_VALUE.RETURNED_ALL,
  ].includes(row.status as never);
}

/* ===== 登记发出 ===== */
const sendVisible = ref(false);
const sendLoading = ref(false);
const sendRow = ref<OutsourceDocItem | null>(null);
const sendDate = ref<string>('');
function openSend(row: OutsourceDocItem) {
  sendRow.value = row;
  sendDate.value = row.planSendDate ? String(row.planSendDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
  sendVisible.value = true;
}
async function onSendConfirm() {
  if (!sendRow.value || !sendDate.value) {
    ElMessage.warning('请选择实际发外日期');
    return;
  }
  sendLoading.value = true;
  try {
    await sendOutsource(sendRow.value.id, sendDate.value);
    ElMessage.success('已登记发出');
    sendVisible.value = false;
    load();
  } finally {
    sendLoading.value = false;
  }
}

/* ===== 回货登记 ===== */
const returnVisible = ref(false);
const returnDocId = ref<number | null>(null);
function openReturn(row: OutsourceDocItem) {
  returnDocId.value = row.id;
  returnVisible.value = true;
}

/* ===== 关闭 / 作废 ===== */
const actingId = ref<number | null>(null);
async function onClose(row: OutsourceDocItem) {
  const { value } = await ElMessageBox.prompt(
    `确定把发坯单「${formatBlankNo(row.blankNo)}」关闭为已回齐吗？未回尾数将不再跟踪，请填写原因。`,
    '关闭发坯单',
    {
      inputPlaceholder: '如：尾数损耗核销、加工商确认不再回货',
      inputValidator: (v: string) => (v && v.trim() ? true : '关闭原因必填'),
      type: 'warning',
    },
  );
  actingId.value = row.id;
  try {
    await closeOutsource(row.id, String(value).trim());
    ElMessage.success('已关闭为已回齐');
    load();
  } finally {
    actingId.value = null;
  }
}
async function onCancel(row: OutsourceDocItem) {
  await ElMessageBox.confirm(
    `确定作废发坯单「${formatBlankNo(row.blankNo)}」吗？已登记发出或已有回货的单不可作废。`,
    '作废发坯单',
    { type: 'warning', confirmButtonText: '作废', confirmButtonClass: 'el-button--danger' },
  );
  actingId.value = row.id;
  try {
    await cancelOutsource(row.id);
    ElMessage.success('已作废');
    load();
  } finally {
    actingId.value = null;
  }
}
</script>

<script lang="ts">
export default { name: 'OutsourceList' };
</script>

<style scoped lang="scss">
.toolbar { margin-bottom: 12px; }
.pager { margin-top: 12px; }
.sep { margin: 0 3px; color: var(--el-text-color-placeholder); }
.qty-over { color: var(--el-color-warning); font-weight: 600; }
.expand-wrap { padding: 8px 16px 8px 56px; }
.expand-grid {
  width: 100%; max-width: 1400px; border-collapse: collapse; font-size: 13px;
  th, td { border: 1px solid var(--el-border-color); padding: 5px 10px; text-align: left; }
  th { background: var(--el-fill-color-light); font-weight: 600; text-align: center; white-space: nowrap; }
  .eg-center { text-align: center; }
  .eg-over { color: var(--el-color-warning); font-weight: 600; }
}
</style>
