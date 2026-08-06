<template>
  <el-container class="app-layout" :class="{ 'app-layout--mobile': isMobile }">
    <!-- 手机端点击遮罩关闭侧边栏 -->
    <button
      v-if="isMobile && !collapsed"
      type="button"
      class="sidebar-mask"
      aria-label="关闭侧边栏"
      @click="collapsed = true"
    />

    <el-aside
      :width="asideWidth"
      class="sidebar"
      :class="{ 'sidebar--mobile-open': isMobile && !collapsed }"
    >
      <div class="logo" :class="{ 'logo--collapsed': collapsed }">
        <img
          v-if="themeStore.logoUrl"
          :src="themeStore.logoUrl"
          alt="logo"
          width="60"
          height="24"
          class="logo__img"
          :class="{ 'logo__img--collapsed': collapsed }"
        />
        <span v-if="!collapsed" class="logo__text">
          {{ themeStore.systemName || '海宝五金订单跟踪' }}
        </span>
        <span v-else-if="!themeStore.logoUrl" class="logo__abbr">
          {{ (themeStore.systemName || '海').charAt(0) }}
        </span>
      </div>
      <el-scrollbar>
        <el-menu
          :default-active="activeMenu"
          :collapse="collapsed"
          :collapse-transition="false"
          unique-opened
          router
        >
          <!-- 首页：静态菜单项，不受权限控制 -->
          <el-menu-item index="/home" data-tour-path="/home">
            <el-icon><HomeFilled /></el-icon>
            <template #title>首页</template>
          </el-menu-item>
          <sidebar-item
            v-for="menu in menus"
            :key="menu.id"
            :menu="menu"
          />
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <button
            type="button"
            class="collapse-btn"
            :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
            @click="collapsed = !collapsed"
          >
            <el-icon aria-hidden="true">
              <Fold v-if="!collapsed" />
              <Expand v-else />
            </el-icon>
          </button>
          <Breadcrumb />
        </div>
        <div class="header-right">
          <theme-picker class="theme-picker" />
          <el-popover
            v-model:visible="userPopoverVisible"
            placement="bottom-end"
            :width="240"
            popper-class="user-popover"
            trigger="hover"
            :show-arrow="false"
            offset="8"
          >
            <template #reference>
              <span class="user-info" data-tour="user-info">
                <span class="user-avatar">
                  <img
                    v-if="userStore.userInfo?.avatar"
                    :src="userStore.userInfo.avatar"
                    alt="头像"
                    width="32"
                    height="32"
                  />
                  <template v-else>{{ avatarText }}</template>
                </span>
                <span class="user-meta mobile-hidden">
                  <span class="user-meta__name">{{
                    userStore.userInfo?.realName || userStore.userInfo?.username
                  }}</span>
                </span>
                <el-icon class="user-arrow mobile-hidden" aria-hidden="true"><ArrowDown /></el-icon>
              </span>
            </template>
            <div class="user-panel">
              <!-- 身份区：头像 + 姓名/账号 + 角色 + 部门/状态 -->
              <div class="user-panel__head">
                <span class="user-panel__glow" aria-hidden="true" />
                <button type="button" class="user-panel__avatar" @click="goProfile" aria-label="进入个人中心">
                  <img
                    v-if="userStore.userInfo?.avatar"
                    :src="userStore.userInfo.avatar"
                    alt="头像"
                  />
                  <template v-else>{{ avatarText }}</template>
                  <span class="user-panel__online" title="在线" aria-hidden="true" />
                </button>
                <div class="user-panel__meta">
                  <div class="user-panel__name">
                    {{ userStore.userInfo?.realName || userStore.userInfo?.username }}
                  </div>
                  <div class="user-panel__sub">@{{ userStore.userInfo?.username }}</div>
                  <div v-if="roleDisplay !== '—'" class="user-panel__roles" :title="roleDisplay">
                    <span
                      v-for="(role, idx) in roleList"
                      :key="idx"
                      class="user-panel__role"
                    >{{ role }}</span>
                  </div>
                </div>
                <div class="user-panel__facts">
                  <span class="user-panel__fact">
                    <el-icon aria-hidden="true"><OfficeBuilding /></el-icon>
                    {{ userStore.userInfo?.deptName || '未分配部门' }}
                  </span>
                  <span
                    class="user-panel__fact"
                    :class="userStore.userInfo?.status === 1 ? 'is-ok' : 'is-off'"
                  >
                    <i class="dot" aria-hidden="true" />
                    {{ userStore.userInfo?.status === 1 ? '账号正常' : '已停用' }}
                  </span>
                </div>
              </div>

              <!-- 快捷入口 -->
              <nav class="user-panel__nav" aria-label="用户菜单">
                <button type="button" class="user-panel__item" @click="openManual">
                  <span class="user-panel__icon">
                    <el-icon aria-hidden="true"><Reading /></el-icon>
                  </span>
                  <span class="user-panel__label">操作手册</span>
                  <el-icon class="user-panel__arrow" aria-hidden="true"><ArrowRight /></el-icon>
                </button>
                <button type="button" class="user-panel__item" @click="onStartTour">
                  <span class="user-panel__icon">
                    <el-icon aria-hidden="true"><Guide /></el-icon>
                  </span>
                  <span class="user-panel__label">新手引导</span>
                  <el-icon class="user-panel__arrow" aria-hidden="true"><ArrowRight /></el-icon>
                </button>
                <button type="button" class="user-panel__item" @click="goProfile">
                  <span class="user-panel__icon">
                    <el-icon aria-hidden="true"><User /></el-icon>
                  </span>
                  <span class="user-panel__label">个人中心</span>
                  <el-icon class="user-panel__arrow" aria-hidden="true"><ArrowRight /></el-icon>
                </button>
              </nav>

              <!-- 退出：底部独立危险操作 -->
              <div class="user-panel__footer">
                <button
                  type="button"
                  class="user-panel__item user-panel__item--danger"
                  @click="onLogout"
                >
                  <span class="user-panel__icon">
                    <el-icon aria-hidden="true"><SwitchButton /></el-icon>
                  </span>
                  <span class="user-panel__label">退出登录</span>
                </button>
              </div>
            </div>
          </el-popover>
          <!-- 退出登录按钮：独立操作项，危险色 hover -->
          <el-button size="small" class="logout-btn" text @click="onLogout">
            <el-icon><SwitchButton /></el-icon>
            <span class="mobile-hidden">退出</span>
          </el-button>
        </div>
      </el-header>

      <TagsBar />

      <el-main class="main">
        <router-view v-slot="{ Component }">
          <!-- 仅缓存列表类页面（保留筛选条件与分页）；表单/详情页不缓存，
               每次进入都是全新状态。白名单为组件 name，见 CACHED_PAGES。 -->
          <keep-alive :include="CACHED_PAGES" :max="12">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>
  </el-container>

  <!-- 新手引导：按业务五步高亮侧栏入口，最后指向操作手册。
       步骤按当前用户实际可见的菜单动态过滤（无权限的菜单不出现在引导里） -->
  <el-tour
    v-model="tourOpen"
    :scroll-into-view-options="{ block: 'center' }"
    @finish="finishTour"
    @close="finishTour"
  >
    <el-tour-step
      v-for="step in tourSteps"
      :key="step.title"
      :target="step.target"
      :title="step.title"
      :description="step.description"
    />
  </el-tour>
