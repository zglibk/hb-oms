<template>
  <div class="database-ops" v-loading="loading">
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="数据库运维仅限内置超级管理员"
      description="所有操作均为固定白名单动作并写入操作日志，不提供命令或服务器路径输入。第 1、2、3、5 项可按当前状态启用或停用；第 7 项仅用于系统迁移或数据库不可逆损坏等极端灾备场景。"
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
      <el-card shadow="never" class="ops-card upgrade-card">
        <div class="ops-card__header">
          <div class="ops-card__heading">
            <span class="ops-card__number">1</span>
            <span class="ops-card__title">受控数据库更新</span>
          </div>
          <el-tag size="small" :type="upgradeStatusType" effect="light">{{ upgradeStatusLabel }}</el-tag>
        </div>
        <div class="ops-card__desc">
          退出无人值守更新后，可由超级管理员检查生产服务器软件源并执行同一版本系列内的补丁/安全升级；跨系列升级只提示、不开放按钮。
        </div>

        <template v-if="upgradeJob">
          <div class="upgrade-version-line">
            {{ upgradeJob.packageName }}：<strong>{{ upgradeJob.fromVersion }}</strong>
            <span>→</span><strong>{{ upgradeJob.targetVersion }}</strong>
          </div>
          <el-progress
            :percentage="upgradeJob.progress"
            :status="upgradeJob.status === 'succeeded' ? 'success' : ['failed', 'critical'].includes(upgradeJob.status) ? 'exception' : undefined"
          />
          <div class="restore-progress__message">{{ upgradeJob.message }}</div>
          <div v-if="upgradeJob.safetyBackupFilename" class="upgrade-backup">
            升级前安全备份：{{ upgradeJob.safetyBackupFilename }}（成功任务保留 7 天；异常任务留待运维核验）
          </div>
          <div class="restore-progress__updated">最后更新：{{ upgradeJob.updatedAt || '—' }}</div>
        </template>
        <template v-else>
          <div class="upgrade-versions">
            <div><span>数据库运行版本</span><strong>{{ status.upgrade.runtimeVersion }}</strong></div>
            <div><span>服务器安装包</span><strong>{{ status.upgrade.packageName }} {{ status.upgrade.installedVersion }}</strong></div>
            <div><span>软件源候选版本</span><strong>{{ status.upgrade.candidateVersion }}</strong></div>
            <div><span>软件源缓存时间</span><strong>{{ status.upgrade.repositoryUpdatedAt }}</strong></div>
          </div>
          <div class="ops-card__summary">{{ status.upgrade.reason }}</div>
          <ul class="ops-card__details">
            <li>{{ status.updatePolicy.summary }}</li>
            <li>候选版本仅指当前生产服务器软件源，不代表官网全局最新版</li>
          </ul>
        </template>

        <div class="ops-card__actions upgrade-actions">
          <el-button
            size="small"
            :type="status.updatePolicy.applied ? 'danger' : 'primary'"
            :plain="!status.updatePolicy.applied"
            :loading="busyAction === 'update-policy'"
            :disabled="!status.supported || !!busyAction || backingUp || maintenanceActive || checkingUpgrade"
            @click="toggleAction('update-policy', status.updatePolicy)"
          >{{ status.updatePolicy.applied ? '停用更新策略' : '应用更新策略' }}</el-button>
          <el-button
            size="small"
            :loading="checkingUpgrade"
            :disabled="!status.upgrade.supported || !!busyAction || backingUp || maintenanceActive || !!upgradeJob"
            @click="checkUpgrade"
          >检查可用版本</el-button>
          <el-button
            size="small"
            type="warning"
            :disabled="!status.upgrade.canUpgrade || !!busyAction || backingUp || maintenanceActive || checkingUpgrade || !!upgradeJob"
            @click="upgradeConfirmVisible = true"
          >升级至 {{ status.upgrade.candidateVersion }}</el-button>
          <el-button
            v-if="upgradeJob && !upgradeActive"
            size="small"
            :loading="loading"
            @click="showCurrentUpgradeInfo"
          >查看当前版本</el-button>
        </div>
      </el-card>

      <OpsCard
        number="2"
        title="启停与重启保护"
        :item="status.restartGuard"
        :action-text="status.restartGuard.applied ? '停用重启保护' : '应用重启保护'"
        :danger="status.restartGuard.applied"
        :busy="busyAction === 'restart-guard'"
        :disabled="!status.supported || !!busyAction || backingUp || maintenanceActive"
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
        :disabled="!status.supported || !!busyAction || backingUp || maintenanceActive"
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
        :disabled="loading || !!busyAction || backingUp || maintenanceActive"
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
        :disabled="!status.supported || !!busyAction || backingUp || maintenanceActive || (!status.localBind.applied && status.localBind.remoteConnections !== 0)"
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
        :disabled="!!busyAction || backingUp || maintenanceActive || !status.backup.healthy"
        @action="backupDatabase"
      >
        导出当前 OMS 数据库的完整结构与数据（含触发器、事件、存储过程），生成带签名、摘要和可信备份时间点的 <code>.hbomsbak</code> 灾备包。服务器仅保留生成期间的临时文件。
      </OpsCard>

      <el-card shadow="never" class="ops-card restore-card">
        <div class="ops-card__header">
          <div class="ops-card__heading">
            <span class="ops-card__number">7</span>
            <span class="ops-card__title">上传备份并灾备还原</span>
          </div>
          <el-tag
            size="small"
            :type="restoreJob?.status === 'succeeded' ? 'success' : restoreJob?.status === 'critical' ? 'danger' : restoreActive ? 'warning' : 'info'"
            effect="light"
          >{{ restoreStatusLabel }}</el-tag>
        </div>
        <div class="ops-card__desc">
          仅用于系统迁移或数据库不可逆损坏等极端情景。上传后先校验签名、摘要、目标库、SQL 完整性和备份时间点；正式还原前会再自动备份当前数据库，失败时自动回滚。
        </div>

        <template v-if="restoreJob">
          <div class="restore-progress__time">目标备份时间点：<strong>{{ restoreJob.backupTime }}</strong></div>
          <el-progress
            :percentage="restoreJob.progress"
            :status="restoreJob.status === 'succeeded' ? 'success' : ['failed', 'critical'].includes(restoreJob.status) ? 'exception' : undefined"
          />
          <div class="restore-progress__message">{{ restoreJob.message }}</div>
          <div class="restore-progress__updated">最后更新：{{ restoreJob.updatedAt }}</div>
        </template>
        <template v-else-if="restoreInspection">
          <div class="restore-file">
            <div><strong>{{ restoreInspection.filename }}</strong></div>
            <div>目标库：{{ restoreInspection.databaseName }} · {{ formatFileSize(restoreInspection.fileSize) }}</div>
            <div>校验方式：{{ restoreInspection.signatureVerified ? '签名与 SHA-256 摘要已验证' : '旧版备份严格交叉校验' }}</div>
            <div class="restore-file__time">备份时间点：<strong>{{ restoreInspection.backupTime }}</strong></div>
            <div v-for="warning in restoreInspection.warnings" :key="warning" class="restore-file__warning">{{ warning }}</div>
          </div>
        </template>
        <template v-else>
          <div class="ops-card__summary">尚未选择灾备文件</div>
          <ul class="ops-card__details">
            <li>优先使用本系统生成的 .hbomsbak 签名备份包</li>
            <li>兼容旧版 .sql.gz，但须通过文件名、目标库和转储完成时间交叉校验</li>
          </ul>
        </template>

        <div class="ops-card__actions restore-actions">
          <input
            ref="restoreFileInput"
            class="restore-file-input"
            type="file"
            accept=".hbomsbak,.sql.gz,application/gzip,application/octet-stream"
            @change="onRestoreFileChange"
          />
          <el-button
            size="small"
            :loading="restoreInspecting"
            :disabled="!status?.supported || maintenanceActive || restoreStarting || backingUp || !!busyAction"
            @click="chooseRestoreFile"
          >{{ restoreInspection ? '重新选择并校验' : '选择备份并校验' }}</el-button>
          <el-button
            v-if="restoreInspection"
            size="small"
            type="danger"
            :disabled="restoreInspecting || restoreStarting"
            @click="restoreConfirmVisible = true"
          >进入还原确认</el-button>
        </div>
      </el-card>
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

    <el-dialog
      v-model="upgradeConfirmVisible"
      title="数据库受控升级最终确认"
      width="560px"
      :close-on-press-escape="!upgradeStarting"
      :show-close="!upgradeStarting"
      @closed="upgradeConfirmText = ''"
    >
      <template v-if="status">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          title="升级期间系统将暂停业务访问"
          description="系统会先执行兼容性检查和完整签名备份，再刷新软件源并锁定目标版本；MySQL 软件包升级会自动重启数据库。"
        />
        <div class="restore-confirm">
          <div>升级安装包：<strong>{{ status.upgrade.packageName }}</strong></div>
          <div class="upgrade-confirm__versions">
            当前版本：<strong>{{ status.upgrade.installedVersion }}</strong>
            <span>→</span>
            目标版本：<strong>{{ status.upgrade.candidateVersion }}</strong>
          </div>
          <p>只允许当前 {{ status.upgrade.currentSeries }} 系列内升级。安装开始后不会尝试不受支持的软件包降级；此后任何异常都会保持维护模式并要求服务器运维核验。</p>
          <label for="upgrade-confirm-input">再次输入“升级数据库”确认：</label>
          <el-input
            id="upgrade-confirm-input"
            v-model="upgradeConfirmText"
            maxlength="16"
            autocomplete="off"
            placeholder="请输入：升级数据库"
            @keyup.enter="startUpgrade"
          />
        </div>
      </template>
      <template #footer>
        <el-button :disabled="upgradeStarting" @click="upgradeConfirmVisible = false">取消</el-button>
        <el-button
          type="warning"
          :loading="upgradeStarting"
          :disabled="upgradeConfirmText !== '升级数据库'"
          @click="startUpgrade"
        >确认备份并开始升级</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="restoreConfirmVisible"
      title="数据库灾备还原最终确认"
      width="560px"
      :close-on-press-escape="!restoreStarting"
      :show-close="!restoreStarting"
      @closed="restoreConfirmText = ''"
    >
      <template v-if="restoreInspection">
        <el-alert
          type="error"
          :closable="false"
          show-icon
          title="该操作会覆盖当前生产数据库"
          description="系统将先自动备份当前数据库，再进入维护模式执行还原；若还原或就绪检查失败，将自动恢复操作前数据库。"
        />
        <div class="restore-confirm">
          <div>即将还原文件：<strong>{{ restoreInspection.filename }}</strong></div>
          <div class="restore-confirm__time">
            即将还原到备份时间点：<strong>{{ restoreInspection.backupTime }}</strong>
          </div>
          <p>此时间点之后录入或变更的生产数据将被覆盖。请确认已通知所有用户停止操作，并已安排明确维护窗口。</p>
          <label for="restore-confirm-input">再次输入“还原数据库”确认：</label>
          <el-input
            id="restore-confirm-input"
            v-model="restoreConfirmText"
            maxlength="16"
            autocomplete="off"
            placeholder="请输入：还原数据库"
            @keyup.enter="startRestore"
          />
        </div>
      </template>
      <template #footer>
        <el-button :disabled="restoreStarting" @click="restoreConfirmVisible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="restoreStarting"
          :disabled="restoreConfirmText !== '还原数据库'"
          @click="startRestore"
        >确认覆盖并开始还原</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElButton, ElCard, ElMessage, ElMessageBox, ElTag } from 'element-plus';
