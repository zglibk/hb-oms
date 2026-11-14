<template>
  <div class="database-ops" v-loading="loading">
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="数据库运维仅限内置超级管理员"
      description="所有操作均为固定白名单动作并写入操作日志，不提供命令或服务器路径输入。第 1、2、3、5 项可按当前状态启用或停用；建议在任何配置变更前执行第 6 项完整备份。"
    />

    <div class="ops-toolbar">
      <div>
        <strong>数据库：</strong>{{ status?.databaseName || '—' }}
        <span class="ops-platform">运行环境：{{ status?.platform || '—' }}</span>
      </div>
      <el-button size="small" :loading="loading" @click="loadStatus">刷新状态</el-button>
    </div>

    <el-alert
      v-if="status && !status.supported"
      type="info"
      :closable="false"
      show-icon
      title="当前环境不能修改操作系统配置"
      description="第 1～3、5 项需要 Linux/systemd 且服务进程具备系统管理权限；当前环境只展示状态。完整备份在安装 mysqldump 后仍可使用。"
      class="unsupported-alert"
    />

    <div v-if="status" class="ops-grid">
      <OpsCard
        number="1"
        title="受控数据库更新"
        :item="status.updatePolicy"
        :action-text="status.updatePolicy.applied ? '停用更新策略' : '应用更新策略'"
        :danger="status.updatePolicy.applied"
        :busy="busyAction === 'update-policy'"
        :disabled="!status.supported || !!busyAction || backingUp"
        @action="toggleAction('update-policy', status.updatePolicy)"
      >
        将 MySQL 软件包排除出每日无人值守更新，其它系统安全更新继续正常执行；MySQL 改为在维护窗口内人工升级。
      </OpsCard>

      <OpsCard
        number="2"
        title="启停与重启保护"
        :item="status.restartGuard"
        :action-text="status.restartGuard.applied ? '停用重启保护' : '应用重启保护'"
        :danger="status.restartGuard.applied"
        :busy="busyAction === 'restart-guard'"
        :disabled="!status.supported || !!busyAction || backingUp"
        @action="toggleAction('restart-guard', status.restartGuard)"
      >
        限制 MySQL 启动/停止最长等待 300 秒，失败后按受控频率重试，避免系统更新期间无限卡在停止阶段。
      </OpsCard>

      <OpsCard
        number="3"
        title="自动巡检与恢复"
        :item="status.watchdog"
        :action-text="status.watchdog.applied ? '停用自愈巡检' : '启用自愈巡检'"
        :danger="status.watchdog.applied"
        :busy="busyAction === 'watchdog'"
        :disabled="!status.supported || !!busyAction || backingUp"
        @action="toggleAction('watchdog', status.watchdog)"
      >
        每分钟执行连接与 SQL 双重检测；连续两次失败时受控重启 MySQL，并把最近健康/恢复结果写入本页状态与系统日志。
      </OpsCard>

      <OpsCard
        number="4"
        title="就绪探测与友好降级"
        :item="status.readiness"
        action-text="重新检测"
        :busy="loading"
        :disabled="loading || !!busyAction || backingUp"
        @action="loadStatus"
      >
        系统内置 <code>/api/health/ready</code> 数据库就绪探测；连接异常统一返回 HTTP 503 和维护提示，不再向用户显示 ECONNREFUSED 等底层错误。
      </OpsCard>

      <OpsCard
        number="5"
        title="限制数据库为生产服务器内部访问"
        :item="status.localBind"
        :action-text="status.localBind.applied ? '取消内部访问限制' : '限制为内部访问'"
        danger
        :busy="busyAction === 'local-bind'"
        :disabled="!status.supported || !!busyAction || backingUp || (!status.localBind.applied && status.localBind.remoteConnections !== 0)"
        @action="toggleLocalBind"
      >
        限制 MySQL 仅供生产服务器内部应用访问。启用前会拒绝存在非本机连接的服务器；启用或停用均在配置校验通过后延迟重启数据库。
      </OpsCard>

      <OpsCard
        number="6"
        title="完整数据库备份"
        :item="status.backup"
        action-text="完整备份到本机"
        :busy="backingUp"
        :disabled="!!busyAction || backingUp || !status.backup.healthy"
        @action="backupDatabase"
      >
        导出当前 OMS 数据库的完整结构与数据（含触发器、事件、存储过程），生成压缩的 <code>.sql.gz</code> 文件。服务器仅保留生成期间的临时文件，下载结束立即清理。
      </OpsCard>
    </div>

    <el-alert
      :type="canPickFile ? 'success' : 'info'"
      :closable="false"
      show-icon
      class="save-hint"
      :title="canPickFile ? '浏览器支持选择本地保存位置' : '当前访问方式不支持网页直接选择本地路径'"
      :description="canPickFile
        ? '点击“完整备份到本机”后会先打开系统保存窗口，由你选择目录和文件名。'
        : '当前生产站点使用 HTTP，浏览器安全策略不开放目录选择器；系统将回退为浏览器下载/另存为，实际保存路径由浏览器下载设置决定。'"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';
