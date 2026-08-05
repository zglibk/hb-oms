<template>
  <div class="page">
    <el-card shadow="never" v-loading="loading">
      <div class="hist-header">
        <div class="hist-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">修改履历</span>
          <span v-if="info" class="title-sub">{{ info.drawingNo }}<template v-if="info.productName"> · {{ info.productName }}</template></span>
        </div>
        <span class="hist-total" v-if="historyList.length">共 {{ historyList.length }} 次记录</span>
      </div>

      <el-empty v-if="!loading && !historyList.length" description="暂无履历" />
      <el-timeline v-else class="history-timeline">
        <el-timeline-item
          v-for="h in historyList"
          :key="h.id"
          :timestamp="`${(h.createdAt || '').replace('T', ' ').slice(0, 19)} · ${h.operatorName || '—'}`"
          :type="h.action === 'create' ? 'success' : h.action === 'import' ? 'warning' : 'primary'"
          placement="top"
        >
          <div class="hist-card">
            <div class="hist-action">{{ actionLabel(h.action) }}<span class="hist-count">（{{ h.changes.length }} 项变更）</span></div>
            <div v-for="grp in groupChanges(h.changes)" :key="grp.scope" class="hist-group">
              <span class="hist-scope" :class="`scope-${grp.scope}`">{{ scopeLabel(grp.scope) }}</span>
              <div v-for="c in grp.items" :key="c.field" class="hist-line">
                <span class="hist-field">{{ c.label }}</span>
                <template v-if="c.old"><span class="hist-old">{{ c.old }}</span><span class="hist-arrow">→</span></template>
                <span class="hist-new">{{ c.new || '（清空）' }}</span>
              </div>
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Back } from '@element-plus/icons-vue';
import {
  getProcessInfoDetail,
  getProcessInfoHistory,
  type ProcessInfoItem,
  type ProcessInfoHistoryItem,
} from '@/api/process-info';

const route = useRoute();
const router = useRouter();
const id = Number(route.query.id);

const loading = ref(false);
const info = ref<ProcessInfoItem | null>(null);
const historyList = ref<ProcessInfoHistoryItem[]>([]);

async function init() {
  if (!id) {
    goBack();
    return;
  }
  loading.value = true;
  try {
    [info.value, historyList.value] = await Promise.all([
      getProcessInfoDetail(id),
      getProcessInfoHistory(id),
    ]);
  } finally {
    loading.value = false;
  }
}
init();

function actionLabel(action: string): string {
  return action === 'create' ? '新增' : action === 'import' ? '导入更新' : '修改';
}
const SCOPE_LABELS: Record<string, string> = { product: '产品级', outer: '外轨', middle: '中轨', inner: '内轨' };
function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}
function groupChanges(changes: ProcessInfoHistoryItem['changes']) {
  const order = ['product', 'outer', 'middle', 'inner'];
  return order
    .map((scope) => ({ scope, items: changes.filter((c) => c.scope === scope) }))
    .filter((g) => g.items.length);
}

function goBack() {
  router.push('/basic/process-info');
}
</script>

<script lang="ts">
export default { name: 'ProcessInfoHistory' };
</script>

<style scoped lang="scss">
.hist-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; margin-bottom: 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  .hist-title { display: flex; align-items: center; gap: 12px; }
  .title-text { font-size: 16px; font-weight: 600; }
  .title-sub { color: var(--el-text-color-secondary); font-size: 13px; }
  .hist-total { color: var(--el-text-color-secondary); font-size: 13px; }
}
/* 标题行固定：时间线区域内部滚动，内容超出视口时仅滚动此区、标题行不动 */
.history-timeline {
  max-height: calc(100vh - 252px);
  min-height: 200px;
  overflow-y: auto;
  padding-left: 8px; padding-right: 8px; max-width: 900px;
  .hist-card {
    background: var(--el-fill-color-lighter);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px; padding: 10px 14px;
  }
  .hist-action { font-weight: 600; margin-bottom: 6px; }
  .hist-count { font-weight: 400; color: var(--el-text-color-secondary); font-size: 12px; }
  .hist-group { margin: 6px 0; }
  .hist-scope {
    display: inline-block; font-size: 12px; padding: 1px 8px; border-radius: 4px; margin-bottom: 4px;
    background: var(--el-fill-color-light); color: var(--el-text-color-regular);
    border: 1px solid var(--el-border-color-lighter);
    &.scope-product { background: var(--el-color-primary-light-9); color: var(--el-color-primary); border-color: var(--el-color-primary-light-7); }
  }
  .hist-line { font-size: 13px; margin: 2px 0 2px 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
  .hist-field { color: var(--el-text-color-secondary); flex: none; }
  .hist-old { color: var(--el-text-color-placeholder); text-decoration: line-through; word-break: break-all; }
  .hist-arrow { color: var(--el-color-warning); flex: none; }
  .hist-new { color: var(--el-text-color-primary); word-break: break-all; }
}
</style>
