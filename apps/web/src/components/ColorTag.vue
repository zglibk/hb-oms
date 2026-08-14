<template>
  <el-tag :size="size" :style="tagStyle" effect="light" disable-transitions>
    <slot>{{ seed }}</slot>
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { seededTagColor } from '@/utils/theme';

/**
 * 内容标签：颜色在主题主色基础上、按文本内容随机分配（同文本颜色稳定）。
 * 用于人员、部门、类别等「需要区分、但没有固定语义色」的内容标签，
 * 避免全部呈现单一主题色，同时保证同一内容在各页面保持相同颜色。
 */
const props = withDefaults(
  defineProps<{
    /** 决定颜色的种子（通常即标签文本）；默认取插槽显示文本 */
    seed: string;
    size?: 'large' | 'default' | 'small';
  }>(),
  { size: 'small' },
);

const theme = useThemeStore();

const tagStyle = computed(() => {
  const c = seededTagColor(props.seed, theme.primaryColor);
  // 通过 el-tag 自身的 CSS 变量注入，确保 effect=light 下背景/边框/文字均生效
  return {
    '--el-tag-bg-color': c.bg,
    '--el-tag-border-color': c.border,
    '--el-tag-text-color': c.text,
  };
});
</script>