import { ElButton, ElCard, ElMessage, ElMessageBox, ElTag } from 'element-plus';
import {
  applyDatabaseOps,
  downloadDatabaseBackup,
  getDatabaseOpsStatus,
  type DatabaseOpsAction,
  type DatabaseOpsItemStatus,
  type DatabaseOpsStatus,
} from '@/api/system';

const props = defineProps<{ active: boolean }>();
const status = ref<DatabaseOpsStatus | null>(null);
const loading = ref(false);
const busyAction = ref<DatabaseOpsAction | ''>('');
const backingUp = ref(false);
const loaded = ref(false);
const canPickFile = computed(() =>
  window.isSecureContext && typeof (window as any).showSaveFilePicker === 'function',
);

const OpsCard = defineComponent({
  name: 'DatabaseOpsCard',
  props: {
    number: { type: String, required: true },
    title: { type: String, required: true },
    item: { type: Object as () => DatabaseOpsItemStatus, required: true },
    actionText: { type: String, required: true },
    busy: Boolean,
    disabled: Boolean,
    danger: Boolean,
  },
  emits: ['action'],
  setup(cardProps, { slots, emit }) {
    return () => h(ElCard, { shadow: 'never', class: 'ops-card' }, {
      default: () => [
        h('div', { class: 'ops-card__header' }, [
          h('div', { class: 'ops-card__heading' }, [
            h('span', { class: 'ops-card__number' }, cardProps.number),
            h('span', { class: 'ops-card__title' }, cardProps.title),
          ]),
          h(ElTag, {
            size: 'small',
            type: cardProps.item.healthy ? 'success' : cardProps.item.applied ? 'warning' : 'info',
            effect: 'light',
          }, { default: () => cardProps.item.healthy ? '正常' : cardProps.item.applied ? '待确认' : '未应用' }),
        ]),
        h('div', { class: 'ops-card__desc' }, slots.default?.()),
        h('div', { class: 'ops-card__summary' }, cardProps.item.summary),
        h('ul', { class: 'ops-card__details' }, cardProps.item.details.map((detail) => h('li', detail))),
        h('div', { class: 'ops-card__actions' }, [
          h(ElButton, {
            size: 'small',
            type: cardProps.danger ? 'danger' : 'primary',
            plain: !cardProps.danger,
            loading: cardProps.busy,
            disabled: cardProps.disabled,
            onClick: () => emit('action'),
          }, { default: () => cardProps.actionText }),
        ]),
      ],
    });
  },
});

async function loadStatus() {
  loading.value = true;
  try {
    status.value = await getDatabaseOpsStatus();
    loaded.value = true;
  } catch (error: any) {
    ElMessage.error(error?.message || '数据库运维状态加载失败');
  } finally {
    loading.value = false;
  }
}

async function toggleAction(
  action: Exclude<DatabaseOpsAction, 'local-bind'>,
  item: DatabaseOpsItemStatus,
) {
  const labels: Record<typeof action, string> = {
    'update-policy': '受控数据库更新策略',
    'restart-guard': '启停与重启保护',
    watchdog: '数据库自动巡检与恢复',
  };
  const disableNotes: Record<typeof action, string> = {
    'update-policy': '停用后 MySQL 软件包将重新由服务器无人值守更新策略接管。',
    'restart-guard': '停用后将恢复 MySQL 服务原有的 systemd 启停与重启规则。',
    watchdog: '停用后每分钟巡检和自动恢复将停止，相关 OMS 巡检配置会被清理。',
  };
  const enabling = !item.applied;
  const verb = enabling ? '启用' : '停用';
  try {
    await ElMessageBox.confirm(
      enabling
        ? `确定在当前服务器启用“${labels[action]}”吗？该操作只写入系统预置的固定配置。`
        : `确定停用“${labels[action]}”吗？${disableNotes[action]}`,
      '数据库运维确认',
      {
        type: enabling ? 'warning' : 'error',
        confirmButtonText: `确认${verb}`,
        cancelButtonText: '取消',
      },
    );
  } catch { return; }
  busyAction.value = action;
  try {
    const result = await applyDatabaseOps(action, enabling);
    ElMessage.success(result.message);
    await loadStatus();
  } catch (error: any) {
    ElMessage.error(error?.message || `${verb}失败`);
  } finally {
    busyAction.value = '';
  }
}

