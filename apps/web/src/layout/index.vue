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
          ref="menuRef"
          :default-active="activeMenu"
          :collapse="collapsed"
          :collapse-transition="false"
          :unique-opened="!tourOpen && !tourExpanding"
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
          <!-- 数据可视化大屏：新标签全屏打开（大屏是顶层路由、不挂 Layout）；无权限置灰（§二） -->
          <el-button
            v-permission="'stat:screen'"
            size="small"
            text
            class="doc-btn"
            @click="openScreen"
          >
            <el-icon><DataLine /></el-icon>
            <span class="mobile-hidden">数据可视化</span>
          </el-button>
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
                  <span
                    v-if="roleDisplay !== '—'"
                    class="user-meta__role"
                    :title="roleDisplay"
                  >{{ roleDisplay }}</span>
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
    @finish="onFinishTour"
    @close="onFinishTour"
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

import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { useTagsStore } from '@/stores/tags';
import { useThemeStore } from '@/stores/theme';
import { useFeatureStore } from '@/stores/feature';
import { useResponsive } from '@/composables/useResponsive';
import { useTour } from '@/composables/useTour';
import { usePermissionSync } from '@/composables/usePermissionSync';
import type { MenuNode } from '@/api/auth';
import SidebarItem from './SidebarItem.vue';
import ThemePicker from '@/components/ThemePicker.vue';
import Breadcrumb from '@/components/Breadcrumb.vue';
import TagsBar from '@/components/TagsBar.vue';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const tagsStore = useTagsStore();
const themeStore = useThemeStore();
const featureStore = useFeatureStore();
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
/** el-menu 实例引用：用于路由切换时显式调用 open 展开父级 sub-menu */
const menuRef = ref<any>();
/** 侧栏高亮菜单：优先读路由 meta.activeMenu（非菜单子页指定其所属菜单项），
 *  无则回退到当前路径，使菜单叶子页自身高亮。 */
const activeMenu = computed(() => (route.meta.activeMenu as string) || route.path);

/**
 * 在菜单树中查找指定 path 的祖先 sub-menu id 链（从根到直接父级）。
 *
 * 背景：EP el-menu 的 initMenu 仅在菜单项挂载/卸载时触发（watch(items, initMenu)），
 * 路由切换导致 default-active 变化时只走 updateActiveIndex（仅更新高亮），
 * 不会自动展开父级。因此跨模块进入子页时需显式调用 open 展开父级。
 *
 * 约定（见 SidebarItem.vue）：el-sub-menu 的 index = String(menu.id)，
 * el-menu-item 的 index = menu.path。故祖先链收集的是各级 sub-menu 的 id。
 */
const findAncestorMenuIds = (
  nodes: MenuNode[],
  targetPath: string,
): number[] => {
  const dfs = (list: MenuNode[], path: number[]): number[] | null => {
    for (const node of list) {
      if (node.path === targetPath) return path;
      if (node.children?.length) {
        const found = dfs(node.children, [...path, node.id]);
        if (found) return found;
      }
    }
    return null;
  };
  return dfs(nodes, []) ?? [];
};

/**
 * 路由切换时显式展开父级菜单。
 * - 跨模块进入子页（如 /home → /order/form）：default-active 变化，el-menu 不会
 *   自动展开父级，此处调用 open 补齐。
 * - 同模块内切换（如 /order → /order/form）：default-active 不变（均为 /order），
 *   watch 不触发，父级维持原展开状态。
 * - 收起态/菜单未就绪时跳过：收起态下 el-menu 的 openedMenus 会被清空，展开无意义。
 */
watch(activeMenu, (val) => {
  if (!val || !menuRef.value || collapsed.value) return;
  findAncestorMenuIds(menus.value, val).forEach((id) =>
    menuRef.value?.open(String(id)),
  );
});
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
  // 拉取业务字段开关（如「颜色」是否启用），各业务页据此决定字段显隐。
  // 首屏先用 localStorage 缓存值渲染，这里拿到真实值后再纠正，避免列闪现
  featureStore.load();
  // 新手引导：首次登录自动弹出（看过则不再弹；小屏不打扰）。
  // 延时等待动态菜单渲染完成，避免 el-tour 定位不到目标元素
  if (shouldAutoStart()) {
    setTimeout(() => onStartTour(), 800);
  }
});

