<template>
  <div ref="stageRef" class="sheet-preview">
    <div
      class="sheet-preview__scaler"
      :style="{
        width: `${sheetWidthPx}px`,
        height: `${sheetHeightPx * scale}px`,
        transform: `scale(${scale})`,
      }"
    >
      <delivery-note-sheet :note="note" :template-code="templateCode" :profile-config="profileConfig" class="sheet-preview__sheet" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DeliveryNoteSheet from './DeliveryNoteSheet.vue';
import type { DeliveryNote } from '@/api/finished-stock';
import type { PrintProfileConfig } from '@/api/print-config';
import { printPaperBodyOf } from '@/utils/print-paper';

/**
 * 送货单纸面的**等比缩放预览容器**。
 *
 * 纸面按所选纸型的成品尺寸渲染，塞不进页面容器时等比缩放。
 * 抽成组件是因为出现了第二处（「系统管理 → 打印模板」页、客户资料的模板预览弹窗），
 * 两边各写一份 ResizeObserver + transform 的话，缩放口径迟早不一致（§4.4）。
 *
 * 纸面本身仍由 `DeliveryNoteSheet` 渲染——预览与实际打印必须是同一套渲染。
 */
const props = defineProps<{
  note: DeliveryNote;
  templateCode: string;
  profileConfig?: PrintProfileConfig;
}>();

const MM_TO_PX = 96 / 25.4;
const paperBody = computed(() => props.profileConfig
  ? printPaperBodyOf(props.profileConfig.paper)
  : { widthMm: 210, heightMm: 297 });
const sheetWidthPx = computed(() => paperBody.value.widthMm * MM_TO_PX);
const sheetHeightPx = computed(() => paperBody.value.heightMm * MM_TO_PX);

const stageRef = ref<HTMLElement>();
const scale = ref(1);
let ro: ResizeObserver | undefined;

function fit() {
  const w = stageRef.value?.clientWidth ?? 0;
  // 左右各留 24px 呼吸位；不放大超过 100%（放大只会糊，没有意义）
  scale.value = w ? Math.min(1, (w - 48) / sheetWidthPx.value) : 1;
}

onMounted(() => {
  fit();
  // 弹窗里首帧容器宽度可能还是 0，下一帧再量一次
  requestAnimationFrame(fit);
  if (typeof ResizeObserver !== 'undefined' && stageRef.value) {
    ro = new ResizeObserver(fit);
    ro.observe(stageRef.value);
  }
});
watch(sheetWidthPx, () => requestAnimationFrame(fit));
onBeforeUnmount(() => ro?.disconnect());

defineExpose({ fit });
</script>

<style scoped>
.sheet-preview {
  background: #eef0f3;
  padding: 24px;
  border-radius: 4px;
  overflow: auto;
}
/* 缩放以左上角为原点；外层用 height 抵掉 transform 不占位造成的空白 */
.sheet-preview__scaler { transform-origin: top left; }
.sheet-preview__sheet { box-shadow: 0 3px 18px rgb(0 0 0 / 14%); }
</style>
