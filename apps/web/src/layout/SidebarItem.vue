<template>
  <!-- 有子菜单：渲染 sub-menu -->
  <!-- data-tour-path：新手引导（el-tour）按菜单路径定位高亮目标 -->
  <el-sub-menu v-if="hasChildren" :index="String(menu.id)" :data-tour-path="menu.path">
    <template #title>
      <!--
        图标必须是 title 槽内的直接 el-icon（Element Plus 约定）。
        使用全局注册的图标名字符串，避免包装组件 + 动态对象在
        sub-menu 展开重绘时丢失 SVG；Setting 另有已知渲染问题，见 alias。
      -->
      <el-icon v-if="iconName" class="sidebar-menu-icon">
        <component :is="iconName" />
      </el-icon>
      <span>{{ menu.name }}</span>
    </template>
    <sidebar-item
      v-for="child in menu.children"
      :key="child.id"
      :menu="child"
    />
  </el-sub-menu>

  <!-- 叶子菜单：渲染 menu-item -->
  <el-menu-item v-else-if="menu.path" :index="menu.path" :data-tour-path="menu.path">
    <el-icon v-if="iconName" class="sidebar-menu-icon">
      <component :is="iconName" />
    </el-icon>
    <template #title>{{ menu.name }}</template>
  </el-menu-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MenuNode } from '@/api/auth';

const props = defineProps<{ menu: MenuNode }>();

/**
 * Element Plus 图标名别名。
 * Setting 在 el-sub-menu 展开/收起重绘时存在偶发不渲染问题（社区亦有反馈），
 * 统一映射为 SetUp，视觉仍为「齿轮/设置」语义。
 */
const ICON_ALIAS: Record<string, string> = {
  Setting: 'SetUp',
};

const hasChildren = computed(
  () => Array.isArray(props.menu.children) && props.menu.children.length > 0,
);

const iconName = computed(() => {
  const name = props.menu.icon?.trim();
  if (!name) return '';
  return ICON_ALIAS[name] ?? name;
});
</script>
