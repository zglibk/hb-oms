import { defineStore } from 'pinia';

/** 标签栏中一个已访问的页面 */
export interface TabItem {
  /** 完整路由路径（含参数），作为唯一标识 */
  path: string;
  /** 显示标题 */
  title: string;
  /** 路由 name，用于 keep-alive 缓存控制 */
  name?: string;
  /** 固定标签，不可关闭（如首页） */
  affix?: boolean;
}

interface TagsState {
  visitedTabs: TabItem[];
}

export const useTagsStore = defineStore('tags', {
  state: (): TagsState => ({
    visitedTabs: [{ path: '/dashboard', title: '首页', name: 'Dashboard', affix: true }],
  }),

  actions: {
    /** 新增访问标签（已存在则跳过） */
    addTab(tab: TabItem) {
      if (!tab.path || this.visitedTabs.some((t) => t.path === tab.path)) return;
      this.visitedTabs.push(tab);
    },

    /**
     * 关闭标签。返回应跳转的下一个标签（若关闭的是当前激活标签），
     * 否则返回 null。
     */
    removeTab(path: string): TabItem | null {
      const idx = this.visitedTabs.findIndex((t) => t.path === path);
      if (idx < 0) return null;
      if (this.visitedTabs[idx].affix) return null;
      this.visitedTabs.splice(idx, 1);
      // 返回相邻标签供调用方决定跳转
      return this.visitedTabs[idx] || this.visitedTabs[idx - 1] || null;
    },

    /** 关闭其它非固定标签 */
    removeOthers(path: string) {
      this.visitedTabs = this.visitedTabs.filter(
        (t) => t.affix || t.path === path,
      );
    },

    /** 关闭全部非固定标签 */
    removeAll() {
      this.visitedTabs = this.visitedTabs.filter((t) => t.affix);
    },
  },
});
