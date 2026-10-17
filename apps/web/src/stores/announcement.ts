import { defineStore } from 'pinia';
import {
  getAnnouncementHistory,
  getAnnouncementPending,
  type AnnouncementItem,
} from '@/api/announcement';
import { tokenStore } from '@/utils/request';

const POLL_MS = 60_000;
const RECONNECT_MS = 3_000;

export const useAnnouncementStore = defineStore('announcement', {
  state: () => ({
    pending: [] as AnnouncementItem[],
    history: [] as AnnouncementItem[],
    historyTotal: 0,
    centerOpen: false,
    started: false,
    snoozedIds: [] as number[],
    refreshTimer: null as ReturnType<typeof setInterval> | null,
    reconnectTimer: null as ReturnType<typeof setTimeout> | null,
    streamAbort: null as AbortController | null,
    channel: null as BroadcastChannel | null,
  }),

  getters: {
    unreadCount: (state) => state.pending.length,
    homeList: (state) => state.history.slice(0, 10),
    popupItems: (state) => state.pending.filter((item) => !state.snoozedIds.includes(item.id)),
  },

  actions: {
    async refresh(silent = true) {
      try {
        const [pending, history] = await Promise.all([
          getAnnouncementPending(),
          getAnnouncementHistory({ page: 1, pageSize: 10 }, true),
        ]);
        this.pending = pending.list;
        this.history = history.list;
        this.historyTotal = history.total;
      } catch (err) {
        if (!silent) throw err;
      }
    },

    openCenter() {
      this.centerOpen = true;
      void this.refresh();
    },

    snooze(ids: number[]) {
      this.snoozedIds = [...new Set([...this.snoozedIds, ...ids])];
    },

    async start() {
      if (this.started) return;
      this.started = true;
      await this.refresh();
      this.refreshTimer = setInterval(() => void this.refresh(), POLL_MS);
      window.addEventListener('focus', this.onFocus);
      if ('BroadcastChannel' in window) {
        this.channel = new BroadcastChannel('hb_oms_announcement');
        this.channel.onmessage = () => void this.refresh();
      }
      void this.connectStream();
    },

    stop() {
      this.started = false;
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.streamAbort?.abort();
      this.channel?.close();
      window.removeEventListener('focus', this.onFocus);
      this.refreshTimer = null;
      this.reconnectTimer = null;
      this.streamAbort = null;
      this.channel = null;
    },

    /** 登录身份边界必须清空，防止切换账号时短暂展示上一账号的通告。 */
    resetSession() {
      this.stop();
      this.pending = [];
      this.history = [];
      this.historyTotal = 0;
      this.centerOpen = false;
      this.snoozedIds = [];
    },

    onFocus() {
      void this.refresh();
    },

    async connectStream() {
      if (!this.started || !tokenStore.get()) return;
      this.streamAbort?.abort();
      const abort = new AbortController();
      this.streamAbort = abort;
      const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      try {
        const response = await fetch(`${apiBase}/api/announcement/stream`, {
          headers: { Authorization: `Bearer ${tokenStore.get()}` },
          cache: 'no-store',
          signal: abort.signal,
        });
        if (response.status === 401) {
          // 通过 axios 发一次权威查询，复用全局 token 刷新队列；成功后下一轮用新 token 重连。
          await this.refresh(false);
          return;
        }
        if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (this.started && !abort.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() || '';
          for (const frame of frames) {
            if (/^event:\s*announcement/m.test(frame)) {
              await this.refresh();
              this.channel?.postMessage({ type: 'refresh' });
            }
          }
        }
      } catch {
        // SSE 是加速通道；断线由重连、60 秒轮询与窗口聚焦共同兜底。
      } finally {
        if (this.started && this.streamAbort === abort) {
          this.reconnectTimer = setTimeout(() => void this.connectStream(), RECONNECT_MS);
        }
      }
    },
  },
});
