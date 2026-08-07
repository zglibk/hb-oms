<!--
  汇总卡（统计卡）—— 台账页与首页看板共用。

  版式：左图标(宽 1) + 右上下(高 数字 2 / 标签 1)，数字与图标同色。
  六个色系（slate/blue/green/teal/amber/red）用半透明底 + 主色图标数字，
  深色模式下底色自动叠加变深，保持可读。

  图标走默认插槽名 `icon`，由调用方决定用哪个 el-icon，组件不感知业务。
  传 `linkText` 才渲染右下角文字按钮并派发 `link` 事件；不传则只显示标签。
-->
<template>
  <div class="sum-card" :class="`sum-card--${color}`">
    <div class="sum-card__icon"><slot name="icon" /></div>
    <div class="sum-card__body">
      <div class="sum-card__value">{{ value }}</div>
      <div class="sum-card__label-row">
        <span class="sum-card__label">{{ label }}</span>
        <button v-if="linkText" class="sum-card__link" @click="emit('link')">{{ linkText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export type StatCardColor = 'slate' | 'blue' | 'green' | 'teal' | 'amber' | 'red';

withDefaults(
  defineProps<{
    /** 主数字 */
    value: number | string;
    /** 数字下方标签 */
    label: string;
    /** 色系 */
    color?: StatCardColor;
    /** 右下角文字按钮文案（如「详情>」）；不传则不渲染按钮 */
    linkText?: string;
  }>(),
  { color: 'slate', linkText: '' },
);

const emit = defineEmits<{ (e: 'link'): void }>();
</script>

<script lang="ts">
export default { name: 'AppStatCard' };
</script>

<style scoped lang="scss">
.sum-card {
  --card-color: #64748b;
  --card-bg: rgba(100, 116, 139, 0.1);
  --card-border: rgba(100, 116, 139, 0.25);
  --card-icon-bg: rgba(100, 116, 139, 0.16);

  flex: 1 1 150px;
  min-width: 165px;
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 20px 16px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  /* 左侧图标区：正方形，固定尺寸不随容器拉伸 */
  &__icon {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: var(--card-color);
    background: var(--card-icon-bg);
    border-radius: 8px;
  }

  /* 右侧内容区：占满剩余空间，上下结构 */
  &__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  /* 数字：高度占比 2，大字号突出 */
  &__value {
    flex: 2;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--card-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 标签行：左标签 + 右文字按钮，两端对齐 */
  &__label-row {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    line-height: 1.2;
  }

  &__label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__link {
    flex-shrink: 0;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 12px;
    line-height: 1.2;
    color: var(--card-color);
    cursor: pointer;
    opacity: 0.85;
    transition: opacity 0.15s;

    &:hover {
      opacity: 1;
      text-decoration: underline;
    }
  }

  /* 六色系区分 */
  &--slate {
    --card-color: #64748b;
    --card-bg: rgba(100, 116, 139, 0.1);
    --card-border: rgba(100, 116, 139, 0.25);
    --card-icon-bg: rgba(100, 116, 139, 0.16);
  }
  &--blue {
    --card-color: var(--el-color-primary);
    --card-bg: rgba(64, 158, 255, 0.1);
    --card-border: rgba(64, 158, 255, 0.25);
    --card-icon-bg: rgba(64, 158, 255, 0.16);
  }
  &--green {
    --card-color: var(--el-color-success);
    --card-bg: rgba(103, 194, 58, 0.1);
    --card-border: rgba(103, 194, 58, 0.25);
    --card-icon-bg: rgba(103, 194, 58, 0.16);
  }
  &--teal {
    --card-color: #14b8a6;
    --card-bg: rgba(20, 184, 166, 0.1);
    --card-border: rgba(20, 184, 166, 0.25);
    --card-icon-bg: rgba(20, 184, 166, 0.16);
  }
  &--amber {
    --card-color: var(--el-color-warning);
    --card-bg: rgba(230, 162, 60, 0.1);
    --card-border: rgba(230, 162, 60, 0.25);
    --card-icon-bg: rgba(230, 162, 60, 0.16);
  }
  &--red {
    --card-color: var(--el-color-danger);
    --card-bg: rgba(245, 108, 108, 0.1);
    --card-border: rgba(245, 108, 108, 0.25);
    --card-icon-bg: rgba(245, 108, 108, 0.16);
  }
}
</style>