</template>

<script setup lang="ts">
/**
 * keep-alive 缓存白名单（组件 name）。
 *
 * 背景：本项目多数页面文件都叫 index.vue，若不显式 defineOptions({ name })，
 * 组件推断名会重复，keep-alive 缓存互相顶替，onActivated 打到错误实例上，
 * 表现为"部分页面数据不刷新、手动 F5 才好"。因此各页面已显式命名，
 * 这里按名单缓存列表页（保留用户的筛选条件与分页），
 * 表单页/详情页刻意不入名单：每次进入重新初始化，避免陈旧数据与复用串台
 * （如 PlanForm 同时被"新建排产"与"编辑排产"两条路由复用）。
 */
const CACHED_PAGES = [
  'OrderList',
  'PlanList',
  'PlanIssuedList',
  'PlanReviewList',
  'PlanDashboard',
  'SubcontractList',
  'FinishedStockPage',
  'SystemUserList',
  'SystemRoleList',
  'SystemMenuList',
  'SystemDictList',
  'SystemLogList',
  'SystemMaterialList',
  'SystemConfigPage',
  'SystemChangelog',
  'HomeDashboard',
];

import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { useTagsStore } from '@/stores/tags';
import { useThemeStore } from '@/stores/theme';
import { useResponsive } from '@/composables/useResponsive';
import { useTour } from '@/composables/useTour';
import SidebarItem from './SidebarItem.vue';
import ThemePicker from '@/components/ThemePicker.vue';
import Breadcrumb from '@/components/Breadcrumb.vue';
import TagsBar from '@/components/TagsBar.vue';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const tagsStore = useTagsStore();
const themeStore = useThemeStore();
const { isMobile } = useResponsive();