import {
  applyDatabaseOps,
  downloadDatabaseBackup,
  getDatabaseUpgradeStatus,
  getDatabaseRestoreStatus,
  getDatabaseOpsStatus,
  inspectDatabaseRestore,
  refreshDatabaseUpgradeInfo,
  startDatabaseUpgrade,
  startDatabaseRestore,
  type DatabaseOpsAction,
  type DatabaseOpsItemStatus,
  type DatabaseOpsStatus,
  type DatabaseUpgradeJobStatus,
  type DatabaseRestoreInspection,
  type DatabaseRestoreJobStatus,
} from '@/api/system';

const props = defineProps<{ active: boolean }>();
const status = ref<DatabaseOpsStatus | null>(null);
const loading = ref(false);
const busyAction = ref<DatabaseOpsAction | ''>('');
const backingUp = ref(false);
const loaded = ref(false);
const restoreInspecting = ref(false);
const restoreStarting = ref(false);
const restoreInspection = ref<DatabaseRestoreInspection | null>(null);
const restoreJob = ref<DatabaseRestoreJobStatus | null>(null);
const restoreConfirmVisible = ref(false);
const restoreConfirmText = ref('');
const restoreFileInput = ref<HTMLInputElement>();
const checkingUpgrade = ref(false);
const upgradeStarting = ref(false);
const upgradeJob = ref<DatabaseUpgradeJobStatus | null>(null);
const upgradeConfirmVisible = ref(false);
const upgradeConfirmText = ref('');
let restorePollTimer: number | undefined;
let upgradePollTimer: number | undefined;
const RESTORE_SESSION_KEY = 'hb_oms_database_restore_job';
const UPGRADE_SESSION_KEY = 'hb_oms_database_upgrade_job';
const canPickFile = computed(() =>
  window.isSecureContext && typeof (window as any).showSaveFilePicker === 'function',
);
const restoreActive = computed(() => !!restoreJob.value && ['queued', 'running'].includes(restoreJob.value.status));
const upgradeActive = computed(() => !!upgradeJob.value && ['queued', 'running'].includes(upgradeJob.value.status));
const maintenanceActive = computed(() => restoreActive.value || upgradeActive.value);
const upgradeStatusLabel = computed(() => {
  if (upgradeJob.value) {
    const names: Record<string, string> = {
      queued: '等待执行', running: '升级中', succeeded: '升级完成', failed: '升级未完成', critical: '需人工处理',
    };
    return names[upgradeJob.value.status] || '状态未知';
  }
  if (!status.value?.upgrade.supported) return '不可用';
  if (status.value.upgrade.canUpgrade) return '有可用更新';
  if (status.value.upgrade.updateAvailable && !status.value.upgrade.sameSeries) return '跨系列已阻止';
  return status.value.updatePolicy.healthy ? '正常' : '未应用';
});
const upgradeStatusType = computed(() => {
  if (upgradeJob.value?.status === 'critical') return 'danger';
  if (upgradeJob.value?.status === 'succeeded') return 'success';
  if (upgradeJob.value && ['queued', 'running'].includes(upgradeJob.value.status)) return 'warning';
  if (upgradeJob.value?.status === 'failed') return 'danger';
  if (status.value?.upgrade.updateAvailable) return 'warning';
  return status.value?.updatePolicy.healthy ? 'success' : 'info';
});
const restoreStatusLabel = computed(() => {
  const statusName: Record<string, string> = {
    queued: '等待执行', running: '还原中', succeeded: '已完成', failed: '已回滚', critical: '需人工处理',
  };
  return restoreJob.value ? statusName[restoreJob.value.status] || '状态未知' : restoreInspection.value ? '已校验' : '未选择';
});

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

