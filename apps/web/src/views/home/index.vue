<template>
  <div class="page">
    <el-card shadow="never" class="welcome-card">
      <div class="welcome">
        <div class="welcome__text">
          <h2>{{ greeting }}，{{ userStore.userInfo?.realName || userStore.userInfo?.username }}</h2>
          <p>
            欢迎使用海宝五金订单跟踪系统。业务主线：录订单 → 部件外发（可选）→ 回货 →
            成品入库 → 成品出库；订单跟踪台账随时呈现每张订单的
            <b>订单数 / 完成数 / 库存数 / 欠数</b>。
          </p>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16" class="quick-row">
      <el-col v-for="card in visibleCards" :key="card.path" :xs="24" :sm="12" :md="8" :lg="6">
        <el-card shadow="hover" class="quick-card" @click="router.push(card.path)">
          <div class="quick-card__body">
            <el-icon class="quick-card__icon" :size="28"><component :is="card.icon" /></el-icon>
            <div>
              <div class="quick-card__title">{{ card.title }}</div>
              <div class="quick-card__desc">{{ card.desc }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="notice-card">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="系统建设进行中"
        description="当前已开放基础数据（客户资料 / 工艺信息 / 物料）与系统管理；订单管理、外发管理、成品出入库与订单跟踪台账将按里程碑陆续上线，本页届时升级为销售看板。"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { OfficeBuilding, Setting, Grid, User } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const userStore = useUserStore();

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const CARDS = [
  { path: '/basic/customer', perm: 'basic:customer', icon: OfficeBuilding, title: '客户资料', desc: '客户档案维护，支持 Excel 批量导入' },
  { path: '/basic/process-info', perm: 'basic:process-info', icon: Setting, title: '工艺信息', desc: '按生产图号维护，录订单自动带入' },
  { path: '/basic/material', perm: 'basic:material', icon: Grid, title: '物料管理', desc: '产品主数据，订单选料快照带出' },
  { path: '/system/user', perm: 'system:user', icon: User, title: '用户管理', desc: '账号、角色与权限分配' },
];

const visibleCards = computed(() => CARDS.filter((c) => userStore.hasPermission(c.perm)));
</script>

<style scoped lang="scss">
.welcome-card {
  margin-bottom: 16px;
  .welcome__text {
    h2 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0; color: var(--el-text-color-secondary); line-height: 1.8; }
  }
}
.quick-row { margin-bottom: 4px; }
.quick-card {
  cursor: pointer;
  margin-bottom: 12px;
  .quick-card__body { display: flex; align-items: center; gap: 14px; }
  .quick-card__icon { color: var(--el-color-primary); flex: none; }
  .quick-card__title { font-weight: 600; margin-bottom: 4px; }
  .quick-card__desc { font-size: 12px; color: var(--el-text-color-secondary); }
}
.notice-card { margin-top: 4px; }
</style>