/* ===== 新手引导（el-tour）===== */
/*
 * 权限静默同步：管理员改了授权后，在线用户切出去再回来即自动跟上（菜单立即生效、
 * 按钮提示刷新）。**不强制下线**——服务端权限本就是实时的，下线只会打断录单。
 * 详见 composables/usePermissionSync.ts 的说明。
 */
usePermissionSync();

const { tourOpen, startTour, finishTour, shouldAutoStart } = useTour();

/**
 * 候选步骤：**顺着业务主线走一遍**，与操作手册章节一一对应（手册第 N 章 = 这里第 N 步），
 * 用户跟完引导再去看手册不会错位。target 为空 = 居中欢迎页。
 *
 * 步骤会按当前用户实际可见的菜单动态过滤（见下方 tourSteps），
 * 所以这里可以把全流程都写上，仓管员不会看到计划员的步骤。
 */
const TOUR_STEP_DEFS: Array<{
  path?: string;
  title: string;
  description: string;
}> = [
  {
    title: '欢迎使用海宝订单跟踪系统',
    description:
      '系统功能体现：订单做完了多少、仓库还有多少、还欠客户多少。'
      + '业务主线：录订单 → 部件外发（可选）→ 回厂登记 → 装配 → 成品入库 → 成品出库。'
      + '下面按这条主线带你认一遍菜单。',
  },
  {
    path: '/home',
    title: '首页看板',
    description:
      '登录后的落地页：进行中订单数、总成品欠数、总发货欠数、逾期订单四张卡，'
      + '下面三张列表——逾期未发货、7 天内临近交期（只统计进行中的订单），以及近期外发回厂。',
  },
  {
    path: '/order',
    title: '第一步：订单管理',
    description:
      '录客户订单。结构是 订单 → 产品 → 部件组 → 部件行，部件行由系统自动展开。'
      + '跟踪分两层：外发按「部件组」走（零件分开送去表面处理），'
      + '装配/出入库/台账按「产品」走（装出来的是整套滑轨）。',
  },
  {
    path: '/outsource',
    title: '第二步：外发管理（可选）',
    description:
      '需要电镀、喷涂等表面处理时把部件发给加工厂——系统不记发出，'
      + '货回厂了再登记一条：加工商、回厂日期、重量/单重/数量。一次可勾多个部件组批量录。'
      + '表面处理选「无」的产品不需要这一步。',
  },
  {
    path: '/assembly',
    title: '第三步：装配管理',
    description:
      '按订单产品录装配批次，一个产品可分多批（装出来的是整套滑轨，不按部件排产）。'
      + '关键：只有填了「实际完成」日期的批次才算装完，才能拿去入库——这是成品入库的闸门。',
  },
  {
    path: '/finished-stock',
    title: '第四步：成品出入库',
    description:
      '成品入库与销售出库。单据先存草稿，点「确认」才生效并扣减库存。'
      + '已确认的单不能改也不能删，做错了开红字冲销单更正。',
  },
  {
    path: '/ledger',
    title: '订单跟踪台账（核心）',
    description:
      '一行一个订单产品，实时呈现 订单数 / 完成数 / 库存数 / 欠数。'
      + '欠数分两个口径：成品欠数看还差多少没做完，发货欠数看还欠客户多少。'
      + '数量按「部件（零件）/ 成品（整轨）」分两栏，两栏的支数不是一回事。'
      + '展开行能看到部件组明细（图号/料厚/各部件外发回厂进度）与出入库、外发、装配三条流水。',
  },
  {
    path: '/material',
    title: '物料管理',
    description:
      '成品出入库、成品库存、呆滞品管理、部件台账都在这一组。'
      + '系统上线时先用「期初录入」把手工账上的现有库存搬进来，台账才对得上。'
      + '已完结订单剩下的成品另有去处——在「呆滞品管理」逐批建档，'
      + '跟踪它的期初数 / 入库数 / 出库数 / 结存数。',
  },
  {
    path: '/process',
    title: '工艺管理',
    description:
      '「开单信息」按生产图号维护机台、长度、模具等工艺资料，录订单时可自动带入。'
      + '「生产BOM」按生产图号+版本管理成套物料清单，可从开单信息和部件资料带入，并支持批量导入与正式表导出。',
  },
  {
    path: '/basic',
    title: '基础数据',
    description:
      '客户资料（支持 Excel 批量导入，选客户自动带出业务员/跟单员/交货地址）、供应商、'
      + '部门信息、岗位管理与职级管理（人事档案「岗位」下拉的来源，职级按岗位性质分序列）、部件信息。',
  },
  {
    path: '/system',
    title: '系统管理（管理员）',
    description: '开账号、配角色权限、维护数据字典、查操作日志。改完权限当事人要重新登录才生效。',
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
      '忘了怎么操作？点这里打开「操作手册」——章节顺序和刚才这一遍完全对应，'
      + '每章都有字段说明和常见问题。想再看一遍本引导，同样在这里点「新手引导」。祝使用顺利！',
    target: () => document.querySelector('[data-tour="user-info"]') as HTMLElement,
  });
  return steps;
});