async function checkUpgrade() {
  if (!status.value || checkingUpgrade.value) return;
  checkingUpgrade.value = true;
  try {
    status.value.upgrade = await refreshDatabaseUpgradeInfo();
    ElMessage.success(status.value.upgrade.canUpgrade
      ? `检测到可安全升级版本：${status.value.upgrade.candidateVersion}`
      : status.value.upgrade.reason);
  } catch (error: any) {
    ElMessage.error(error?.message || '检查数据库可用版本失败');
  } finally {
    checkingUpgrade.value = false;
  }
}

async function showCurrentUpgradeInfo() {
  if (upgradeActive.value) return;
  upgradeJob.value = null;
  await loadStatus();
}

function saveUpgradeSession(jobId: string, upgradeToken: string) {
  sessionStorage.setItem(UPGRADE_SESSION_KEY, JSON.stringify({ jobId, upgradeToken }));
}

function clearUpgradePoll() {
  if (upgradePollTimer) window.clearTimeout(upgradePollTimer);
  upgradePollTimer = undefined;
}

async function pollUpgradeStatus(jobId: string, upgradeToken: string) {
  clearUpgradePoll();
  try {
    const state = await getDatabaseUpgradeStatus(jobId, upgradeToken);
    upgradeJob.value = state;
    if (['succeeded', 'failed', 'critical'].includes(state.status)) {
      sessionStorage.removeItem(UPGRADE_SESSION_KEY);
      if (state.status === 'succeeded') ElMessage.success('数据库升级完成，系统已恢复业务访问');
      else if (state.status === 'failed') ElMessage.error('数据库升级未完成，数据库仍健康并已恢复业务访问');
      else ElMessage.error('数据库升级后未恢复，系统保持维护模式，请立即联系服务器运维人员');
      if (state.status !== 'critical') window.setTimeout(() => void loadStatus(), 1_500);
      return;
    }
  } catch {
    // MySQL 重启或应用连接池恢复期间短暂不可用属于预期，保留当前进度继续轮询。
  }
  upgradePollTimer = window.setTimeout(() => void pollUpgradeStatus(jobId, upgradeToken), 2_000);
}

