<template>
  <el-dialog
    :model-value="modelValue"
    title="回货登记"
    width="1000px"
    top="6vh"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="load"
  >
    <div v-loading="loading" class="rd-body">
      <div v-if="doc" class="rd-head">
        <span class="rd-no">{{ formatBlankNo(doc.blankNo) }}</span>
        <span class="rd-meta">{{ doc.processorName }}</span>
        <span class="rd-meta">实际发外：{{ (doc.actualSendDate || '').slice(0, 10) || '—' }}</span>
        <el-tag size="small" :type="tagTypeOf(OUTSOURCE_STATUS, doc.status)">{{ labelOf(OUTSOURCE_STATUS, doc.status) }}</el-tag>
      </div>

      <el-collapse v-model="expanded">
        <el-collapse-item v-for="it in items" :key="it.id" :name="String(it.id)">
          <template #title>
            <div class="rd-item-title">
              <span class="rd-model">{{ it.productModel || '—' }}</span>
              <span class="rd-sub">{{ it.productionNo || '—' }} · {{ it.dimensionText || '—' }}</span>
              <span class="rd-qty">
                发出 <b>{{ it.sendQty }}</b> 支 ／ 已回
                <b :class="{ 'rd-over': it.returnedQty > it.sendQty }">{{ it.returnedQty }}</b> 支
                <span v-if="it.returnedQty < it.sendQty" class="rd-left">（未回 {{ it.sendQty - it.returnedQty }}）</span>
                <el-tag v-else size="small" type="success" class="rd-tag">已回齐</el-tag>
              </span>
            </div>
          </template>

          <!-- 发出数量修正：磅秤复核/折算纠错，改完自动重算回齐状态 -->
          <div v-if="fixes[it.id]" class="rd-fix">
            <el-form :inline="true" size="small" @submit.prevent>
              <el-form-item label="发出重量">
                <el-input-number
                  v-model="fixes[it.id].sendWeight" :min="0" :precision="2" :step="1" :controls="false"
                  style="width: 100px" @change="syncFixQty(it.id)"
                />
                <span class="rd-unit">kg</span>
              </el-form-item>
              <el-form-item label="单重">
                <el-input-number
                  v-model="fixes[it.id].unitWeight" :min="0" :precision="4" :step="0.01" :controls="false"
                  style="width: 100px" @change="syncFixQty(it.id)"
                />
                <span class="rd-unit">kg/支</span>
              </el-form-item>
              <el-form-item label="发出数量">
                <el-input-number v-model="fixes[it.id].sendQty" :min="1" :precision="0" :step="1" style="width: 120px" />
                <span class="rd-unit">支</span>
              </el-form-item>
              <el-form-item label="备注">
                <el-input v-model="fixes[it.id].remark" style="width: 150px" />
              </el-form-item>
              <el-form-item>
                <el-button
                  size="small" v-permission.disable="'outsource:update'" :icon="EditPen"
                  :loading="fixingId === it.id" @click="onFix(it)"
                >修正发出数量</el-button>
              </el-form-item>
            </el-form>
          </div>

          <!-- 已登记的分批回货记录 -->
          <table v-if="it.returns && it.returns.length" class="rd-grid">
            <thead>
              <tr>
                <th>回货日期</th>
                <th>收回重量(kg)</th>
                <th>单重(kg/支)</th>
                <th>收回数量(支)</th>
                <th>备注</th>
                <th>登记人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in it.returns" :key="r.id">
                <td class="c">{{ (r.backDate || '').slice(0, 10) }}</td>
                <td class="c">{{ Number(r.returnWeight) }}</td>
                <td class="c">{{ Number(r.unitWeight) }}</td>
                <td class="c">{{ r.returnQty }}</td>
                <td>{{ r.remark || '—' }}</td>
                <td class="c">{{ r.creatorName || '—' }}</td>
                <td class="c">
                  <el-button
                    size="small" v-permission.disable="'outsource:return-cancel'" link type="danger" :icon="Delete"
                    @click="onRemove(r.id)"
                  >撤销</el-button>
                </td>
              </tr>
            </tbody>
          </table>
          <el-empty v-else description="暂无回货记录" :image-size="48" />

          <!-- 新增一条回货登记 -->
          <div class="rd-form">
            <el-form :inline="true" size="small" @submit.prevent>
              <el-form-item label="回货日期">
                <el-date-picker v-model="drafts[it.id].backDate" type="date" value-format="YYYY-MM-DD" style="width: 140px" />
              </el-form-item>
              <el-form-item label="收回重量">
                <el-input-number
                  v-model="drafts[it.id].returnWeight" :min="0" :precision="2" :step="1" :controls="false"
                  style="width: 100px" @change="syncQty(it.id)"
                />
                <span class="rd-unit">kg</span>
              </el-form-item>
              <el-form-item label="单重">
                <el-input-number
                  v-model="drafts[it.id].unitWeight" :min="0" :precision="4" :step="0.01" :controls="false"
                  style="width: 100px" @change="syncQty(it.id)"
                />
                <span class="rd-unit">kg/支</span>
              </el-form-item>
              <el-form-item label="收回数量">
                <el-input-number v-model="drafts[it.id].returnQty" :min="0" :precision="0" :step="1" style="width: 120px" />
                <span class="rd-unit">支</span>
              </el-form-item>
              <el-form-item label="备注">
                <el-input v-model="drafts[it.id].remark" style="width: 150px" />
              </el-form-item>
              <el-form-item>
                <el-button
                  size="small" type="primary" v-permission.disable="'outsource:return'"
                  :loading="submittingId === it.id" @click="onSubmit(it)"
                >登记</el-button>
              </el-form-item>
            </el-form>
            <div v-if="overTip(it)" class="rd-warn">
              <el-icon><WarningFilled /></el-icon>
              本次登记后累计回货 {{ it.returnedQty + (drafts[it.id].returnQty || 0) }} 支将超过发出数 {{ it.sendQty }} 支（重量折算误差属正常，可继续提交）
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, EditPen, WarningFilled } from '@element-plus/icons-vue';
import {
  getOutsourceDetail,
  createOutsourceReturn,
  removeOutsourceReturn,
  updateOutsourceItem,
  type OutsourceDocItem,
  type OutsourceItemRow,
} from '@/api/outsource';
import {
  OUTSOURCE_STATUS,
  formatBlankNo,
  qtyFromWeight,
  labelOf,
  tagTypeOf,
} from '@/constants/dict';