/** 手机端默认收起侧边栏；桌面端默认展开 */
const collapsed = ref(false);
/**
 * 侧栏宽度与根字号共同变化：小屏 PC 更紧凑，FHD 保持原 240px，
 * 宽屏适度放大；手机端仍使用固定 240px 抽屉宽度。
 */
const asideWidth = computed(() => {
  if (isMobile.value) return collapsed.value ? '0' : '15rem';
  return collapsed.value ? '4rem' : 'clamp(12.5rem, 15vw, 15rem)';
});
const userPopoverVisible = ref(false);
const menus = computed(() => userStore.menus);
const activeMenu = computed(() => route.path);
const avatarText = computed(
  () => (userStore.userInfo?.realName || '?').charAt(0),
);
/** 角色列表：优先用角色名，无则用角色编码 */
const roleList = computed(() => {
  const names = userStore.roleNames?.length
    ? userStore.roleNames
    : userStore.roles;
  return names.length ? names : [];
});
/** 角色展示文案（title / 兼容旧逻辑） */
const roleDisplay = computed(() =>
  roleList.value.length ? roleList.value.join('、') : '—',
);

/** 路由变化时新增标签（排除登录页、重定向页） */
watch(
  () => route.path,
  (path: string) => {
    if (!path || path === '/login' || path.startsWith('/redirect')) return;
    const title = (route.meta.title as string) || '';
    if (!title) return;
    tagsStore.addTab({ path, title, name: route.name as string });
    // 手机端点击菜单/tag 后自动收起侧边栏
    if (isMobile.value) collapsed.value = true;
  },
  { immediate: true },
);

/** 进入/离开手机端时同步侧边栏状态 */
watch(isMobile, (mobile: boolean) => {
  collapsed.value = mobile; // 手机端默认收起，桌面端默认展开
});

onMounted(() => {
  // 首屏根据当前视口决定侧边栏初始状态
  collapsed.value = isMobile.value;
  // 拉取系统配置（logo + favicon + 默认登录背景），侧边栏顶部 logo 与浏览器标签 favicon 立即生效
  themeStore.loadSystemConfig();
  // 新手引导：首次登录自动弹出（看过则不再弹；小屏不打扰）。
  // 延时等待动态菜单渲染完成，避免 el-tour 定位不到目标元素
  if (shouldAutoStart()) {
    setTimeout(() => onStartTour(), 800);
  }
});

/* ===== 新手引导（el-tour）===== */
const { tourOpen, startTour, finishTour, shouldAutoStart } = useTour();

/** 候选步骤：按业务五步（手册章节）排序；target 为空 = 居中欢迎页 */
const TOUR_STEP_DEFS: Array<{
  path?: string;
  title: string;
  description: string;
}> = [
  {
    title: '欢迎使用海宝订单跟踪系统',
    description:
      '业务主线：录订单 → 部件外发（可选）→ 回货 → 成品入库 → 成品出库；台账随时告诉你每张订单的订单数/完成数/库存数/欠数。',
  },
  {
    path: '/home',
    title: '首页',
    description: '登录后先看这里：后续将展示进行中订单、欠数与逾期提醒等销售视角汇总。',
  },
  {
    path: '/basic',
    title: '基础数据',
    description: '客户资料（支持 Excel 批量导入）、工艺信息（按生产图号维护，录订单自动带入）、物料档案都在这里。',
  },
  {
    path: '/system',
    title: '系统管理（管理员）',
    description: '开账号、配角色权限、数据字典与操作日志。',
  },
];

