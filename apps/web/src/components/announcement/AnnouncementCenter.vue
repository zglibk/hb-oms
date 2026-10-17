<template>
  <el-drawer
    v-model="store.centerOpen"
    title="通知公告中心"
    size="min(720px, 92vw)"
    append-to-body
    @open="loadHistory"
  >
    <el-tabs v-model="tab" @tab-change="onTabChange">
      <el-tab-pane name="pending">
        <template #label>
          <span>未读/待回复 <el-badge v-if="store.unreadCount" :value="badgeText" /></span>
        </template>
        <AnnouncementList :items="store.pending" empty-text="暂无未读或待回复通告" @open="openDetail" />
      </el-tab-pane>
      <el-tab-pane label="历史通告" name="history">
        <div v-loading="historyLoading" class="history-pane">
          <AnnouncementList :items="history" empty-text="暂无历史通告" @open="openDetail" />
          <app-pagination
            v-if="historyTotal > size"
            :total="historyTotal"
            v-model:page="page"
            v-model:size="size"
            @change="loadHistory"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElEmpty, ElTag } from 'element-plus';
import { getAnnouncementHistory, type AnnouncementItem } from '@/api/announcement';
import { useAnnouncementStore } from '@/stores/announcement';
import AnnouncementLevel from './AnnouncementLevel.vue';
import { formatDateTime } from '@/utils/date';

const store = useAnnouncementStore();
const router = useRouter();
const tab = ref<'pending' | 'history'>('pending');
const history = ref<AnnouncementItem[]>([]);
const historyTotal = ref(0);
const historyLoading = ref(false);
const page = ref(1);
const size = ref(20);
const badgeText = computed(() => (store.unreadCount > 99 ? '99+' : store.unreadCount));

const AnnouncementList = defineComponent({
  props: { items: { type: Array as () => AnnouncementItem[], required: true }, emptyText: String },
  emits: ['open'],
  setup(props, { emit }) {
    return () => props.items.length
      ? h('div', { class: 'center-list' }, props.items.map((item) => h('button', {
          type: 'button', class: 'center-row', onClick: () => emit('open', item.id),
        }, [
          h('div', { class: 'center-row__title' }, [
            h(AnnouncementLevel, { level: item.level }),
            h('span', { class: 'center-row__text', title: item.title }, item.title),
            item.isUnread ? h(ElTag, { type: 'danger', effect: 'dark', size: 'small', round: true }, () => 'New') : null,
          ]),
          h('div', { class: 'center-row__summary' }, item.summary),
          h('div', { class: 'center-row__meta' }, [
            h('span', formatDateTime(item.publishAt)),
            item.requiresReply ? h(ElTag, { type: item.completedAt ? 'success' : 'warning', size: 'small' }, () => item.completedAt ? '已回复' : '待回复') : null,
          ]),
        ])))
      : h(ElEmpty, { description: props.emptyText, imageSize: 72 });
  },
});

async function loadHistory() {
  if (tab.value !== 'history') return;
  historyLoading.value = true;
  try {
    const result = await getAnnouncementHistory({ page: page.value, pageSize: size.value });
    history.value = result.list;
    historyTotal.value = result.total;
  } finally {
    historyLoading.value = false;
  }
}
function onTabChange() { if (tab.value === 'history') void loadHistory(); }
function openDetail(id: number) {
  // 从中心进入详情属于用户主动处理，本页面会话内不再弹窗打断导航。
  store.snooze([id]);
  store.centerOpen = false;
  void router.push(`/announcement/${id}`);
}
</script>

<style scoped lang="scss">
:deep(.el-badge__content) { transform: translate(8px, -6px); }
:deep(.center-list) { display: flex; flex-direction: column; }
:deep(.center-row) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 14px 4px;
  border: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  &:hover { background: var(--el-fill-color-light); }
}
:deep(.center-row__title) { display: flex; min-width: 0; align-items: center; gap: 5px; font-weight: 600; }
:deep(.center-row__text) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:deep(.center-row__summary) { overflow: hidden; color: var(--el-text-color-secondary); text-overflow: ellipsis; white-space: nowrap; }
:deep(.center-row__meta) { display: flex; align-items: center; gap: 8px; color: var(--el-text-color-placeholder); font-size: 12px; }
.history-pane { min-height: 160px; }
</style>
