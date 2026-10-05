<!--
  首页「系统更新」弹窗：每轮发布后，用户首次进入首页时弹出本次更新明细。

  - 弹不弹由服务端按人判定（`t_user.changelog_seen_id` 水位线），换电脑不会重复弹；
    新账号 / 从未看过的只弹最新一个版本。
  - 明细超出可见高度时复用 useAutoScroll 缓慢向下滚动、到底停顿后回到顶部，
    鼠标移入暂停（同首页待办卡的口径）；系统开了「减少动态效果」则不自动滚。
  - 新手引导要自动弹出（新浏览器 / 引导改版）时，等引导结束再弹，不叠两层遮罩。
  - 关闭（按钮或右上角 ×）即登记已读，回传的是「这次看到的最大 id」，
    弹窗开着期间新发布的条目下次进首页照样会弹。
-->
<template>
  <el-dialog
    v-model="visible"
    width="560px"
    class="changelog-notice"
    append-to-body
    align-center
    @opened="onOpened"
    @closed="onClosed"
  >
    <template #header>
      <div class="changelog-notice__head">
        <el-icon class="changelog-notice__icon" aria-hidden="true"><Promotion /></el-icon>
        <span class="changelog-notice__title">系统已更新</span>
        <el-tag v-for="v in versions" :key="v" size="small" effect="plain" round>{{ v }}</el-tag>
      </div>
    </template>

    <div
      ref="scrollRef"
      class="changelog-notice__body"
      @mouseenter="scroller.pause()"
      @mouseleave="scroller.resume()"
    >
      <section v-for="g in groups" :key="g.key" class="changelog-notice__group">
        <div class="changelog-notice__group-head">
          <span class="changelog-notice__version">{{ g.version }}</span>
          <span v-if="g.title" class="changelog-notice__group-title">{{ g.title }}</span>
          <span class="changelog-notice__date">{{ g.date }}</span>
        </div>
        <ol class="changelog-notice__list">
          <li v-for="(line, i) in g.content" :key="i">{{ line }}</li>
        </ol>
      </section>
    </div>

    <template #footer>
      <div class="changelog-notice__foot">
        <span class="changelog-notice__hint">鼠标移入可暂停滚动</span>
        <el-button type="primary" @click="visible = false">我知道了</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Promotion } from '@element-plus/icons-vue';
import { getUnseenChangelog, markChangelogSeen, type ChangelogItem } from '@/api/changelog';
import { useAutoScroll } from '@/composables/useAutoScroll';
import { useTour } from '@/composables/useTour';
import { formatDate } from '@/utils/date';

const visible = ref(false);
const items = ref<ChangelogItem[]>([]);
let latestId = 0;

const scrollRef = ref<HTMLElement>();
/** 比首页待办卡（26px/s）更慢：这里是逐条阅读的长句，不是扫一眼的列表行 */
const scroller = useAutoScroll(() => scrollRef.value, { speed: 16, holdMs: 2500 });

/** 同一版本可能维护成多条记录（不同分类/标题），按记录逐段展示 */
const groups = computed(() =>
  items.value.map((r) => ({
    key: r.id,
    version: r.version,
    title: r.title,
    date: formatDate(r.releasedAt),
    content: r.content ?? [],
  })),
);
const versions = computed(() => [...new Set(items.value.map((r) => r.version))]);

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function onOpened() {
  scroller.reset();
  if (!reduceMotion) scroller.start();
}

function onClosed() {
  scroller.stop();
  if (latestId > 0) markChangelogSeen(latestId).catch(() => {});
}

const { tourOpen, shouldAutoStart } = useTour();

/**
 * 引导由布局层在挂载后延时自动启动（首页先于布局挂载，此刻 tourOpen 可能还是 false），
 * 故按「引导还没看过」判断要不要等；引导关闭时 finishTour 已写入已看标记。
 */
function showAfterTour() {
  if (!tourOpen.value && !shouldAutoStart()) {
    visible.value = true;
    return;
  }
  const stop = watch(tourOpen, (open) => {
    if (open || shouldAutoStart()) return;
    stop();
    visible.value = true;
  });
}

onMounted(async () => {
  try {
    const res = await getUnseenChangelog();
    if (!res.list.length) return;
    items.value = res.list;
    latestId = res.latestId;
    showAfterTour();
  } catch {
    // 弹窗只是告知，取不到就算了，不打扰用户
  }
});
</script>

<style scoped lang="scss">
.changelog-notice__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.changelog-notice__icon {
  font-size: 18px;
  color: var(--el-color-primary);
}
.changelog-notice__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.changelog-notice__body {
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}
.changelog-notice__group + .changelog-notice__group {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed var(--el-border-color);
}
.changelog-notice__group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.changelog-notice__version {
  font-weight: 600;
  color: var(--el-color-primary);
}
.changelog-notice__group-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.changelog-notice__date {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.changelog-notice__list {
  margin: 0;
  padding-left: 1.5em;
  color: var(--el-text-color-regular);
  line-height: 1.7;

  li + li {
    margin-top: 6px;
  }
}

.changelog-notice__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.changelog-notice__hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
