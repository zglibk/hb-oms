<template>
  <el-pagination
    class="app-pagination"
    size="small"
    background
    :layout="layout"
    :total="total"
    :current-page="page"
    :page-size="size"
    :page-sizes="pageSizes"
    @current-change="onCurrent"
    @size-change="onSize"
  />
</template>

<script setup lang="ts">
/**
 * 统一分页器：完整组件（含每页条数选择、跳页），默认 10 条/页。
 * 用法：
 *   <app-pagination
 *     :total="total"
 *     v-model:page="query.page"
 *     v-model:size="query.pageSize"
 *     @change="load"
 *   />
 * 切换每页条数时自动回到第 1 页再触发 change。
 */
withDefaults(
  defineProps<{
    total: number;
    page: number;
    size: number;
    pageSizes?: number[];
    layout?: string;
  }>(),
  {
    pageSizes: () => [10, 20, 50, 100],
    layout: 'total, sizes, prev, pager, next, jumper',
  },
);

const emit = defineEmits<{
  (e: 'update:page', v: number): void;
  (e: 'update:size', v: number): void;
  (e: 'change'): void;
}>();

function onCurrent(p: number) {
  emit('update:page', p);
  emit('change');
}

function onSize(s: number) {
  // 先回到第 1 页，再更新每页条数，最后统一触发刷新
  emit('update:page', 1);
  emit('update:size', s);
  emit('change');
}
</script>