async function toggleLocalBind() {
  if (!status.value) return;
  const enabling = !status.value.localBind.applied;
  if (enabling && status.value.localBind.remoteConnections !== 0) {
    ElMessage.error(status.value.localBind.remoteConnections > 0
      ? `当前仍有 ${status.value.localBind.remoteConnections} 个非生产服务器本机连接，不能执行`
      : '当前数据库账号无法核验全部连接，不能安全执行');
    return;
  }
  let confirm = '';
  const confirmPhrase = enabling ? '限制本机' : '取消限制';
  try {
    const result = await ElMessageBox.prompt(
      enabling
        ? '限制 MySQL 仅供生产服务器内部应用访问，并在约 5 秒后重启数据库。请先完成第 6 项备份，然后输入“限制本机”继续。'
        : '该操作将取消 OMS 写入的生产服务器本机访问限制，MySQL 实际监听范围将由服务器其它配置决定，并在约 5 秒后重启数据库。请输入“取消限制”继续。',
      '高风险操作确认',
      {
        type: 'error',
        inputPlaceholder: `请输入“${confirmPhrase}”`,
        inputPattern: enabling ? /^限制本机$/ : /^取消限制$/,
        inputErrorMessage: '确认口令不正确',
        confirmButtonText: '确认执行',
        cancelButtonText: '取消',
      },
    );
    confirm = result.value;
  } catch { return; }
  busyAction.value = 'local-bind';
  try {
    const result = await applyDatabaseOps('local-bind', enabling, confirm);
    ElMessage.success(result.message);
    window.setTimeout(() => void loadStatus(), 12_000);
  } catch (error: any) {
    ElMessage.error(error?.message || (enabling ? '限制生产服务器本机访问失败' : '取消本机访问限制失败'));
  } finally {
    busyAction.value = '';
  }
}

async function backupDatabase() {
  backingUp.value = true;
  let fileHandle: any;
  try {
    if (canPickFile.value) {
      fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: `haibao_oms_full_${Date.now()}.sql.gz`,
        types: [{
          description: 'Gzip 压缩的 SQL 完整备份',
          accept: { 'application/gzip': ['.gz'] },
        }],
      });
    }
    const result = await downloadDatabaseBackup(fileHandle);
    ElMessage.success(result.pickedPath
      ? `完整备份已保存：${fileHandle?.name || result.filename}`
      : `完整备份已交给浏览器下载：${result.filename}`);
  } catch (error: any) {
    if (error?.name === 'AbortError') return;
    ElMessage.error(error?.message || '完整备份失败');
  } finally {
    backingUp.value = false;
  }
}

watch(() => props.active, (active) => {
  if (active && !loaded.value) void loadStatus();
});
onMounted(() => {
  if (props.active) void loadStatus();
});
</script>

<style scoped lang="scss">
.database-ops { max-width: 1120px; padding: 16px 0; }
.database-ops :deep(.el-alert) { padding: 10px 14px; }
.database-ops :deep(.el-alert__icon) { width: 16px; font-size: 16px; }
.database-ops :deep(.el-alert__title) { font-size: 13px; line-height: 1.5; font-weight: 600; }
.database-ops :deep(.el-alert__description) { margin-top: 2px; font-size: 12px; line-height: 1.6; }
.ops-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 16px 0 12px; color: var(--el-text-color-regular); font-size: 13px;
}
.ops-platform { margin-left: 24px; color: var(--el-text-color-secondary); }
.unsupported-alert { margin-bottom: 12px; }
.ops-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
:deep(.ops-card .el-card__body) { padding: 16px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; }
.database-ops :deep(.ops-card__header) { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.database-ops :deep(.ops-card__heading) { display: flex; align-items: center; min-width: 0; }
.database-ops :deep(.ops-card__number) {
  width: 24px; height: 24px; border-radius: 50%; margin-right: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--el-color-primary); background: var(--el-color-primary-light-9); font-weight: 700;
}
.database-ops :deep(.ops-card__title) { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.database-ops :deep(.ops-card__desc) { margin: 12px 0 8px; min-height: 44px; color: var(--el-text-color-regular); font-size: 12px; line-height: 1.7; }
.database-ops :deep(.ops-card__desc code) { padding: 1px 4px; border-radius: 3px; background: var(--el-fill-color-light); }
.database-ops :deep(.ops-card__summary) { font-size: 12px; font-weight: 600; color: var(--el-text-color-primary); }
.database-ops :deep(.ops-card__details) { margin: 6px 0 14px; padding-left: 18px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.7; }
.database-ops :deep(.ops-card__actions) { margin-top: auto; }
.save-hint { margin-top: 14px; }
@media (max-width: 900px) {
  .ops-grid { grid-template-columns: 1fr; }
  .ops-platform { display: block; margin: 4px 0 0; }
}
</style>