/** 实际步骤：过滤掉当前用户看不到的菜单（DOM 里不存在对应节点） */
const tourSteps = computed(() => {
  // tourOpen 变化时重算，保证在菜单渲染后再解析 target
  if (!tourOpen.value) return [];
  const steps = TOUR_STEP_DEFS.filter(
    (def) =>
      !def.path || document.querySelector(`[data-tour-path="${def.path}"]`),
  ).map((def) => ({
    title: def.title,
    description: def.description,
    target: def.path
      ? () =>
          document.querySelector(
            `[data-tour-path="${def.path}"]`,
          ) as HTMLElement
      : undefined,
  }));
  // 收尾：指向头像，告诉用户手册和重看入口在哪
  steps.push({
    title: '随时求助',
    description:
      '忘了怎么操作？点这里打开「操作手册」按步骤查；想再看一遍本引导，同样在这里点「新手引导」。祝使用顺利！',
    target: () => document.querySelector('[data-tour="user-info"]') as HTMLElement,
  });
  return steps;
});

function onStartTour() {
  userPopoverVisible.value = false;
  // 侧栏收起时菜单文字不可见，引导前强制展开
  if (collapsed.value && !isMobile.value) collapsed.value = false;
  startTour();
}

function goProfile() {
  userPopoverVisible.value = false;
  router.push('/profile');
}

async function onLogout() {
  userPopoverVisible.value = false;
  await ElMessageBox.confirm('确定退出登录吗？', '提示', {
    type: 'warning',
  });
  await userStore.logout();
  ElMessage.success('已退出登录');
  router.push('/login');
}

function openManual() {
  userPopoverVisible.value = false;
  // 操作手册随 M2+ 功能完善后提供；先跳前台设计文档页
  window.open('/oms/design-doc.html', '_blank');
}
</script>

