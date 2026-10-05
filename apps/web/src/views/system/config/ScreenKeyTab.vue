<!--
  系统配置 →「数据大屏」页签：车间电视免登录访问码的生成 / 重置 / 关闭。
  访问码库里只存 SHA-256 摘要，完整电视地址**只在生成当次显示**，之后谁也看不到——丢了就重置。
-->
<template>
  <div v-loading="loading" class="screen-key">
    <el-card shadow="never" class="cfg-section">
      <div class="section-title">车间电视免登录访问</div>
      <p class="section-desc">
        后台用户点顶栏「数据可视化」即可打开大屏（需角色授予「查看数据大屏」权限）。
        车间电视不登录账号，改用<strong>访问码</strong>：生成后把下面的地址在电视浏览器里打开一次，之后开机直接显示。<br />
        访问码相当于一把只读钥匙，拿到它的人能看到大屏上的全部数据（含客户名称）。
        <strong>怀疑泄露就点「重置」</strong>，旧地址立即失效，所有电视需要重新打开新地址。
      </p>

      <div class="screen-key__status">
        当前状态：
        <el-tag :type="enabled ? 'success' : 'info'" size="small">{{ enabled ? '已开启' : '未开启' }}</el-tag>
      </div>

      <div v-if="screenUrl" class="screen-key__url">
        <el-alert type="warning" :closable="false" show-icon title="完整地址只显示这一次，请现在复制保存" />
        <el-input :model-value="screenUrl" readonly class="screen-key__input">
          <template #append>
            <el-button @click="copyUrl">复制</el-button>
          </template>
        </el-input>
      </div>

      <div class="screen-key__actions">
        <el-button v-permission="'config:update'" type="primary" size="small" :loading="busy" @click="onRegenerate">
          {{ enabled ? '重置访问码' : '生成访问码' }}
        </el-button>
        <el-button v-permission="'config:update'" size="small" :disabled="!enabled" :loading="busy" @click="onDisable">
          关闭免登录访问
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { disableScreenKey, getScreenKeyStatus, regenerateScreenKey } from '@/api/system';

const loading = ref(false);
const busy = ref(false);
const enabled = ref(false);
const screenUrl = ref('');

async function load() {
  loading.value = true;
  try {
    enabled.value = (await getScreenKeyStatus()).enabled;
  } finally {
    loading.value = false;
  }
}

async function onRegenerate() {
  if (enabled.value) {
    await ElMessageBox.confirm('重置后旧地址立即失效，所有正在显示大屏的电视都要重新打开新地址。确定重置？', '重置访问码', {
      type: 'warning',
      confirmButtonText: '重置',
    });
  }
  busy.value = true;
  try {
    const { key } = await regenerateScreenKey();
    // 访问码放 hash：hash 不随请求发给服务器、不进 Nginx 日志（大屏页读到后会从地址栏抹掉）
    screenUrl.value = `${window.location.origin}${import.meta.env.BASE_URL}screen#key=${encodeURIComponent(key)}`;
    enabled.value = true;
    ElMessage.success('访问码已生成');
  } finally {
    busy.value = false;
  }
}

async function onDisable() {
  await ElMessageBox.confirm('关闭后所有电视上的大屏立即无法加载数据，需要时可重新生成。确定关闭？', '关闭免登录访问', {
    type: 'warning',
    confirmButtonText: '关闭',
  });
  busy.value = true;
  try {
    await disableScreenKey();
    enabled.value = false;
    screenUrl.value = '';
    ElMessage.success('已关闭免登录访问');
  } finally {
    busy.value = false;
  }
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(screenUrl.value);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('浏览器不允许自动复制，请手动选中地址复制');
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.screen-key {
  max-width: 820px;
  padding: 16px 0;
}
/* 版块卡 / 标题 / 说明：与配置页其它页签同一套视觉（父组件样式是 scoped，管不到子组件） */
.cfg-section {
  border-color: var(--el-border-color-lighter);
  :deep(.el-card__body) { padding: 16px 20px; }
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-left: 4px solid var(--el-color-primary);
  padding-left: 10px;
  line-height: 1.3;
  margin: 0 0 8px;
}
.section-desc {
  margin: 0 0 8px;
  padding-left: 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}
.screen-key__status { margin: 12px 0; font-size: 14px; }
.screen-key__url { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.screen-key__actions { margin-top: 8px; }
</style>
