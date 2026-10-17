<template>
  <el-dialog
    :model-value="modelValue"
    title="重点待办事项"
    width="680px"
    class="announcement-pending-dialog"
    append-to-body
    align-center
    @update:model-value="$emit('update:modelValue', $event)"
    @close="$emit('snooze')"
    @closed="$emit('closed')"
  >
    <div class="pending-list">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="pending-row"
        @click="$emit('detail', item.id)"
      >
        <span class="pending-row__icon" :class="`is-${item.level}`">
          <el-icon><BellFilled /></el-icon>
        </span>
        <span class="pending-row__body">
          <span class="pending-row__title">
            <AnnouncementLevel :level="item.level" />{{ item.title }}
          </span>
          <span class="pending-row__summary">{{ item.summary }}</span>
        </span>
        <span class="pending-row__more">详情 <el-icon><ArrowRight /></el-icon></span>
      </button>
    </div>
    <template #footer>
      <span class="pending-hint">要求回复的通告需提交首次回复后才会完成</span>
      <el-button type="primary" @click="$emit('ack')">知道了</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ArrowRight, BellFilled } from '@element-plus/icons-vue';
import type { AnnouncementItem } from '@/api/announcement';
import AnnouncementLevel from './AnnouncementLevel.vue';

defineProps<{ modelValue: boolean; items: AnnouncementItem[] }>();
defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'snooze'): void;
  (event: 'closed'): void;
  (event: 'ack'): void;
  (event: 'detail', id: number): void;
}>();
</script>

<style scoped lang="scss">
.pending-list { max-height: 420px; overflow-y: auto; }
.pending-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 13px 4px;
  border: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  &:hover { background: var(--el-fill-color-light); }
  &:last-child { border-bottom: 0; }
  &__icon {
    display: inline-flex;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--el-color-info);
    background: var(--el-fill-color);
    &.is-important { color: var(--el-color-warning); background: var(--el-color-warning-light-9); }
    &.is-urgent { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
  }
  &__body { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
  &__title { display: flex; min-width: 0; font-weight: 600; }
  &__summary { overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  &__more { display: inline-flex; flex-shrink: 0; align-items: center; color: var(--el-color-primary); font-size: 12px; }
}
.pending-hint { float: left; color: var(--el-text-color-secondary); font-size: 12px; line-height: 24px; }
</style>