<style scoped lang="scss">
.app-layout {
  height: 100%;
}
.sidebar {
  background: var(--sidebar-bg);
  /* 侧边栏菜单：等宽字体*/
  --sidebar-menu-font: 'Microsoft YaHei', '微软雅黑', sans-serif;
  --sidebar-menu-l1-size: var(--hb-font-size-small);
  --sidebar-menu-l2-size: var(--hb-font-size-small);
  transition:
    width 0.2s,
    background 0.3s;
  overflow: hidden;

  .logo {
    height: 3.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0 1rem;
    color: var(--el-color-white);
    font-size: var(--hb-font-size-medium);
    font-weight: bold;
    background: var(--sidebar-logo-bg);
    /* 标题行与菜单区的分隔线（业务指定色值） */
    border-bottom: 1px solid #334155;
    transition: background 0.3s;
    overflow: hidden;

    /* 折叠状态：水平居中、清除左右 padding */
    &--collapsed {
      padding: 0;
    }

    &__img {
      height: 1.5rem;
      width: auto;
      max-width: 3.75rem;
      object-fit: contain;
      flex-shrink: 0;

      &--collapsed {
        /* 折叠时让 LOGO 在 64px 宽侧边栏内居中显示（等比缩放 20%） */
        max-width: 3rem;
        max-height: 3rem;
      }
    }
    &__text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    &__abbr {
      font-size: var(--hb-font-size-large);
    }
  }

  /* 菜单整体跟随侧边栏底色，并把 Element Plus 菜单变量指向主题深色调 */
  :deep(.el-menu) {
    border-right: none;
    background: var(--sidebar-bg);
    font-family: var(--sidebar-menu-font);
    --el-menu-bg-color: var(--sidebar-bg);
    /* 深色侧栏上未选中项用柔和灰白，选中/悬停恢复纯白 */
    --el-menu-text-color: rgba(255, 255, 255, 0.78);
    --el-menu-hover-bg-color: var(--sidebar-hover-bg);
    --el-menu-active-color: var(--el-color-white);
  }
  /*
   * 中部子菜单展开时会连续改变后续菜单项的位置。关闭浏览器滚动锚定，
   * 避免重排时自动修正 scrollTop 造成视觉跳动。
   * 注意：不要加 contain: paint——末级一级菜单（如系统管理）展开时，
   * 绘制遏制会导致标题内 SVG 图标丢失或闪烁。
   */
  :deep(.el-scrollbar__wrap) {
    overflow-anchor: none;
  }
  :deep(.el-scrollbar__view) {
    contain: layout;
  }
  /* 一级菜单图标：展开重绘时保持可见，避免被过渡/布局挤成透明 */
  :deep(.sidebar-menu-icon) {
    display: inline-flex !important;
    visibility: visible !important;
    opacity: 1 !important;
    flex-shrink: 0;
    color: inherit;
    transition: none;
  }

  /* 一级：顶层菜单项（首页等）与子菜单标题 */
  :deep(.el-menu > .el-menu-item),
  :deep(.el-menu > .el-sub-menu > .el-sub-menu__title) {
    font-family: var(--sidebar-menu-font);
    font-size: var(--sidebar-menu-l1-size);
    font-weight: 600;
    letter-spacing: 0.03em;
  }
  /* 二级：子菜单内的叶子项（字号略小，字重与一级一致） */
  :deep(.el-sub-menu .el-menu .el-menu-item) {
    font-family: var(--sidebar-menu-font);
    font-size: var(--sidebar-menu-l2-size);
    font-weight: 600;
    letter-spacing: 0.02em;
    opacity: 0.92;
  }
  /* 一级 / 二级项底色 */
  :deep(.el-menu-item),
  :deep(.el-sub-menu__title) {
    background: var(--sidebar-bg);
    transition: background 0.3s;
  }
  /* 展开的子菜单容器略深一档 */
  :deep(.el-sub-menu .el-menu),
  :deep(.el-sub-menu .el-menu-item) {
    background: var(--sidebar-submenu-bg);
  }
  /* 悬停 */
  :deep(.el-menu-item:not(.is-active):hover),
  :deep(.el-sub-menu__title:hover) {
    background: var(--sidebar-hover-bg) !important;
    color: var(--el-color-white) !important;
  }
  /* 选中项：深蓝底 + 最左亮蓝竖条 + 白字（竖条用 inset 阴影绘制，不产生布局偏移） */
  :deep(.el-menu-item.is-active) {
    color: var(--el-color-white) !important;
    background: var(--sidebar-active-bg) !important;
    box-shadow: inset 4.5px 0 0 var(--sidebar-active-accent);

    .el-icon {
      color: var(--el-color-white) !important;
    }
  }
  /* 展开且含当前路由的父级标题：白色加粗，在主色背景上清晰可读 */
  :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
    color: var(--el-color-white) !important;
    font-weight: 600;
  }
}
.header {
  height: 3.5rem !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  /* 导航栏文字再小一档，避免顶栏视觉偏重 */
  font-size: var(--hb-font-size-xs);
  --el-button-font-size: var(--hb-font-size-xs);

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 100%;
  }
  .header-right {
    display: flex;
    align-items: center;
    height: 100%;
    gap: 0.25rem;
  }
  .theme-picker {
    margin-right: 0.25rem;
  }

  /* 退出登录按钮：危险色文字按钮，hover 时显浅红底 */
  .logout-btn {
    touch-action: manipulation;
    height: var(--hb-header-control-size);
    padding: 0 0.75rem;
    margin-left: 0.5rem;
    border-radius: 0.5rem;
    font-size: var(--hb-font-size-xs);
    font-weight: 400;
    color: var(--el-color-danger);
    /* 固定图标与文字间距，避免 hover 时挤压 */
    gap: 0.25rem;
    transition:
      background 0.25s cubic-bezier(0.22, 0.61, 0.36, 1),
      color 0.25s cubic-bezier(0.22, 0.61, 0.36, 1),
      transform 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);

    .el-icon {
      font-size: 0.8125rem;
      /* 用 transform 做位移，不影响布局 */
      transition: transform 0.25s cubic-bezier(0.22, 0.61, 0.36, 1);
    }
    &:hover {
      color: var(--el-color-danger);
      background: var(--el-color-danger-light-9);
      .el-icon {
        transform: translateX(0);
      }
    }
    &:active {
      transform: scale(0.96);
    }
  }

  /* ============================================================
   * 导航栏按钮统一悬浮动效果、背景晕染
   * ============================================================ */
  .collapse-btn,
  .doc-btn,
  .user-info {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--hb-header-control-size);
    padding: 0 0.75rem;
    border-radius: 0.5rem;
    cursor: pointer;
    color: inherit;
    transition:
      color 0.25s cubic-bezier(0.22, 0.61, 0.36, 1),
      background 0.25s cubic-bezier(0.22, 0.61, 0.36, 1),
      transform 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);
    /* 底部主色刻线：默认收缩居中，hover 时向两侧展开 */
    &::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 0.25rem;
      width: 0;
      height: 0.125rem;
      border-radius: 0.125rem;
      background: var(--el-color-primary);
      transform: translateX(-50%);
      transition: width 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
    }
    &:hover {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      &::after {
        width: 60%;
      }
      .el-icon {
        transform: translateY(-1px) scale(1.08);
      }
    }
    &:active {
      transform: scale(0.96);
    }
    .el-icon {
      transition: transform 0.25s cubic-bezier(0.22, 0.61, 0.36, 1);
    }
  }

  /* 折叠按钮：纯图标，方形触控区 */
  .collapse-btn {
    touch-action: manipulation;
    font-size: 1rem;
    width: var(--hb-header-control-size);
    padding: 0;
    border: none;
    background: transparent;
  }

  /* 开发文档按钮：图标 + 文字，hover 时图标轻微翻页 */
  .doc-btn {
    touch-action: manipulation;
    margin-right: 0.25rem;
    border: none;
    background: transparent;
    /* el-button 自带 font-size 变量会覆盖继承，显式指定 */
    font-size: var(--hb-font-size-xs);
    font-weight: 400;
    .el-icon {
      margin-right: 0.25rem;
      font-size: 0.8125rem;
    }
    &:hover {
      .el-icon {
        transform: rotate(-8deg) scale(1.1);
      }
      /* 覆盖 el-button text 的默认 hover 背景 */
      background: var(--el-color-primary-light-9) !important;
    }
  }

  /* 用户信息：左(头像) + 中(姓名/角色上下) + 右(下拉箭头) */
  .user-info {
    touch-action: manipulation;
    gap: 0.5rem;
    color: var(--el-text-color-primary);
    padding: 0 0.75rem;
    /* el-dropdown 触发器自带 font-size 会覆盖继承，显式指定 */
    font-size: var(--hb-font-size-xs);
    font-weight: 400;
    /* 始终移除 el-dropdown 触发器的轮廓/边框 */
    outline: none !important;
    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 2px;
    }
    /* 取消共用底部刻线，避免头像区 hover 出现下划线 */
    &::after {
      display: none;
    }

    .user-meta {
      display: flex;
      flex-direction: column;
      justify-content: center;
      line-height: 1.3;
      min-width: 0;

      &__name {
        font-size: var(--hb-font-size-xs);
        font-weight: 500;
        color: var(--el-text-color-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 7.5rem;
      }
      &__role {
        font-size: var(--hb-font-size-xs);
        color: var(--el-text-color-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 7.5rem;
      }
    }

    .user-arrow {
      transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
      color: var(--el-text-color-secondary);
      flex-shrink: 0;
    }
    &:hover .user-arrow {
      transform: rotate(180deg);
      color: var(--el-color-primary);
    }

    /* 导航栏用户头像：有图显图，无图降级首字 */
    .user-avatar {
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--el-color-primary);
      color: var(--el-color-white);
      font-size: var(--hb-font-size-xs);
      font-weight: 600;
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }
  }
  /* el-dropdown 触发器外层容器：去除 focus/hover 时的默认轮廓 */
  :deep(.el-dropdown) {
    outline: none !important;
    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 2px;
    }
  }
  :deep(.el-tooltip__trigger) {
    outline: none !important;
    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 2px;
    }
  }
}
.main {
  background: var(--el-bg-color-page);
  min-width: 0;
  padding: var(--hb-page-padding);
  /* 作为 flex 容器把可用高度传给页面组件：
     需要"整页不滚动、内部区域自适应"的页面（如计划看板）可用 height:100%
     占满可用空间；普通页面内容超出时仍由 el-main 自身滚动（overflow:auto）。 */
  display: flex;
  flex-direction: column;

  > * {
    min-height: 0;
  }
}

