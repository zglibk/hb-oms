<template>
  <div class="tags-bar">
    <el-scrollbar>
      <div class="tags-scroll">
        <div
          v-for="tab in tabs"
          :key="tab.path"
          class="tag-item"
          :class="{ active: isActive(tab) }"
          @click="onClick(tab)"
          @contextmenu.prevent="onContextmenu($event, tab)"
        >
          <span class="tag-text">{{ tab.title }}</span>
          <el-icon
            v-if="!tab.affix"
            class="tag-close"
            @click.stop="onClose(tab)"
          >
            <Close />
          </el-icon>
        </div>
      </div>
    </el-scrollbar>

    <!-- 右侧操作下拉 -->
    <el-dropdown trigger="hover" @command="onCommand" @visible-change="onDropdownVisible">
      <span class="tags-action">
        <span class="tags-action-text">关闭选项</span>
        <el-icon class="tags-action-arrow" :class="{ 'is-active': dropdownVisible }"><ArrowDown /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="refresh">刷新当前</el-dropdown-item>
          <el-dropdown-item command="closeOthers">关闭其它</el-dropdown-item>
          <el-dropdown-item command="closeAll">关闭全部</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 右键菜单 -->
    <ul
      v-if="ctx.visible"
      class="ctx-menu"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
    >
      <li @click="ctxRefresh">刷新</li>
      <li v-if="!ctx.tab?.affix" @click="ctxClose">关闭</li>
      <li @click="ctxCloseOthers">关闭其它</li>
      <li @click="ctxCloseAll">关闭全部</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Close, ArrowDown } from '@element-plus/icons-vue';
import { useTagsStore, type TabItem } from '@/stores/tags';

const route = useRoute();
const router = useRouter();
const tagsStore = useTagsStore();

const tabs = computed(() => tagsStore.visitedTabs);
/** 下拉面板展开状态：控制箭头方向翻转 */
const dropdownVisible = ref(false);
function onDropdownVisible(v: boolean) {
  dropdownVisible.value = v;
}

function isActive(tab: TabItem) {
  return tab.path === route.path;
}

function onClick(tab: TabItem) {
  if (!isActive(tab)) router.push(tab.path);
}

function onClose(tab: TabItem) {
  const wasActive = isActive(tab);
  const next = tagsStore.removeTab(tab.path);
  if (wasActive && next) router.push(next.path);
}

function onCommand(cmd: string) {
  if (cmd === 'refresh') {
    // 通过重定向触发当前页 reload
    router.replace({ path: '/redirect' + route.fullPath });
  } else if (cmd === 'closeOthers') {
    tagsStore.removeOthers(route.path);
  } else if (cmd === 'closeAll') {
    tagsStore.removeAll();
    router.push('/dashboard');
  }
}

/* ---------- 右键菜单 ---------- */
const ctx = reactive({
  visible: false,
  x: 0,
  y: 0,
  tab: null as TabItem | null,
});

function onContextmenu(e: MouseEvent, tab: TabItem) {
  ctx.visible = true;
  ctx.x = e.clientX;
  ctx.y = e.clientY;
  ctx.tab = tab;
}

function closeCtx() {
  ctx.visible = false;
}

function ctxRefresh() {
  closeCtx();
  if (ctx.tab) router.replace({ path: '/redirect' + ctx.tab.path });
}
function ctxClose() {
  if (ctx.tab) onClose(ctx.tab);
  closeCtx();
}
function ctxCloseOthers() {
  if (ctx.tab) {
    tagsStore.removeOthers(ctx.tab.path);
    if (!isActive(ctx.tab)) router.push(ctx.tab.path);
  }
  closeCtx();
}
function ctxCloseAll() {
  tagsStore.removeAll();
  router.push('/dashboard');
  closeCtx();
}

onMounted(() => document.addEventListener('click', closeCtx));
onUnmounted(() => document.removeEventListener('click', closeCtx));
</script>

<style scoped lang="scss">
.tags-bar {
  display: flex;
  align-items: center;
  height: 2rem;
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  padding: 0 0.5rem;
  flex-shrink: 0;

  /* 手机端隐藏 tags 栏：屏幕窄，多 tab 场景不友好，
     通过侧边栏菜单直接跳转即可 */
  @media (max-width: 767.98px) {
    display: none;
  }

  :deep(.el-scrollbar) {
    flex: 1;
    min-width: 0;
  }

  .tags-scroll {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0;
    white-space: nowrap;
  }

  .tag-item {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.5rem;
    padding: 0 0.5rem;
    border: 1px solid #dcdfe6;
    border-radius: 0.25rem;
    font-size: var(--hb-font-size-xs);
    color: #606266;
    background: #fff;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s;

    &:hover {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary-light-5);
    }

    &.active {
      color: #fff;
      background: var(--el-color-primary);
      border-color: var(--el-color-primary);
    }

    .tag-close {
      font-size: var(--hb-font-size-xs);
      border-radius: 50%;
      padding: 1px;
      transition: background 0.2s;
      &:hover {
        background: rgba(0, 0, 0, 0.15);
      }
    }
  }

  .tags-action {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.5rem;
    padding: 0 0.5rem;
    margin-left: 0.375rem;
    border-radius: 0.25rem;
    cursor: pointer;
    color: #606266;
    font-size: var(--hb-font-size-xs);
    flex-shrink: 0;
    outline: none !important;
    &:hover {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }
  }
  .tags-action-arrow {
    transition: transform 0.25s ease;
    &.is-active {
      transform: rotate(180deg);
    }
  }
}

.ctx-menu {
  position: fixed;
  z-index: 3000;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 0.25rem;
  box-shadow: 0 0.125rem 0.75rem rgba(0, 0, 0, 0.08);
  padding: 0.25rem 0;
  margin: 0;
  list-style: none;
  font-size: var(--hb-font-size-xs);
  color: #606266;
  min-width: 7.5rem;

  li {
    padding: 0.375rem 1rem;
    cursor: pointer;
    &:hover {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
    }
  }
}
</style>
