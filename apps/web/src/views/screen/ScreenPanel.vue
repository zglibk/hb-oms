<!--
  大屏面板外框：半透明深蓝底 + 细边框 + 四角折角高亮 + 标题装饰线。
  `kind` 标明面板是「实时」还是「区间」数据——两类数并排时最容易被混着读（见 screen.service 头注释）。
-->
<template>
  <section class="sp">
    <span class="sp__corner sp__corner--tl" aria-hidden="true" />
    <span class="sp__corner sp__corner--tr" aria-hidden="true" />
    <span class="sp__corner sp__corner--bl" aria-hidden="true" />
    <span class="sp__corner sp__corner--br" aria-hidden="true" />
    <header class="sp__head">
      <span class="sp__bar" aria-hidden="true" />
      <h3 class="sp__title">{{ title }}</h3>
      <span class="sp__line" aria-hidden="true" />
      <span v-if="kind" class="sp__kind" :class="`sp__kind--${kind}`">{{ kind === 'live' ? '实时' : '区间' }}</span>
    </header>
    <div class="sp__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ title: string; kind?: 'live' | 'range' }>();
</script>

<style scoped lang="scss">
.sp {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 16px 14px;
  background: rgba(6, 28, 61, 0.72);
  border: 1px solid #1d4f8f;
  box-shadow: inset 0 0 24px rgba(47, 123, 255, 0.18);
}
.sp__corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 0 solid #3fd0ff;
  &--tl { left: -1px; top: -1px; border-width: 3px 0 0 3px; }
  &--tr { right: -1px; top: -1px; border-width: 3px 3px 0 0; }
  &--bl { left: -1px; bottom: -1px; border-width: 0 0 3px 3px; }
  &--br { right: -1px; bottom: -1px; border-width: 0 3px 3px 0; }
}
.sp__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.sp__bar {
  width: 5px;
  height: 18px;
  background: linear-gradient(#5fe3ff, #2f7bff);
  box-shadow: 0 0 8px #3fd0ff;
}
.sp__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 2px;
  color: #e6f6ff;
  text-shadow: 0 0 10px rgba(63, 208, 255, 0.55);
}
.sp__line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, #3fd0ff, rgba(29, 79, 143, 0.3) 40%, transparent);
  position: relative;
  &::after {
    content: '';
    position: absolute;
    right: 0;
    top: -2px;
    width: 24px;
    height: 5px;
    background: repeating-linear-gradient(90deg, #3fd0ff 0 4px, transparent 4px 7px);
    opacity: 0.8;
  }
}
.sp__kind {
  font-size: 13px;
  padding: 1px 8px;
  border: 1px solid;
  border-radius: 2px;
  &--live { color: #34e3a4; border-color: rgba(52, 227, 164, 0.5); }
  &--range { color: #ffc35a; border-color: rgba(255, 195, 90, 0.5); }
}
.sp__body {
  flex: 1;
  min-height: 0;
  position: relative;
}
</style>