/* ============================================================
 * 手机端适配（≤767px）
 * ============================================================ */
@media (max-width: 767.98px) {
  /* 侧边栏改为浮层覆盖：折叠态用 transform 滑出视口，彻底隐藏 */
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    z-index: 1001;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    box-shadow: 2px 0 12px rgba(0, 0, 0, 0.2);
    /* 折叠态：滑出视口左侧，避免 width:0 仍残留阴影/溢出内容 */
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    /* 展开态：滑入视口，并覆盖 :width 属性对手机的 0px 设置 */
    &--mobile-open {
      width: 240px !important;
      max-width: 82vw;
      transform: translateX(0);
    }
  }

  /* 遮罩层：点击关闭侧边栏 */
  .sidebar-mask {
    touch-action: manipulation;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1000;
    animation: mask-fade 0.2s ease;
  }
  @keyframes mask-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* 顶部导航：紧凑排布，防止按钮溢出右侧 */
  .header {
    padding: 0 8px !important;

    .header-left {
      gap: 6px;
      min-width: 0;
      flex: 1;
      /* 手机端隐藏面包屑，为右侧按钮腾出空间 */
      .app-breadcrumb {
        display: none !important;
      }
    }
    .header-right {
      gap: 2px;
      /* 防止右侧按钮组被压缩，避免文字换行 */
      flex-shrink: 0;
    }

    /* 按钮 padding 压缩，仅显图标 */
    .doc-btn,
    .logout-btn,
    .user-info {
      padding: 0 8px !important;
      /* 强制不换行，防止文字竖排 */
      white-space: nowrap;
    }
    .collapse-btn { width: 32px; font-size: 22px; }

    .user-info { gap: 0; }
  }

  /* 主内容区：内边距压缩 */
  .main {
    padding: 8px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar {
    transition: none !important;
  }
  .sidebar-mask {
    animation: none !important;
  }
  .collapse-btn,
  .doc-btn,
  .user-info,
  .logout-btn,
  .collapse-btn .el-icon,
  .doc-btn .el-icon,
  .user-arrow,
  .user-info .el-icon {
    transition: none !important;
  }
  .collapse-btn:hover .el-icon,
  .doc-btn:hover .el-icon,
  .user-info:hover .el-arrow,
  .logout-btn:active {
    transform: none !important;
  }
}
</style>

