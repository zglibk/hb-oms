<!--
  说明提示（列表标题行的 ⓘ 帮助文案）：气泡**跟随鼠标、显示在光标上方**。

  为什么不用普通 el-tooltip：普通用法把气泡锚在触发元素上，长标题行里只会固定弹在行首上方，
  离鼠标很远（使用方反馈）。这里用 virtual-triggering + 虚拟参考点：参考点实时取鼠标坐标，
  mousemove 时调 updatePopper 让气泡跟着走。气泡样式仍是 EP 默认深色、由 maxWidth 限宽折行。

  用法：默认插槽放行内可见内容（图标 + 文案），#content 插槽放完整提示纯文本。
-->
<template>
  <span
    class="hint-tip"
    @mouseenter="onEnter"
    @mousemove="onMove"
    @mouseleave="visible = false"
  >
    <slot />
    <el-tooltip
      ref="tipRef"
      virtual-triggering
      :virtual-ref="virtualRef"
      :visible="visible"
      placement="top"
      :offset="14"
      :show-arrow="false"
    >
      <template #content>
        <div :style="{ maxWidth: props.maxWidth + 'px', lineHeight: 1.7 }">
          <slot name="content" />
        </div>
      </template>
    </el-tooltip>
  </span>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';

const props = withDefaults(defineProps<{ maxWidth?: number }>(), { maxWidth: 360 });

const visible = ref(false);
const tipRef = ref<{ updatePopper?: () => void } | null>(null);
const point = reactive({ x: 0, y: 0 });

// 虚拟参考点：零尺寸、坐标即鼠标位置；placement=top 故气泡居中显示在光标正上方。
// 返回纯对象（不用 DOMRect）以免个别环境无 DOMRectReadOnly.fromRect
const virtualRef = {
  getBoundingClientRect() {
    const { x, y } = point;
    return { width: 0, height: 0, top: y, bottom: y, left: x, right: x, x, y, toJSON: () => ({}) };
  },
};

function onEnter(e: MouseEvent) {
  point.x = e.clientX;
  point.y = e.clientY;
  visible.value = true;
}
function onMove(e: MouseEvent) {
  point.x = e.clientX;
  point.y = e.clientY;
  // 参考点变了要主动让 popper 重算位置，否则气泡停在进入时的坐标不跟手
  tipRef.value?.updatePopper?.();
}
</script>
