<template>
  <AnnouncementCenter />
  <AnnouncementPendingDialog
    v-model="pendingVisible"
    :items="store.popupItems"
    @snooze="snoozeCurrent"
    @closed="notifyModalState(false)"
    @ack="ackCurrent"
    @detail="openDetail"
  />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ackAnnouncements } from '@/api/announcement';
import { useAnnouncementStore } from '@/stores/announcement';
import { useTour } from '@/composables/useTour';
import AnnouncementCenter from './AnnouncementCenter.vue';
import AnnouncementPendingDialog from './AnnouncementPendingDialog.vue';

const store = useAnnouncementStore();
const router = useRouter();
const { tourOpen, shouldAutoStart } = useTour();
const pendingVisible = ref(false);
document.body.dataset.announcementChecking = '1';

function notifyModalState(open: boolean) {
  if (open) document.body.dataset.announcementModal = '1';
  else delete document.body.dataset.announcementModal;
  window.dispatchEvent(new CustomEvent('hb-oms-announcement-modal', { detail: { open } }));
}

function maybeOpen() {
  if (!store.popupItems.length || store.centerOpen || tourOpen.value || shouldAutoStart()) return;
  if (document.body.dataset.changelogModal === '1') return;
  pendingVisible.value = true;
}

function snoozeCurrent() {
  store.snooze(store.popupItems.map((item) => item.id));
  pendingVisible.value = false;
}

async function ackCurrent() {
  const current = [...store.popupItems];
  const normalIds = current.filter((item) => !item.requiresReply).map((item) => item.id);
  if (normalIds.length) await ackAnnouncements(normalIds);
  store.snooze(current.map((item) => item.id));
  pendingVisible.value = false;
  await store.refresh();
}

function openDetail(id: number) {
  store.snooze([id]);
  pendingVisible.value = false;
  router.push(`/announcement/${id}`);
}

watch(pendingVisible, (open) => {
  if (open) notifyModalState(true);
});
watch(() => [store.popupItems.length, store.centerOpen, tourOpen.value] as const, () => {
  if (store.centerOpen) pendingVisible.value = false;
  else void nextTick(maybeOpen);
});

onMounted(async () => {
  try {
    await store.start();
    maybeOpen();
    await nextTick();
    if (pendingVisible.value) notifyModalState(true);
  } finally {
    delete document.body.dataset.announcementChecking;
    window.dispatchEvent(new CustomEvent('hb-oms-announcement-ready'));
  }
});
onBeforeUnmount(() => {
  delete document.body.dataset.announcementChecking;
  notifyModalState(false);
  store.stop();
});
</script>