const props = defineProps<{ modelValue: boolean; docId: number | null }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'changed'): void;
}>();

interface ReturnDraft {
  backDate: string;
  returnWeight: number;
  unitWeight: number;
  returnQty: number;
  remark: string;
}

const loading = ref(false);
const doc = ref<OutsourceDocItem | null>(null);
const items = ref<OutsourceItemRow[]>([]);
const expanded = ref<string[]>([]);
const drafts = reactive<Record<number, ReturnDraft>>({});
const submittingId = ref<number | null>(null);

interface FixDraft {
  sendWeight: number;
  unitWeight: number;
  sendQty: number;
  remark: string;
}
const fixes = reactive<Record<number, FixDraft>>({});
const fixingId = ref<number | null>(null);

const today = () => new Date().toISOString().slice(0, 10);

async function load() {
  if (!props.docId) return;
  loading.value = true;
  try {
    const res = await getOutsourceDetail(props.docId);
    doc.value = res;
    items.value = res.items ?? [];
    // 每行一份草稿：单重默认带出发出行单重，未回数量作为默认收回数量
    items.value.forEach((it) => {
      const unitWeight = Number(it.unitWeight) || 0;
      const left = Math.max(it.sendQty - it.returnedQty, 0);
      drafts[it.id] = {
        backDate: today(),
        returnWeight: unitWeight > 0 ? Math.round(left * unitWeight * 100) / 100 : 0,
        unitWeight,
        returnQty: left,
        remark: '',
      };
      fixes[it.id] = {
        sendWeight: Number(it.sendWeight) || 0,
        unitWeight,
        sendQty: it.sendQty,
        remark: it.remark ?? '',
      };
    });
    // 默认展开尚未回齐的行
    expanded.value = items.value.filter((it) => it.returnedQty < it.sendQty).map((it) => String(it.id));
    if (!expanded.value.length && items.value.length) expanded.value = [String(items.value[0].id)];
  } finally {
    loading.value = false;
  }
}
watch(
  () => props.docId,
  () => {
    if (props.modelValue) load();
  },
);

