<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :model="query" class="filter-bar" label-position="left" label-width="auto" size="small" @submit.prevent>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item label="操作时间">
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                value-format="YYYY-MM-DD"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                style="width: 100%"
                @change="onDateChange"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="操作人">
              <el-input v-model="query.userName" clearable placeholder="操作人" name="userName" autocomplete="off" @keyup.enter="reload" @clear="reload" @blur="onUserBlur" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="模块">
              <el-select
                v-model="query.module"
                clearable
                filterable
                placeholder="全部"
                style="width: 100%"
                @change="onModuleChange"
              >
                <el-option v-for="m in moduleOptions" :key="m" :label="m" :value="m" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="操作">
              <el-select
                v-model="query.action"
                clearable
                filterable
                placeholder="全部"
                style="width: 100%"
                @change="reload"
              >
                <el-option v-for="a in actionOptions" :key="a" :label="a" :value="a" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="结果">
              <el-select v-model="query.result" clearable placeholder="全部" @change="reload">
                <el-option label="成功" :value="1" />
                <el-option label="失败" :value="0" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item>
              <el-button size="small" type="primary" @click="reload">查询</el-button>
              <el-button size="small" @click="resetQuery">重置</el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small"
          v-permission="'log:delete'"
          type="danger"
          :icon="Delete"
          :disabled="!selection.length"
          @click="batchDelete"
        >
          批量删除{{ selection.length ? `（${selection.length}）` : '' }}
        </el-button>
      </div>
      <app-table
        :data="list"
        v-loading="loading"
        border
        stripe
        :page="query.page"
        :page-size="query.pageSize"
        row-key="id"
        @selection-change="(s: any[]) => (selection = s)"
      >
        <el-table-column type="selection" width="44" reserve-selection />
        <el-table-column label="时间" width="170" class-name="col-num">
          <template #default="{ row }">
            {{ row.createdAt ? formatDateTime(row.createdAt) : '' }}
          </template>
        </el-table-column>
        <el-table-column label="操作人" prop="userName" width="110">
          <template #default="{ row }">
            <color-tag v-if="row.userName" :seed="row.userName">{{ row.userName }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="模块" prop="module" width="110">
          <template #default="{ row }">
            <color-tag v-if="row.module" :seed="row.module">{{ row.module }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" prop="action" width="130" show-overflow-tooltip />
        <el-table-column label="业务对象" width="120">
          <template #default="{ row }">
            <span v-if="row.bizType && row.bizId">{{ row.bizType }} #{{ row.bizId }}</span>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="描述" prop="description" width="260" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="IP" prop="ip" width="120" show-overflow-tooltip />
        <el-table-column label="结果" width="72">
          <template #default="{ row }">
            <el-tag :type="row.result === 1 ? 'success' : 'danger'" size="small">
              {{ row.result === 1 ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" :icon="View" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination
        class="pager"
        :total="total"
        v-model:page="query.page"
        v-model:size="query.pageSize"
        @change="load"
      />
    </el-card>

    <!-- 日志详情 -->
    <el-dialog v-model="detailVisible" title="操作日志详情" width="720px">
      <el-descriptions v-if="detailRow" :column="2" border size="small">
        <el-descriptions-item label="时间" :span="2">
          {{ detailRow.createdAt ? formatDateTime(detailRow.createdAt) : '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="操作人">{{ detailRow.userName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="操作人ID">{{ detailRow.userId ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ detailRow.module || '—' }}</el-descriptions-item>
        <el-descriptions-item label="操作">{{ detailRow.action || '—' }}</el-descriptions-item>
        <el-descriptions-item label="业务类型">{{ detailRow.bizType || '—' }}</el-descriptions-item>
        <el-descriptions-item label="业务ID">{{ detailRow.bizId ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">{{ detailRow.description || '—' }}</el-descriptions-item>
        <el-descriptions-item label="HTTP 方法">{{ detailRow.method || '—' }}</el-descriptions-item>
        <el-descriptions-item label="结果">
          <el-tag :type="detailRow.result === 1 ? 'success' : 'danger'" size="small">
            {{ detailRow.result === 1 ? '成功' : '失败' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="请求 IP" :span="2">{{ detailRow.ip || '—' }}</el-descriptions-item>
        <el-descriptions-item label="请求 URL" :span="2">
          <span class="detail-url">{{ detailRow.url || '—' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="请求参数" :span="2">
          <pre class="detail-params">{{ formatParams(detailRow.params) }}</pre>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button size="small" @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// keep-alive 缓存键取组件 name；本项目多数页面文件同名 index.vue，
// 不显式命名会导致缓存互相顶替、onActivated 打在错误实例上（刷新失效）。
defineOptions({ name: 'SystemLogList' });

import { ref, reactive, onActivated } from 'vue';
import { Delete, View } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getLogList,
  getLogModules,
  getLogActions,
  deleteLogs,
} from '@/api/system';
import { formatDateTime } from '@/utils/date';
import ColorTag from '@/components/ColorTag.vue';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const selection = ref<any[]>([]);
const dateRange = ref<string[] | null>(null);
const moduleOptions = ref<string[]>([]);
const actionOptions = ref<string[]>([]);
const query = reactive<any>({ page: 1, pageSize: 10 });

const detailVisible = ref(false);
const detailRow = ref<any | null>(null);

async function loadFilterOptions() {
  moduleOptions.value = await getLogModules();
  await loadActions(query.module);
}

async function loadActions(module?: string) {
  actionOptions.value = await getLogActions(module);
}

function onDateChange(val: string[] | null) {
  if (val && val.length === 2) {
    query.startDate = val[0];
    query.endDate = val[1];
  } else {
    query.startDate = undefined;
    query.endDate = undefined;
  }
  reload();
}

async function onModuleChange(val: string | undefined) {
  query.action = undefined;
  await loadActions(val);
  reload();
}

async function load() {
  loading.value = true;
  try {
    const res: any = await getLogList(query);
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}
function reload() { query.page = 1; load(); }

function onUserBlur() {
  if (query.userName && query.userName.trim()) reload();
}

function resetQuery() {
  query.userName = undefined;
  query.module = undefined;
  query.action = undefined;
  query.result = undefined;
  query.startDate = undefined;
  query.endDate = undefined;
  dateRange.value = null;
  loadActions();
  reload();
}

function openDetail(row: any) {
  detailRow.value = row;
  detailVisible.value = true;
}

function formatParams(raw: string | null | undefined): string {
  if (!raw) return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

async function batchDelete() {
  const ids = selection.value.map((r) => r.id);
  if (!ids.length) return;
  await ElMessageBox.confirm(
    `确定删除选中的 ${ids.length} 条操作日志吗？此操作不可恢复。`,
    '批量删除',
    { type: 'warning' },
  );
  await deleteLogs(ids);
  ElMessage.success('删除成功');
  selection.value = [];
  load();
  loadFilterOptions();
}

onActivated(async () => {
  await loadFilterOptions();
  await load();
});
</script>

<style scoped lang="scss">
.pager { margin-top: 12px; }

/* 工具栏 flex 子元素允许收缩，避免长文本撑破布局 */
.toolbar > * {
  min-width: 0;
}

/* 数字/时间列使用等宽数字，便于对齐 */
:deep(.col-num) {
  font-variant-numeric: tabular-nums;
}

.text-muted { color: var(--el-text-color-placeholder); }

.detail-url {
  word-break: break-all;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}

.detail-params {
  margin: 0;
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  padding: 8px 10px;
  border-radius: 4px;
}
</style>