async function startUpgrade() {
  if (!status.value || upgradeConfirmText.value !== '升级数据库' || upgradeStarting.value) return;
  const targetVersion = status.value.upgrade.candidateVersion;
  upgradeStarting.value = true;
  try {
    const result = await startDatabaseUpgrade(targetVersion, upgradeConfirmText.value);
    saveUpgradeSession(result.jobId, result.upgradeToken);
    upgradeConfirmVisible.value = false;
    upgradeConfirmText.value = '';
    upgradeJob.value = {
      jobId: result.jobId,
      status: 'queued',
      stage: 'queued',
      message: '数据库升级任务已进入安全执行队列',
      progress: 2,
      packageName: result.packageName,
      fromVersion: result.fromVersion,
      targetVersion: result.targetVersion,
      startedAt: '',
      updatedAt: '',
    };
    ElMessage.warning('系统已进入数据库维护模式，请保持当前页面打开以查看进度');
    void pollUpgradeStatus(result.jobId, result.upgradeToken);
  } catch (error: any) {
    ElMessage.error(error?.message || '数据库升级任务启动失败');
  } finally {
    upgradeStarting.value = false;
  }
}

function resumeUpgradePolling(): boolean {
  try {
    const saved = JSON.parse(sessionStorage.getItem(UPGRADE_SESSION_KEY) || 'null');
    if (saved?.jobId && saved?.upgradeToken) {
      void pollUpgradeStatus(saved.jobId, saved.upgradeToken);
      return true;
    }
  } catch {
    sessionStorage.removeItem(UPGRADE_SESSION_KEY);
  }
  return false;
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
        suggestedName: `haibao_oms_full_${Date.now()}.hbomsbak`,
        types: [{
          description: 'OMS 签名完整数据库备份包',
          accept: { 'application/octet-stream': ['.hbomsbak'] },
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

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MiB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function chooseRestoreFile() {
  restoreFileInput.value?.click();
}

async function onRestoreFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (restoreJob.value && !['queued', 'running'].includes(restoreJob.value.status)) restoreJob.value = null;
  restoreInspecting.value = true;
  restoreInspection.value = null;
  try {
    restoreInspection.value = await inspectDatabaseRestore(file);
    ElMessage.success(`备份已通过预检，时间点：${restoreInspection.value.backupTime}`);
  } catch (error: any) {
    ElMessage.error(error?.message || '备份文件预检失败');
  } finally {
    restoreInspecting.value = false;
  }
}

function saveRestoreSession(jobId: string, restoreToken: string) {
  sessionStorage.setItem(RESTORE_SESSION_KEY, JSON.stringify({ jobId, restoreToken }));
}

function clearRestorePoll() {
  if (restorePollTimer) window.clearTimeout(restorePollTimer);
  restorePollTimer = undefined;
}

async function pollRestoreStatus(jobId: string, restoreToken: string) {
  clearRestorePoll();
  try {
    const state = await getDatabaseRestoreStatus(jobId, restoreToken);
    restoreJob.value = state;
    if (['succeeded', 'failed', 'critical'].includes(state.status)) {
      sessionStorage.removeItem(RESTORE_SESSION_KEY);
      if (state.status === 'succeeded') ElMessage.success('数据库灾备还原已完成，系统已恢复业务访问');
      else if (state.status === 'failed') ElMessage.error('数据库还原未完成，系统已自动恢复操作前数据库');
      else ElMessage.error('数据库还原及自动回滚均未完成，请立即联系运维人员');
      return;
    }
  } catch {
    // PM2 重启或数据库切换期间短暂无法读取状态属于预期，保持当前进度继续重试。
  }
  restorePollTimer = window.setTimeout(() => void pollRestoreStatus(jobId, restoreToken), 2_000);
}

async function startRestore() {
  if (!restoreInspection.value || restoreConfirmText.value !== '还原数据库' || restoreStarting.value) return;
  restoreStarting.value = true;
  try {
    const result = await startDatabaseRestore(restoreInspection.value.uploadId, restoreConfirmText.value);
    saveRestoreSession(result.jobId, result.restoreToken);
    restoreConfirmVisible.value = false;
    restoreConfirmText.value = '';
    restoreInspection.value = null;
    restoreJob.value = {
      jobId: result.jobId,
      status: 'queued',
      stage: 'queued',
      message: '还原任务已进入安全执行队列',
      progress: 2,
      backupTime: result.backupTime,
      backupFormat: result.backupFormat,
      originalFilename: result.originalFilename,
      startedAt: '',
      updatedAt: '',
    };
    ElMessage.warning('系统已进入数据库维护模式，请勿关闭当前页面');
    void pollRestoreStatus(result.jobId, result.restoreToken);
  } catch (error: any) {
    ElMessage.error(error?.message || '数据库还原任务启动失败');
  } finally {
    restoreStarting.value = false;
  }
}

function resumeRestorePolling(): boolean {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RESTORE_SESSION_KEY) || 'null');
    if (saved?.jobId && saved?.restoreToken) {
      void pollRestoreStatus(saved.jobId, saved.restoreToken);
      return true;
    }
  } catch {
    sessionStorage.removeItem(RESTORE_SESSION_KEY);
  }
  return false;
}

