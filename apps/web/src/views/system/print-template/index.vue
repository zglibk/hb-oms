<template>
  <div class="page">
    <el-card shadow="never" class="intro">
      <div class="intro__text">
        <strong>打印模板</strong>
        <span>
          不同客户要的送货单版式不一样（列、联系电话、签名项都不同）。这里能看到每套模板的实际效果，
          并指定<strong>全局默认模板</strong>——它只在客户资料没单独绑定模板时才用。
          给某个客户单独指定，请到「基础数据 → 客户资料」改该客户的「送货单模板」。
        </span>
      </div>
    </el-card>

    <div class="layout">
      <!-- ==================== 左：模板列表 ==================== -->
      <el-card shadow="never" class="tpl-list">
        <div class="tpl-list__title">送货单模板（{{ DELIVERY_TEMPLATES.length }}）</div>
        <div class="tpl-list__items">
          <div
            v-for="t in DELIVERY_TEMPLATES" :key="t.code"
            class="tpl-item" :class="{ 'tpl-item--active': current === t.code }"
            @click="current = t.code"
          >
            <div class="tpl-item__head">
              <span class="tpl-item__name">{{ t.name }}</span>
              <!-- disable-transitions 必须带：el-tag 默认有 zoom 过渡，v-if 翻转时若过渡没走完，
                   旧节点会留在 DOM 里——换默认模板后会同时出现两个「默认」标记（已实测，
                   与 CLAUDE.md 记的装配批次弹窗同一个坑） -->
              <el-tag v-if="t.code === defaultCode" size="small" type="success" disable-transitions>默认</el-tag>
            </div>
            <div class="tpl-item__desc" :title="t.description">{{ t.description }}</div>
          </div>
        </div>

        <div class="tpl-list__foot">
          <el-button
            size="small" type="primary" v-permission.disable="'config:update'"
            :loading="saving" :disabled="current === defaultCode" @click="onSetDefault"
          >设为默认模板</el-button>
          <p class="tpl-list__hint">
            当前默认：<strong>{{ defaultName }}</strong>
          </p>
        </div>
      </el-card>

      <!-- ==================== 右：效果预览 ==================== -->
      <el-card shadow="never" class="preview">
        <div class="preview__bar">
          <el-radio-group v-model="source" size="small" @change="onSourceChange">
            <el-radio-button value="sample">样例数据</el-radio-button>
            <el-radio-button value="real">真实单据</el-radio-button>
          </el-radio-group>

          <el-select
            v-if="source === 'real'"
            v-model="docId" size="small" filterable remote clearable
            :remote-method="searchDocs" :loading="docLoading"
            placeholder="选一张销售出库单" style="width: 300px"
            @change="loadRealNote"
          >
            <el-option v-for="d in docOptions" :key="d.id" :label="d.label" :value="d.id" />
          </el-select>

          <span class="preview__tip">
            纸面按 A4 纵向等比缩放显示（{{ Math.round(scale * 100) }}%），与实际打印一致
          </span>
        </div>

        <div ref="stageRef" class="preview__stage" v-loading="noteLoading">
          <div
            v-if="note" class="preview__scaler"
            :style="{ transform: `scale(${scale})`, height: `${SHEET_H * scale}px` }"
          >
            <delivery-note-sheet :note="note" :template-code="current" class="preview__sheet" />
          </div>
          <el-empty v-else :description="emptyText" />
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  DELIVERY_TEMPLATES,
  SAMPLE_DELIVERY_NOTE,
  DEFAULT_DELIVERY_TEMPLATE,
  deliveryTemplateOf,
} from '@/constants/delivery-note';
import DeliveryNoteSheet from '@/components/print/DeliveryNoteSheet.vue';
import { getDeliveryNote, getFinishedDocList, type DeliveryNote } from '@/api/finished-stock';
import { updateSystemConfig } from '@/api/system';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useFeatureStore } from '@/stores/feature';
import { FINISHED_BIZ_TYPE } from '@/constants/dict';

/**
 * 「系统管理 → 打印模板」：看每套送货单模板的实际效果，并指定全局默认模板。
 *
 * **纸面用的是与打印页同一个 `DeliveryNoteSheet` 组件**——预览与实际打印必须是同一套
 * 渲染，各写一份迟早出现「预览好好的、打出来不是那样」。
 *
 * 模板本身是**代码定义的**（前端注册表 constants/delivery-note.ts），本页只读不改：
 * 加一套新客户版式要改那份注册表，属于开发动作。这里能改的只有「哪套当默认」。
 */

const { deliveryTemplateDefault } = useFeatureFlags();
const featureStore = useFeatureStore();

/** A4 纸面在 96dpi 下的像素尺寸（210×297mm），用于算缩放比与占位高度 */
const SHEET_W = 210 * (96 / 25.4);
const SHEET_H = 297 * (96 / 25.4);

const current = ref(DEFAULT_DELIVERY_TEMPLATE);
const defaultCode = computed(() => deliveryTemplateDefault.value || DEFAULT_DELIVERY_TEMPLATE);
const defaultName = computed(() => deliveryTemplateOf(defaultCode.value).name);

/* ===== 预览数据源：样例 / 真实单据 ===== */
const source = ref<'sample' | 'real'>('sample');
const note = ref<DeliveryNote | null>(SAMPLE_DELIVERY_NOTE as unknown as DeliveryNote);
const noteLoading = ref(false);
const emptyText = ref('选一张销售出库单查看效果');

