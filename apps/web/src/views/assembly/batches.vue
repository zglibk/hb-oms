<template>
  <div class="page">
    <el-card shadow="never" v-loading="loading">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">装配批次</span>
          <span v-if="data?.product" class="title-sub">{{ data.product.productModel || '—' }}</span>
        </div>
        <div>
          <el-button size="small" @click="goBack">关闭</el-button>
        </div>
      </div>

      <!-- 订单侧头信息 -->
      <div v-if="data?.product" class="bd-head">
        <span class="bd-meta">订单号 {{ data.product.orderNo || '—' }}</span>
        <span class="bd-meta">生产单号 {{ data.product.productionNo || '—' }}</span>
        <span class="bd-meta">{{ data.product.customerName || '—' }}</span>
        <span class="bd-meta">规格 {{ data.product.dimensionText || '—' }}</span>
        <span class="bd-meta">订单数 <b>{{ data.product.qtyPcs }}</b> 支</span>
        <!-- disable-transitions：同产品间切换时 v-if 翻转可能发生在不可见状态，
             el-tag 的 zoom 过渡收不到 transitionend 会把节点留在 DOM 里（弹窗时代实测踩过） -->
        <el-tag v-if="data.product.socket" size="small" type="warning" disable-transitions>含卡口 · 左右分开核算</el-tag>
      </div>

      <!-- 分边别小计：已完成装配 / 已入库 / 可入库量 -->
      <div v-if="data?.sides?.length" class="bd-sides">
        <div v-for="s in data.sides" :key="s.side || 'none'" class="bd-side-card">
          <div class="bd-side-title">
            {{ s.sideLabel ? `${s.sideLabel}边` : '整套' }}
          </div>
          <div class="bd-side-nums">
            <span>已录 <b>{{ s.plannedQty }}</b></span>
            <span>已完成 <b class="ok">{{ s.assembledQty }}</b></span>
            <span>已入库 <b>{{ s.inboundQty }}</b></span>
            <span>
              可入库
              <b :class="s.quota < 0 ? 'bad' : 'quota'">{{ s.quota }}</b>
            </span>
          </div>
        </div>
      </div>

      <!-- 批次列表（排产全貌 + 编辑/删除入口） -->
      <div class="bd-section-title">批次列表</div>
      <el-table :data="data?.list ?? []" border stripe size="small" empty-text="暂无装配批次，请在下方录入">
        <el-table-column type="index" label="#" width="46" align="center" />
        <el-table-column v-if="socket" label="边别" width="70" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="装配车间" width="100" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.workshop" :seed="row.workshop">{{ dictLabel(workshopDict, row.workshop) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="计划开始" width="115" align="center">
          <template #default="{ row }">{{ dateText(row.planStartDate) }}</template>
        </el-table-column>
        <el-table-column label="计划完成" width="115" align="center">
          <template #default="{ row }">{{ dateText(row.planDate) }}</template>
        </el-table-column>
        <el-table-column label="实际完成" width="115" align="center">
          <template #default="{ row }">{{ dateText(row.actualDate) }}</template>
        </el-table-column>
        <el-table-column label="装配数量(支)" width="110" align="center" prop="qty" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="tagTypeOf(ASSEMBLY_STATUS, row.status)">
              {{ labelOf(ASSEMBLY_STATUS, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <!-- 只有录入人与装配主管角色能改 / 删（服务端另有硬校验） -->
              <el-button
                size="small" v-permission.disable="'assembly:update'" link type="primary" :icon="Edit"
                :disabled="row.canModify === false" :title="row.canModify === false ? NOT_OWNER_TIP : undefined"
                @click="startEdit(row)"
              >编辑</el-button>
              <el-button
                size="small" v-permission.disable="'assembly:delete'" link type="danger" :icon="Delete"
                :disabled="row.canModify === false" :title="row.canModify === false ? NOT_OWNER_TIP : undefined"
                :loading="removingId === row.id" @click="onRemove(row)"
              >删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </el-table>

      <!-- 装配完成历史：按实际完成日期倒序的完成履历（谁在什么时候登记完成了多少支） -->
      <template v-if="doneHistory.length">
        <div class="bd-section-title">
          装配完成历史
          <span class="bd-section-sub">已完成 {{ doneHistory.length }} 批 · 共 {{ doneQtyTotal }} 支</span>
          <el-button
            link size="small" type="primary"
            :icon="historyCollapsed ? ArrowDown : ArrowUp"
            @click="historyCollapsed = !historyCollapsed"
          >{{ historyCollapsed ? '展开' : '收起' }}</el-button>
        </div>
        <el-table v-show="!historyCollapsed" :data="doneHistory" border stripe size="small" max-height="260">
          <el-table-column type="index" label="#" width="46" align="center" />
          <el-table-column label="完成日期" width="115" align="center">
            <template #default="{ row }">{{ dateText(row.actualDate) }}</template>
          </el-table-column>
          <el-table-column v-if="socket" label="边别" width="70" align="center">
            <template #default="{ row }">
              <color-tag v-if="row.side" :seed="row.side">{{ sideLabel(row.side) }}</color-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="装配车间" width="100" align="center">
            <template #default="{ row }">
              <color-tag v-if="row.workshop" :seed="row.workshop">{{ dictLabel(workshopDict, row.workshop) }}</color-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="数量(支)" width="90" align="center">
            <template #default="{ row }">
              <span class="qty-done">{{ row.qty }}</span>
            </template>
          </el-table-column>
          <el-table-column label="登记人" width="100" align="center">
            <template #default="{ row }">
              <color-tag v-if="registrant(row) !== '—'" :seed="registrant(row)">{{ registrant(row) }}</color-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="登记时间" width="150" align="center">
            <template #default="{ row }">{{ minuteText(row.updatedAt ?? row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="备注" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 录入 / 编辑批次：标题放盒子外，竖条与上方两节标题垂直对齐 -->
      <div class="bd-section-title">
        {{ editingId ? `编辑第 ${editingIndex} 批` : '录入新批次' }}
        <el-button v-if="editingId" size="small" link type="info" @click="resetDraft">取消编辑</el-button>
      </div>
      <div class="bd-form">
        <el-form :inline="true" size="small" @submit.prevent>
          <el-form-item v-if="socket" label="边别" required>
            <el-select v-model="draft.side" :disabled="!!editingId" style="width: 90px" placeholder="选择">
              <el-option v-for="o in SIDE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="装配车间">
            <el-select v-model="draft.workshop" clearable style="width: 120px" placeholder="选择车间">
              <el-option v-for="o in workshopDict" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="计划开始">
            <el-date-picker
              v-model="draft.planStartDate" type="date" value-format="YYYY-MM-DD" clearable
              style="width: 140px" placeholder="预计开工"
            />
          </el-form-item>
          <el-form-item label="计划完成">
            <el-date-picker
              v-model="draft.planDate" type="date" value-format="YYYY-MM-DD" clearable
              style="width: 140px" placeholder="预计完工"
            />
          </el-form-item>
          <el-form-item label="实际完成">
            <el-date-picker
              v-model="draft.actualDate" type="date" value-format="YYYY-MM-DD" clearable
              style="width: 140px" placeholder="留空=计划中"
            />
          </el-form-item>
          <el-form-item label="装配数量">
            <el-input-number v-model="draft.qty" :min="1" :precision="0" :step="1" style="width: 120px" />
            <span class="bd-unit">支</span>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="draft.remark" style="width: 140px" />
          </el-form-item>
          <el-form-item>
            <el-button
              size="small" type="primary"
              v-permission.disable="editingId ? 'assembly:update' : 'assembly:create'"
              :loading="submitting" @click="onSubmit"
            >{{ editingId ? '保存修改' : '录入批次' }}</el-button>
          </el-form-item>
        </el-form>
        <div v-if="draft.actualDate" class="bd-hint ok">
          <el-icon><CircleCheck /></el-icon>
          已填实际完成时间 = 该批已完成，{{ draft.qty || 0 }} 支将计入可入库量
        </div>
        <div v-else class="bd-hint">
          <el-icon><Clock /></el-icon>
          未填实际完成时间 = 该批仍为「计划中」，不计入可入库量
        </div>
        <div v-if="overAssembled" class="bd-hint warn">
          <el-icon><WarningFilled /></el-icon>
          本批录入后该{{ socket ? '边别' : '产品' }}已录装配量将超过订单数（超装配属正常，可继续提交）
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, ArrowUp, Back, Delete, Edit, CircleCheck, Clock, WarningFilled } from '@element-plus/icons-vue';
import {
  getAssemblyBatches,
  createAssemblyBatch,
  updateAssemblyBatch,
  removeAssemblyBatch,
  type AssemblyBatchRow,
  type AssemblyBatchesResult,
} from '@/api/assembly';
import { ASSEMBLY_STATUS, SIDE_OPTIONS, labelOf, sideLabel, tagTypeOf } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import AppActions from '@/components/AppActions.vue';
import ColorTag from '@/components/ColorTag.vue';

const route = useRoute();
const router = useRouter();
/** 不是自己录的批次：只有录入人与装配主管角色能改 / 删 */
const NOT_OWNER_TIP = '只有录入人或主管角色（如计划经理、生产经理）可以修改、删除这条批次';
/** 锚点产品行：来自装配列表「录装配」跳转的 query（同页切产品时 watch 重新加载） */
const orderProductId = computed(() => (route.query.orderProductId ? Number(route.query.orderProductId) : null));

const loading = ref(false);
const submitting = ref(false);
const removingId = ref<number | null>(null);
const data = ref<AssemblyBatchesResult | null>(null);

const socket = computed(() => !!data.value?.product?.socket);

const workshopDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('assembly_workshop').then((rows: any[]) => {
  workshopDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

const today = () => new Date().toISOString().slice(0, 10);

interface BatchDraft {
  side: string;
  workshop: string;
  planStartDate: string | null;
  planDate: string | null;
  actualDate: string | null;
  qty: number;
  remark: string;
}
const draft = reactive<BatchDraft>({
  side: '',
  workshop: '',
  planStartDate: today(),
  planDate: null,
  actualDate: null,
  qty: 1,
  remark: '',
});
const editingId = ref<number | null>(null);
const editingIndex = ref(0);

function resetDraft() {
  editingId.value = null;
  editingIndex.value = 0;
  draft.side = socket.value ? 'left' : '';
  // 车间不再从订单继承（订单环节已不安排装配车间）；沿用该产品最近一条批次的车间做默认值，
  // 一个产品多批通常同车间，仍可逐批改；该产品还没有批次时留空由计划员选
  const batches = data.value?.list ?? [];
  draft.workshop = batches[batches.length - 1]?.workshop ?? '';
  draft.planStartDate = today();
  draft.planDate = today();
  draft.actualDate = null;
  draft.qty = defaultQty();
  draft.remark = '';
}

/**
 * 该边别的应排产量：非卡口 = 产品订单数；含卡口左右各半，
 * **奇数支左边多一支**（Math.ceil / 减法），与共享包 expandPartRows 同口径，保证合计守恒。
 */
function sideTarget(side: string): number {
  const p = data.value?.product;
  if (!p) return 0;
  if (!socket.value) return p.qtyPcs;
  const left = Math.ceil(p.qtyPcs / 2);
  return side === 'right' ? p.qtyPcs - left : left;
}

/** 默认数量 = 该边别未排产量（不足则 1），减少计划员手工输入 */
function defaultQty(): number {
  if (!data.value?.product) return 1;
  const s = data.value?.sides.find((x) => x.side === draft.side);
  const done = s?.plannedQty ?? 0;
  return Math.max(sideTarget(draft.side) - done, 1);
}

async function load() {
  if (!orderProductId.value) return;
  loading.value = true;
  try {
    data.value = await getAssemblyBatches({ orderProductId: orderProductId.value });
    resetDraft();
  } finally {
    loading.value = false;
  }
}
load();
watch(orderProductId, () => {
  if (orderProductId.value) load();
});
watch(
  () => draft.side,
  () => {
    if (!editingId.value) draft.qty = defaultQty();
  },
);

/* ===== 装配完成历史（actual_date 非空即已完成，§5.6 不依赖 status 列） ===== */
/** 默认折叠：标题行的批数/支数合计常看，逐条明细按需展开（同订单表单「订单备注」交互） */
const historyCollapsed = ref(true);
const doneHistory = computed<AssemblyBatchRow[]>(() =>
  (data.value?.list ?? [])
    .filter((b) => b.actualDate)
    .sort((a, b) => {
      const d = String(b.actualDate).localeCompare(String(a.actualDate));
      return d !== 0 ? d : b.id - a.id;
    }),
);
const doneQtyTotal = computed(() => doneHistory.value.reduce((s, b) => s + (b.qty || 0), 0));
/** 登记人口径：完成时间常由后来编辑补录，最后更新人即完成登记人；从未编辑过则为录入人 */
function registrant(row: AssemblyBatchRow): string {
  return row.updaterName || row.creatorName || '—';
}
function minuteText(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const s = typeof v === 'string' ? v : v.toISOString();
  return s.slice(0, 16).replace('T', ' ');
}

/** 本批录入后该边别已录量是否超过订单数（超装配允许，仅提示） */
const overAssembled = computed(() => {
  if (!data.value?.product || !draft.qty) return false;
  const s = data.value?.sides.find((x) => x.side === draft.side);
  const already = (s?.plannedQty ?? 0) - (editingId.value ? originalQty.value : 0);
  return already + draft.qty > sideTarget(draft.side);
});
const originalQty = ref(0);

function startEdit(row: AssemblyBatchRow) {
  editingId.value = row.id;
  editingIndex.value = (data.value?.list ?? []).findIndex((b) => b.id === row.id) + 1;
  originalQty.value = row.qty;
  draft.side = row.side;
  draft.workshop = row.workshop ?? '';
  draft.planStartDate = row.planStartDate ? String(row.planStartDate).slice(0, 10) : null;
  draft.planDate = row.planDate ? String(row.planDate).slice(0, 10) : null;
  draft.actualDate = row.actualDate ? String(row.actualDate).slice(0, 10) : null;
  draft.qty = row.qty;
  draft.remark = row.remark ?? '';
}

async function onSubmit() {
  if (!orderProductId.value) return;
  if (socket.value && !draft.side) {
    ElMessage.warning('该产品含卡口，请选择左/右边别');
    return;
  }
  if (!draft.planDate && !draft.actualDate) {
    ElMessage.warning('计划完成时间与实际完成时间至少填写一个');
    return;
  }
  if (draft.planStartDate && draft.planDate && draft.planStartDate > draft.planDate) {
    ElMessage.warning('计划开始时间不能晚于计划完成时间');
    return;
  }
  if (!draft.qty || draft.qty <= 0) {
    ElMessage.warning('装配数量必须大于 0');
    return;
  }
  submitting.value = true;
  try {
    const body = {
      workshop: draft.workshop || undefined,
      planStartDate: draft.planStartDate || null,
      planDate: draft.planDate || null,
      actualDate: draft.actualDate || null,
      qty: draft.qty,
      remark: draft.remark || undefined,
    };
    if (editingId.value) {
      await updateAssemblyBatch(editingId.value, body);
      ElMessage.success('批次已更新');
    } else {
      await createAssemblyBatch({
        orderProductId: orderProductId.value,
        side: socket.value ? draft.side : '',
        ...body,
      });
      ElMessage.success('批次已录入');
    }
    await load();
  } finally {
    submitting.value = false;
  }
}

async function onRemove(row: AssemblyBatchRow) {
  await ElMessageBox.confirm(
    row.actualDate
      ? '该批次已完成，删除后其装配量将从可入库量中扣除；若已有成品入库消耗，删除会被拒绝。确定删除吗？'
      : '确定删除这条装配批次吗？',
    '删除装配批次',
    { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  );
  removingId.value = row.id;
  try {
    await removeAssemblyBatch(row.id);
    ElMessage.success('已删除');
    if (editingId.value === row.id) resetDraft();
    await load();
  } finally {
    removingId.value = null;
  }
}

function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
function dateText(v: string | null): string {
  return v ? String(v).slice(0, 10) : '—';
}
function goBack() {
  router.push('/assembly');
}
</script>

<script lang="ts">
export default { name: 'AssemblyBatches' };
</script>

<style scoped lang="scss">
.form-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  .form-title { display: flex; align-items: center; gap: 12px; }
  .title-text { font-size: 16px; font-weight: 600; }
  .title-sub { color: var(--el-text-color-secondary); font-size: 13px; }
}
.bd-head {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  .bd-meta { color: var(--el-text-color-secondary); font-size: 13px; }
  .bd-meta b { color: var(--el-text-color-primary); }
}
.bd-sides {
  display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;
  .bd-side-card {
    flex: 1 1 240px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px;
    padding: 8px 12px; background: var(--el-fill-color-lighter);
  }
  .bd-side-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .bd-side-nums {
    display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px;
    color: var(--el-text-color-secondary);
    b { color: var(--el-text-color-primary); font-size: 13px; }
    b.ok { color: var(--el-color-success); }
    b.quota { color: var(--el-color-primary); }
    b.bad { color: var(--el-color-danger); }
  }
}
/* 完成历史的数量：绿色标示（完成量与分边卡「已完成」同色系） */
.qty-done { color: var(--el-color-success); font-weight: 600; }
.bd-section-title {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; font-weight: 600; margin: 12px 0 8px;
  /* 左侧主色竖条模拟标题图标（与订单表单 .section-title 同款） */
  border-left: 4px solid var(--el-color-primary); padding-left: 8px;
  .bd-section-sub { color: var(--el-text-color-secondary); font-weight: 400; font-size: 12px; }
}
.bd-form {
  background: var(--el-fill-color-lighter);
  border-radius: 6px; padding: 10px 12px 4px;
  .bd-unit { margin-left: 4px; color: var(--el-text-color-secondary); font-size: 12px; }
}
.bd-hint {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--el-text-color-secondary); padding: 0 0 8px 2px;
  &.ok { color: var(--el-color-success); }
  &.warn { color: var(--el-color-warning); }
}
</style>