<!-- 折叠态下弹出的子菜单被 teleport 到 body，需用非 scoped 全局样式保持主题染色 -->
<style lang="scss">
/* ============================================================
 * 用户面板：身份区（头像/角色/部门）→ 快捷入口 → 退出
 * ============================================================ */
.user-popover.el-popover.el-popper {
  padding: 0 !important;
  border: 1px solid var(--el-border-color-lighter) !important;
  border-radius: 0.75rem !important;
  box-shadow:
    0 0.625rem 1.75rem rgba(15, 23, 42, 0.12),
    0 0.125rem 0.375rem rgba(15, 23, 42, 0.05) !important;
  overflow: hidden;
  width: 16.5rem !important;
  transform-origin: top right !important;
  animation: userPanelIn 0.2s cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes userPanelIn {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.user-panel {
  /* ===== 身份区：两行网格 —— 头像+信息 / 部门+状态 ===== */
  &__head {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'avatar meta'
      'facts facts';
    column-gap: 0.75rem;
    row-gap: 0.75rem;
    padding: 1rem 1rem 0.875rem;
    background:
      radial-gradient(90% 80% at 100% 0%, var(--el-color-primary-light-8) 0%, transparent 55%),
      linear-gradient(160deg, var(--el-color-primary-light-9) 0%, var(--el-bg-color) 72%);
    overflow: hidden;
  }

  &__glow {
    position: absolute;
    top: -2rem;
    right: -1.25rem;
    width: 5.5rem;
    height: 5.5rem;
    border-radius: 50%;
    background: var(--el-color-primary);
    opacity: 0.12;
    filter: blur(1.5rem);
    pointer-events: none;
  }

  &__avatar {
    grid-area: avatar;
    position: relative;
    align-self: center;
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--hb-font-size-medium);
    font-weight: 600;
    color: var(--el-color-white);
    background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
    border: 2px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 0.2rem 0.5rem rgba(0, 0, 0, 0.1);
    overflow: visible;
    cursor: pointer;
    padding: 0;
    transition: transform 0.2s ease;

    &:hover {
      transform: scale(1.05);
    }

    img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
  }

  &__online {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--el-color-success);
    border: 2px solid var(--el-bg-color);
  }

  &__meta {
    grid-area: meta;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.125rem;
  }

  &__name {
    font-size: var(--hb-font-size-base);
    font-weight: 600;
    color: var(--el-text-color-primary);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__sub {
    font-size: var(--hb-font-size-xs);
    color: var(--el-text-color-secondary);
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__roles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  &__role {
    display: inline-block;
    max-width: 100%;
    padding: 0 0.375rem;
    font-size: 10px;
    line-height: 1.5;
    color: var(--el-color-primary);
    background: rgba(255, 255, 255, 0.75);
    border: 1px solid var(--el-color-primary-light-7);
    border-radius: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 部门 / 状态：同一行，等分对齐 */
  &__facts {
    grid-area: facts;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: center;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
  }

  &__fact {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    font-size: var(--hb-font-size-xs);
    color: var(--el-text-color-regular);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    .el-icon {
      font-size: 0.8125rem;
      color: var(--el-text-color-secondary);
      flex-shrink: 0;
    }

    .dot {
      width: 0.375rem;
      height: 0.375rem;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--el-text-color-placeholder);
    }

    &.is-ok {
      color: var(--el-color-success);
      .dot {
        background: var(--el-color-success);
      }
    }

    &.is-off {
      color: var(--el-color-danger);
      .dot {
        background: var(--el-color-danger);
      }
    }
  }

  /* ===== 快捷入口 ===== */
  &__nav {
    display: flex;
    flex-direction: column;
    padding: 0.375rem 0;
  }

  &__footer {
    padding: 0.25rem 0 0.375rem;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  &__item {
    touch-action: manipulation;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.5625rem 1rem;
    font-size: var(--hb-font-size-small);
    color: var(--el-text-color-primary);
    cursor: pointer;
    border: none;
    background: transparent;
    font: inherit;
    text-align: left;
    transition: background 0.15s, color 0.15s;

    .user-panel__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 0.375rem;
      background: var(--el-fill-color-light);
      color: var(--el-text-color-regular);
      flex-shrink: 0;
      transition: background 0.2s, color 0.2s;

      .el-icon {
        font-size: 0.875rem;
      }
    }

    .user-panel__label {
      flex: 1;
      min-width: 0;
    }

    .user-panel__arrow {
      font-size: 0.75rem;
      color: var(--el-text-color-placeholder);
      opacity: 0;
      transform: translateX(-3px);
      transition: opacity 0.15s, transform 0.15s, color 0.15s;
    }

    &:hover {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);

      .user-panel__icon {
        background: var(--el-color-primary);
        color: var(--el-color-white);
      }

      .user-panel__arrow {
        opacity: 1;
        transform: translateX(0);
        color: var(--el-color-primary);
      }
    }

    &--danger {
      &:hover {
        background: var(--el-color-danger-light-9);
        color: var(--el-color-danger);

        .user-panel__icon {
          background: var(--el-color-danger);
          color: var(--el-color-white);
        }
      }
    }
  }
}
.el-menu--vertical.el-menu--popup {
  --sidebar-menu-font: 'Microsoft YaHei', '微软雅黑', sans-serif;
  --sidebar-menu-l1-size: 12px;
  --sidebar-menu-l2-size: 11px;
  --el-menu-bg-color: var(--sidebar-submenu-bg);
  --el-menu-text-color: var(--el-text-color-secondary);
  --el-menu-hover-bg-color: var(--sidebar-hover-bg);
  --el-menu-active-color: var(--el-color-white);
  background: var(--sidebar-submenu-bg);
  font-family: var(--sidebar-menu-font);

  .el-menu-item {
    font-family: var(--sidebar-menu-font);
    font-size: var(--sidebar-menu-l2-size);
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .el-sub-menu__title {
    font-family: var(--sidebar-menu-font);
    font-size: var(--sidebar-menu-l1-size);
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  .el-menu-item:not(.is-active):hover,
  .el-sub-menu__title:hover {
    background: var(--sidebar-hover-bg) !important;
    color: var(--el-color-white) !important;
  }
  .el-menu-item.is-active {
    color: var(--el-color-white) !important;
    background: var(--sidebar-active-bg) !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .user-popover.el-popover.el-popper {
    animation: none !important;
  }
  .user-panel__avatar,
  .user-panel__item,
  .user-panel__item .user-panel__icon,
  .user-panel__item .user-panel__arrow,
  .user-popover .user-panel__item .user-panel__icon {
    transition: none !important;
    transform: none !important;
  }
  .user-panel__avatar:hover,
  .user-popover .user-panel__item:hover .user-panel__icon {
    transform: none !important;
  }
}
</style>
