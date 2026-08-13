<template>
  <div ref="pageRef" class="changelog-page" v-loading="loading">
    <!-- 固定标题栏（突破父容器 padding 全宽吸顶）；布局照搬 hb-mes 更新日志页 -->
    <header class="cl-hero">
      <h1 class="cl-hero__title">更新日志</h1>
      <p class="cl-hero__sub">随时掌握系统的最新动态，了解每次版本迭代带来的功能与优化</p>
    </header>

    <!-- 时间线：左信息 | 竖线 | 右内容 -->
    <main v-if="list.length" class="cl-timeline">
      <article
        v-for="(item, idx) in list"
        :key="item.id"
        class="cl-entry"
        :class="{ 'cl-entry--first': idx === 0 }"
      >
        <div class="cl-meta">
          <time class="cl-meta__date">{{ formatDate(item.releasedAt) }}</time>
          <div class="cl-meta__badges">
            <span class="cl-meta__version">{{ item.version }}</span>
            <span v-if="item.category" class="cl-meta__tag" :class="categoryClass(item.category)">{{ item.category }}</span>
          </div>
        </div>
        <div class="cl-track"><span class="cl-track__dot" /></div>
        <div class="cl-body">
          <div class="cl-body__mobile-meta">
            <time>{{ formatDate(item.releasedAt) }}</time>
            <span class="cl-meta__version">{{ item.version }}</span>
            <span v-if="item.category" class="cl-meta__tag" :class="categoryClass(item.category)">{{ item.category }}</span>
          </div>
          <h3 v-if="item.title" class="cl-body__title">{{ item.title }}</h3>
          <ul class="cl-body__list">
            <li v-for="(line, i) in item.content" :key="i">{{ line }}</li>
          </ul>
        </div>
      </article>
    </main>

    <el-empty v-else-if="!loading" description="暂无更新记录" class="cl-empty" />

    <!-- 页脚：只留版权行（站内导航矩阵按使用方要求取消——后台本就有侧栏，重复导航无意义） -->
    <footer class="cl-footer">
      <div class="cl-footer__divider" />
      <p class="cl-footer__copyright">© {{ currentYear }} 海宝五金 · 订单跟踪系统 · All rights reserved</p>
    </footer>

    <!-- 回到顶部 -->
    <transition name="cl-fade">
      <button v-show="showBackTop" class="cl-backtop" @click="scrollToTop" title="回到顶部">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </transition>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ChangelogView' });

import { ref, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import { getChangelogList, type ChangelogItem } from '@/api/changelog';
import { formatDate } from '@/utils/date';

const list = ref<ChangelogItem[]>([]);
const loading = ref(false);
const showBackTop = ref(false);
const pageRef = ref<HTMLElement | null>(null);
const currentYear = new Date().getFullYear();

async function load() {
  loading.value = true;
  try {
    list.value = await getChangelogList();
  } catch {
    ElMessage.error('加载更新日志失败');
  } finally {
    loading.value = false;
  }
}

function categoryClass(category: string): string {
  if (category.includes('里程碑')) return 'cl-tag--milestone';
  if (category.includes('新') || category.includes('功能')) return 'cl-tag--feature';
  if (category.includes('修复') || category.includes('问题')) return 'cl-tag--fix';
  if (category.includes('优化') || category.includes('体验')) return 'cl-tag--improve';
  return 'cl-tag--default';
}

/* ---- 回到顶部（滚动容器是 Layout 的 el-main，不是 window，逐层向上找） ---- */
let scrollContainer: HTMLElement | Window | null = null;

function getScrollContainer(): HTMLElement | Window {
  let el: HTMLElement | null = pageRef.value;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
    el = el.parentElement;
  }
  return window;
}

function onScroll() {
  const container = scrollContainer;
  if (!container) return;
  const top = container instanceof Window ? window.scrollY : container.scrollTop;
  showBackTop.value = top > 300;
}