/** 重量或单重变化 → 自动折算收回数量（共享包同一口径，仍可人工微调） */
function syncQty(itemId: number) {
  const d = drafts[itemId];
  if (!d) return;
  const qty = qtyFromWeight(d.returnWeight, d.unitWeight);
  if (qty > 0) d.returnQty = qty;
}

/** 修正区：重量或单重变化 → 自动折算发出数量（同一共享包口径） */
function syncFixQty(itemId: number) {
  const f = fixes[itemId];
  if (!f) return;
  const qty = qtyFromWeight(f.sendWeight, f.unitWeight);
  if (qty > 0) f.sendQty = qty;
}

async function onFix(it: OutsourceItemRow) {
  const f = fixes[it.id];
  if (!f?.sendQty || f.sendQty <= 0) {
    ElMessage.warning('发出数量必须大于 0');
    return;
  }
  fixingId.value = it.id;
  try {
    await updateOutsourceItem(it.id, {
      sendWeight: f.sendWeight || 0,
      unitWeight: f.unitWeight || 0,
      sendQty: f.sendQty,
      remark: f.remark || undefined,
    });
    ElMessage.success('发出数量已修正，回齐状态同步重算');
    await load();
    emit('changed');
  } finally {
    fixingId.value = null;
  }
}

function overTip(it: OutsourceItemRow): boolean {
  const d = drafts[it.id];
  return !!d && d.returnQty > 0 && it.returnedQty + d.returnQty > it.sendQty;
}

async function onSubmit(it: OutsourceItemRow) {
  const d = drafts[it.id];
  if (!d?.backDate) {
    ElMessage.warning('请选择回货日期');
    return;
  }
  if (!d.returnQty || d.returnQty <= 0) {
    ElMessage.warning('收回数量必须大于 0');
    return;
  }
  submittingId.value = it.id;
  try {
    await createOutsourceReturn(it.id, {
      backDate: d.backDate,
      returnWeight: d.returnWeight || 0,
      unitWeight: d.unitWeight || 0,
      returnQty: d.returnQty,
      remark: d.remark || undefined,
    });
    ElMessage.success('回货登记成功');
    await load();
    emit('changed');
  } finally {
    submittingId.value = null;
  }
}

async function onRemove(returnId: number) {
  await ElMessageBox.confirm('确定撤销这条回货登记吗？撤销后累计回货数与单据状态会自动回退。', '撤销回货登记', {
    type: 'warning',
    confirmButtonText: '撤销',
    confirmButtonClass: 'el-button--danger',
  });
  await removeOutsourceReturn(returnId);
  ElMessage.success('已撤销');
  await load();
  emit('changed');
}
</script>

<script lang="ts">
export default { name: 'OutsourceReturnDialog' };
</script>

<style scoped lang="scss">
.rd-body { max-height: 70vh; overflow-y: auto; }
.rd-head {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  .rd-no { font-size: 15px; font-weight: 600; }
  .rd-meta { color: var(--el-text-color-secondary); font-size: 13px; }
}
.rd-item-title {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap; width: 100%; padding-right: 12px;
  .rd-model { font-weight: 600; }
  .rd-sub { color: var(--el-text-color-secondary); font-size: 12px; }
  .rd-qty { margin-left: auto; font-size: 13px; }
  .rd-left { color: var(--el-color-warning); }
  .rd-over { color: var(--el-color-warning); }
  .rd-tag { margin-left: 6px; }
}
.rd-grid {
  width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 10px;
  th, td { border: 1px solid var(--el-border-color); padding: 5px 10px; text-align: left; }
  th { background: var(--el-fill-color-light); font-weight: 600; text-align: center; white-space: nowrap; }
  .c { text-align: center; }
}
.rd-form {
  background: var(--el-fill-color-lighter); border-radius: 6px; padding: 10px 12px 0;
  .rd-unit { margin-left: 4px; color: var(--el-text-color-secondary); font-size: 12px; }
}
.rd-fix {
  border: 1px dashed var(--el-border-color); border-radius: 6px; padding: 10px 12px 0; margin-bottom: 10px;
  .rd-unit { margin-left: 4px; color: var(--el-text-color-secondary); font-size: 12px; }
}
.rd-warn {
  display: flex; align-items: center; gap: 6px;
  color: var(--el-color-warning); font-size: 12px; padding: 0 0 10px 2px;
}
</style>