watch(() => props.active, (active) => {
  if (active && !loaded.value) void loadStatus();
});
onMounted(() => {
  const upgrading = resumeUpgradePolling();
  const restoring = upgrading ? false : resumeRestorePolling();
  if (props.active && !upgrading && !restoring) void loadStatus();
});
onBeforeUnmount(() => {
  clearRestorePoll();
  clearUpgradePoll();
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
.upgrade-card { grid-column: 1 / -1; border-color: var(--el-color-warning-light-5); }
.database-ops :deep(.upgrade-card .ops-card__desc) { min-height: auto; }
.upgrade-versions {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 20px;
  margin: 2px 0 10px; padding: 10px 12px; border-radius: 4px; background: var(--el-fill-color-light);
  font-size: 12px;
}
.upgrade-versions div { display: flex; justify-content: space-between; gap: 12px; min-width: 0; }
.upgrade-versions span { color: var(--el-text-color-secondary); }
.upgrade-versions strong { color: var(--el-text-color-primary); text-align: right; overflow-wrap: anywhere; }
.upgrade-version-line { margin: 4px 0 8px; color: var(--el-text-color-regular); font-size: 12px; }
.upgrade-version-line span { margin: 0 8px; color: var(--el-text-color-secondary); }
.upgrade-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.upgrade-backup { margin-top: 4px; color: var(--el-text-color-secondary); font-size: 11px; overflow-wrap: anywhere; }
.upgrade-confirm__versions { margin-top: 8px; color: var(--el-color-warning-dark-2); font-size: 14px; }
.upgrade-confirm__versions span { margin: 0 8px; }
.save-hint { margin-top: 14px; }
.restore-card { border-color: var(--el-color-danger-light-5); }
.database-ops :deep(.restore-card .ops-card__desc) { min-height: auto; }
.restore-file {
  margin: 4px 0 14px; padding: 10px 12px; border-radius: 4px;
  background: var(--el-fill-color-light); color: var(--el-text-color-regular);
  font-size: 12px; line-height: 1.8;
}
.restore-file__time, .restore-progress__time, .restore-confirm__time { color: var(--el-color-danger); }
.restore-file__warning { color: var(--el-color-warning-dark-2); }
.restore-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.restore-file-input { display: none; }
.restore-progress__time { margin: 6px 0 8px; font-size: 12px; }
.restore-progress__message { margin-top: 7px; color: var(--el-text-color-regular); font-size: 12px; line-height: 1.6; }
.restore-progress__updated { margin: 3px 0 12px; color: var(--el-text-color-secondary); font-size: 11px; }
.restore-confirm { padding-top: 14px; font-size: 13px; line-height: 1.8; }
.restore-confirm__time { margin-top: 8px; font-size: 14px; }
.restore-confirm p { margin: 10px 0; color: var(--el-text-color-regular); }
.restore-confirm label { display: block; margin-bottom: 4px; font-weight: 600; }
@media (max-width: 900px) {
  .ops-grid { grid-template-columns: 1fr; }
  .upgrade-card { grid-column: auto; }
  .upgrade-versions { grid-template-columns: 1fr; }
  .ops-platform { display: block; margin: 4px 0 0; }
}
</style>
