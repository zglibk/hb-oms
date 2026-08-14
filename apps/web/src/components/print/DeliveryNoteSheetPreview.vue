<template>
  <div ref="stageRef" class="sheet-preview">
    <div
      class="sheet-preview__scaler"
      :style="{ transform: `scale(${scale})`, height: `${SHEET_H * scale}px` }"
    >
      <delivery-note-sheet :note="note" :template-code="templateCode" class="sheet-preview__sheet" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import DeliveryNoteSheet from './DeliveryNoteSheet.vue';
import type { DeliveryNote } from '@/api/finished-stock';

/**
 * 送货单纸面的**等比缩放预览容器**。
 *
 * 纸面固定 210mm 宽，塞不进任何一个页面容器，因此凡是"看效果"的地方都要缩放。
 * 抽成组件是因为出现了第二处（「系统管理 → 打印模板」页、客户资料的模板预览弹窗），
 * 两边各写一份 ResizeObserver + transform 的话，缩放口径迟早不一致（§4.4）。
 *
 * 纸面本身仍由 `DeliveryNoteSheet` 渲染——预览与实际打印必须是同一套渲染。
 */
defineProps<{
  note: DeliveryNote;
  templateCode: string;
}>();

/** A4 在 96dpi 下的像素尺寸（210×297mm）：算缩放比与占位高度用 */
const SHEET_W = 210 * (96 / 25.4);
const SHEET_H = 297 * (96 / 25.4);

const stageRef = ref<HTMLElement>();
const scale = ref(1);
let ro: ResizeObserver | undefined;

function fit() {
  const w = stageRef.value?.clientWidth ?? 0;
  // 左右各留 24px 呼吸位；不放大超过 100%（放大只会糊，没有意义）
  scale.value = w ? Math.min(1, (w - 48) / SHEET_W) : 1;
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