function scrollToTop() {
  const container = scrollContainer;
  if (!container) return;
  if (container instanceof Window) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    container.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

onMounted(() => {
  load();
  scrollContainer = getScrollContainer();
  (scrollContainer instanceof Window ? window : scrollContainer)
    .addEventListener('scroll', onScroll, { passive: true });
});

onBeforeUnmount(() => {
  if (scrollContainer) {
    (scrollContainer instanceof Window ? window : scrollContainer)
      .removeEventListener('scroll', onScroll);
  }
});
</script>

<style scoped lang="scss">
/* 父容器 .el-main 的 padding（无全局变量时回落 16px） */
$page-pad: var(--hb-page-padding, 16px);

/* ========== 页面容器 ========== */
.changelog-page {
  /* 撑满 el-main 的可用高度：**不能用 min-height:100%**——layout 的
     `.main > * { min-height: 0 }` 与它同特异性、会把它盖掉，页面高度就只剩内容高度，
     页脚跟着停在内容末尾（实测）。el-main 本身是 flex column，故用 flex 伸展，
     grow=1 填满剩余空间、shrink=0 内容超高时不压缩（由 el-main 自身滚动）。 */
  flex: 1 0 auto;
  background: var(--el-bg-color-page);
  /* 负边距抵消父容器 padding，让标题栏与时间线撑满内容区 */
  margin: calc(-1 * #{$page-pad});
  margin-bottom: 0;
  /* 自身也是 flex column，配合页脚的 margin-top:auto 把它顶到底部 */
  display: flex;
  flex-direction: column;
}
/* 时间线与空状态按内容高度排布，剩余空间由页脚的 margin-top:auto 吃掉（见 .cl-footer） */
.cl-timeline { flex: 0 0 auto; }
.cl-empty { flex: 0 0 auto; }

/* ========== 固定标题栏（全宽吸顶） ========== */
.cl-hero {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 16px 32px 16px;
  text-align: center;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  /* 向上延伸遮挡：防止滚动内容从 sticky 上沿漏出 */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    height: 20px;
    background: var(--el-bg-color);
  }

  &__title {
    font-size: 20px;
    font-weight: 700;
    color: var(--el-text-color-primary);
    margin: 0 0 6px;
    letter-spacing: 1px;
  }

  &__sub {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin: 0;
    line-height: 1.6;
  }
}

/* ========== 时间线容器 ========== */
.cl-timeline {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 32px 0;
  position: relative;

  /* 贯穿始终的虚线 */
  &::before {
    content: '';
    position: absolute;
    left: calc(32px + 200px + 20px + 12px); /* padding-left + 左列 + gap + track半宽 */
    top: 0;
    bottom: 0;
    width: 1.5px;
    background: repeating-linear-gradient(
      to bottom,
      var(--el-border-color) 0,
      var(--el-border-color) 6px,
      transparent 6px,
      transparent 11px
    );
  }
}

/* ========== 每条记录：三列 grid ========== */
.cl-entry {
  display: grid;
  grid-template-columns: 200px 24px 1fr;
  gap: 0 20px;
  min-height: 80px;
  padding-bottom: 40px;
  position: relative;

  &:last-child { padding-bottom: 0; }
}

/* ========== 左列 ========== */
.cl-meta {
  text-align: right;
  padding-top: 2px;

  &__date {
    display: block;
    font-size: 16px;
    font-weight: 700;
    color: var(--el-color-primary);
    font-family: 'SF Mono', 'Monaco', 'Consolas', 'JetBrains Mono', monospace;
    letter-spacing: 0.5px;
    line-height: 1.4;
  }

  &__badges {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  &__version {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 4px;
    padding: 2px 8px;
    line-height: 1.5;
  }

  &__tag {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
    padding: 2px 8px;
    line-height: 1.5;
    letter-spacing: 0.5px;
  }
}

.cl-tag--milestone { background: rgba(114,46,209,.10); color: #722ed1; border: 1px solid rgba(114,46,209,.25); }
.cl-tag--feature { background: rgba(64,158,255,.10); color: #409eff; border: 1px solid rgba(64,158,255,.25); }
.cl-tag--fix     { background: rgba(230,162,60,.10);  color: #e6a23c; border: 1px solid rgba(230,162,60,.25); }
.cl-tag--improve { background: rgba(103,194,58,.10);  color: #67c23a; border: 1px solid rgba(103,194,58,.25); }
.cl-tag--default { background: var(--el-fill-color-light); color: var(--el-text-color-secondary); border: 1px solid var(--el-border-color-lighter); }

/* ========== 中间节点 ========== */
.cl-track {
  display: flex;
  flex-direction: column;
  align-items: center;

  &__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--el-color-primary);
    flex-shrink: 0;
    margin-top: 6px;
    box-shadow: 0 0 0 3px rgba(64,158,255,.15);
    z-index: 1;
  }
}

.cl-entry--first .cl-track__dot {
  width: 12px;
  height: 12px;
  box-shadow: 0 0 0 4px rgba(64,158,255,.2);
}

/* ========== 右列 ========== */
.cl-body {
  &__title {
    font-size: 17px;
    font-weight: 700;
    color: var(--el-text-color-primary);
    margin: 0 0 12px;
    line-height: 1.5;
  }

  &__list {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      position: relative;
      padding-left: 18px;
      font-size: 14px;
      line-height: 2;
      color: var(--el-text-color-regular);

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 13px;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--el-text-color-placeholder);
      }
    }
  }
}

.cl-empty { padding: 80px 0; }

/* ========== 页脚 ========== */
.cl-footer {
  max-width: 1200px;
  /* 上 auto = 吃掉剩余空间把页脚顶到底（内容不足一屏时），左右 auto 居中，下 0。
     ⚠️ 不要拆成两条规则写 margin-top:auto——本块的 margin 简写会把它重置掉（已踩） */
  margin: auto auto 0;
  padding: 0 32px;

  &__divider {
    height: 1px;
    background: var(--el-border-color);
    margin: 48px 0 32px;
  }

  &__copyright {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    text-align: center;
    margin: 0;
    padding: 20px 0 32px;
    letter-spacing: 0.5px;
  }
}

/* ========== 回到顶部 ========== */
.cl-backtop {
  position: fixed;
  right: 32px;
  bottom: 40px;
  z-index: 100;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  color: var(--el-text-color-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(0,0,0,.08);
  transition: all 0.2s;

  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 4px 16px rgba(64,158,255,.15);
  }
}

.cl-fade-enter-active,
.cl-fade-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.cl-fade-enter-from,
.cl-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* ========== 桌面端隐藏移动元信息 ========== */
.cl-body__mobile-meta { display: none; }

/* ========== 移动端 ========== */
@media (max-width: 768px) {
  .cl-hero {
    padding: 12px 14px 12px;
    &__title { font-size: 18px; letter-spacing: 1px; }
    &__sub { font-size: 12px; }
  }

  .cl-timeline {
    padding: 20px 14px 0;
  }

  .cl-entry {
    grid-template-columns: 20px 1fr;
    gap: 0 14px;
    padding-bottom: 28px;
  }

  .cl-timeline::before { left: 24px; }

  .cl-meta { display: none; }

  .cl-body__mobile-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;

    time {
      font-size: 14px;
      font-weight: 700;
      color: var(--el-color-primary);
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    }
  }

  .cl-footer {
    padding: 0 14px;

    &__divider { margin: 32px 0 24px; }
  }

  .cl-backtop {
    right: 16px;
    bottom: 24px;
    width: 36px;
    height: 36px;
  }
}
</style>