const docId = ref<number>();
const docOptions = ref<Array<{ id: number; label: string }>>([]);
const docLoading = ref(false);

async function searchDocs(keyword?: string) {
  docLoading.value = true;
  try {
    // 只列销售出库单——其余单据类型本就打不出送货单（服务端同样守卫）
    const res = await getFinishedDocList({
      page: 1,
      pageSize: 20,
      bizType: FINISHED_BIZ_TYPE.SALE_OUTBOUND,
      keyword: keyword || undefined,
    });
    docOptions.value = (res.list || []).map((d) => ({
      id: d.id,
      label: `${d.docNo}  ${d.docDate}  ${d.items?.[0]?.customerName ?? ''}`.trim(),
    }));
  } catch {
    // 没有成品出入库查看权限时会 403：不弹错，下面的空状态已说明
    docOptions.value = [];
  } finally {
    docLoading.value = false;
  }
}

async function loadRealNote(id?: number) {
  if (!id) {
    note.value = null;
    emptyText.value = '选一张销售出库单查看效果';
    return;
  }
  noteLoading.value = true;
  try {
    note.value = await getDeliveryNote(id);
    // 真实单据带着客户绑定的模板，跟着切过去更符合直觉（仍可手动点别的模板对比）
    if (note.value.templateCode) current.value = note.value.templateCode;
  } catch (err: any) {
    note.value = null;
    emptyText.value = err?.response?.data?.message || '该单据取不到送货单数据';
    ElMessage.error(emptyText.value);
  } finally {
    noteLoading.value = false;
  }
}

function onSourceChange(v: string | number | boolean | undefined) {
  if (v === 'sample') {
    note.value = SAMPLE_DELIVERY_NOTE as unknown as DeliveryNote;
    return;
  }
  note.value = null;
  emptyText.value = '选一张销售出库单查看效果';
  if (!docOptions.value.length) void searchDocs();
}

/* ===== 设为默认模板 ===== */
const saving = ref(false);
async function onSetDefault() {
  saving.value = true;
  try {
    await updateSystemConfig({ deliveryTemplateDefault: current.value });
    // 立刻刷新全局开关，本人无需重登即可在打印页看到新默认值
    await featureStore.load();
    ElMessage.success(`已把「${deliveryTemplateOf(current.value).name}」设为默认模板`);
  } catch (err: any) {
    ElMessage.error(err?.message || '保存失败，请重试');
  } finally {
    saving.value = false;
  }
}

/* ===== 纸面等比缩放：按预览区实际宽度算，窗口变化跟随 ===== */
const stageRef = ref<HTMLElement>();
const scale = ref(1);
let ro: ResizeObserver | undefined;

function fit() {
  const w = stageRef.value?.clientWidth ?? 0;
  // 左右各留 24px 呼吸位；不放大超过 100%（放大会糊，也没意义）
  scale.value = w ? Math.min(1, (w - 48) / SHEET_W) : 1;
}

onMounted(() => {
  // 进页面时把默认模板选中，让「当前默认长什么样」是第一眼看到的
  current.value = defaultCode.value;
  fit();
  if (typeof ResizeObserver !== 'undefined' && stageRef.value) {
    ro = new ResizeObserver(fit);
    ro.observe(stageRef.value);
  }
});
onBeforeUnmount(() => ro?.disconnect());
</script>

<script lang="ts">
export default { name: 'PrintTemplate' };
</script>

<style scoped>
.page { padding: 12px; }

.intro { margin-bottom: 12px; }
.intro__text { display: flex; align-items: baseline; gap: 12px; }
.intro__text strong { flex: none; font-size: 15px; }
.intro__text span { color: #606266; font-size: 13px; line-height: 1.7; }

.layout { display: flex; gap: 12px; align-items: flex-start; }

/* ===== 左：模板列表 ===== */
.tpl-list { width: 280px; flex: none; }
.tpl-list__title { margin-bottom: 10px; font-weight: 600; }
.tpl-list__items {
  max-height: calc(100vh - 300px);
  overflow-y: auto;
  padding-right: 4px;
}

.tpl-item {
  padding: 7px 10px;
  margin-bottom: 6px;
  border: 1px solid #e4e7ed;
  border-radius: 5px;
  cursor: pointer;
  transition: border-color .15s, background-color .15s;
}
.tpl-item:hover { border-color: var(--el-color-primary-light-5); }
.tpl-item--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.tpl-item__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tpl-item__name { font-weight: 600; }
.tpl-item__desc {
  margin-top: 2px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.tpl-list__foot { margin-top: 12px; padding-top: 12px; border-top: 1px solid #ebeef5; }
.tpl-list__hint { margin: 8px 0 0; color: #909399; font-size: 12px; }

/* ===== 右：预览 ===== */
.preview { flex: 1; min-width: 0; }
.preview__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.preview__tip { color: #909399; font-size: 12px; }

.preview__stage {
  background: #eef0f3;
  padding: 24px;
  border-radius: 4px;
  overflow: auto;
}
/* 缩放以左上角为原点，外层用 height 抵掉 transform 不占位造成的空白 */
.preview__scaler { transform-origin: top left; }
.preview__sheet { box-shadow: 0 3px 18px rgb(0 0 0 / 14%); }
</style>