/** 引导期间临时关掉手风琴，让所有涉及的父级菜单同时展开（见 onStartTour） */
const tourExpanding = ref(false);

async function onStartTour() {
  userPopoverVisible.value = false;
  // 侧栏收起时菜单文字不可见，引导前强制展开
  if (collapsed.value && !isMobile.value) collapsed.value = false;

  // 引导要高亮的多是二级菜单（订单/外发/装配/出入库），父级 sub-menu 折叠时
  // 这些节点在 DOM 里但尺寸是 0×0，el-tour 会把气泡定位到左上角空白处。
  // 又因为 el-menu 开了 unique-opened（手风琴），逐个 open 会互相顶掉，
  // 故引导期间先关掉手风琴，把用到的父级一次性全部展开。
  tourExpanding.value = true;
  await nextTick();
  const ancestorIds = new Set<number>();
  TOUR_STEP_DEFS.forEach((def) => {
    if (def.path) {
      findAncestorMenuIds(menus.value, def.path).forEach((id) => ancestorIds.add(id));
    }
  });
  ancestorIds.forEach((id) => menuRef.value?.open(String(id)));
  // el-menu 展开是 collapse 过渡（约 300ms），过早开始会拿到动画中途的坐标
  await new Promise((resolve) => setTimeout(resolve, 360));
  startTour();
}

/** 引导结束：恢复手风琴，只保留当前路由所属的父级展开 */
function onFinishTour() {
  finishTour();
  tourExpanding.value = false;
  const keep = new Set(findAncestorMenuIds(menus.value, activeMenu.value).map(String));
  menus.value.forEach(function closeAll(node: MenuNode) {
    if (node.children?.length) {
      if (!keep.has(String(node.id))) menuRef.value?.close(String(node.id));
      node.children.forEach(closeAll);
    }
  });
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

/** 数据大屏开新标签：大屏要占满整块屏幕，嵌在后台布局里没有意义 */
function openScreen() {
  window.open(`${import.meta.env.BASE_URL}screen`, '_blank');
}

function openManual() {
  userPopoverVisible.value = false;
  // manual.html 放在 public/ 下，随构建原样拷进 dist，故用 BASE_URL 拼绝对路径
  // （生产 base 是 /oms/admin/，开发是 /；写死任一个都会在另一端 404）
  window.open(`${import.meta.env.BASE_URL}manual.html`, '_blank');
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
   * 滚动区高度必须显式扣掉 logo 区：el-scrollbar 默认 height:100% 按 .sidebar
   * **全高**计算，底部有 3.5rem 悬在 overflow:hidden 之外——菜单少时看不出来，
   * 2026-08-14 加「统计分析」一级菜单后总高变长，展开「系统管理」时最后的
   * 二级菜单正好落进被裁区域、且滚动条以为自己已经到底（它的高度是够的），
   * 怎么滚都点不到。
   */
  :deep(.el-scrollbar) {
    height: calc(100% - 3.5rem); /* 3.5rem 与上方 .logo 的 height 保持一致 */
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
        font-size: 11px;
        line-height: 1.2;
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
  .collapse-btn .el-icon,
  .doc-btn .el-icon,
  .user-arrow,
  .user-info .el-icon {
    transition: none !important;
  }
  .collapse-btn:hover .el-icon,
  .doc-btn:hover .el-icon,
  .user-info:hover .el-arrow {
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
