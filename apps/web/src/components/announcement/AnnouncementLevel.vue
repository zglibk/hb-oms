<template>
  <span class="announcement-level" :class="`is-${level}`">【{{ label }}】</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ANNOUNCEMENT_LEVEL_OPTIONS } from '@hb-oms/shared';

const props = defineProps<{ level: string }>();
const label = computed(
  () => ANNOUNCEMENT_LEVEL_OPTIONS.find((item) => item.value === props.level)?.label ?? props.level,
);
</script>

<style scoped lang="scss">
.announcement-level {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--el-text-color-regular);

  &.is-important { color: var(--el-color-warning-dark-2); }
  &.is-urgent { color: var(--el-color-danger); }
}
</style>
