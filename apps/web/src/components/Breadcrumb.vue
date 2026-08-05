<template>
  <el-breadcrumb separator="/" class="app-breadcrumb">
    <el-breadcrumb-item
      v-for="(item, i) in items"
      :key="i"
      :to="item.path && i < items.length - 1 ? item.path : undefined"
    >
      {{ item.title }}
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
import type { MenuNode } from '@/api/auth';

const route = useRoute();
const userStore = useUserStore();

interface Crumb {
  title: string;
  path?: string;
}

/** 在菜单树中查找从根到目标路径的链路 */
function findMenuPath(
  nodes: MenuNode[],
  target: string,
  trail: MenuNode[] = [],
): MenuNode[] | null {
  for (const n of nodes) {
    const cur = [...trail, n];
    if (n.path && n.path === target) return cur;
    if (n.children?.length) {
      const found = findMenuPath(n.children, target, cur);
      if (found) return found;
    }
  }
  return null;
}

const items = computed<Crumb[]>(() => {
  const path = route.path;
  const result: Crumb[] = [{ title: '首页', path: '/home' }];
  if (path === '/home') return result;

  const found = findMenuPath(userStore.menus, path);
  if (found) {
    for (const m of found) result.push({ title: m.name, path: m.path || undefined });
  } else {
    // 菜单树未命中（如详情页），回退到路由标题
    const title = (route.meta.title as string) || '';
    if (title) result.push({ title });
  }
  return result;
});
</script>

<style scoped lang="scss">
.app-breadcrumb {
  font-size: var(--hb-font-size-xs);
  line-height: 1;
  /* 仅最后一级（当前页）加粗，前两级常规 */
  :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
    font-weight: 600;
    color: #303133;
  }
  :deep(.el-breadcrumb__inner) {
    color: #909399;
    font-weight: 400;
  }
}
</style>
