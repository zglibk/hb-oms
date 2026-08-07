<!--
  首页看板（销售视角，设计文档 §5.2）。

  汇总卡：进行中订单数 / 总生产欠数 / 总发货欠数 / 逾期订单数
  列表区：逾期未发货 TOP、临近交期 7 天内、外发超期未回齐

  按设计文档明确**不做 ECharts 大屏**，普通管理页即可。
  数据全部来自 GET /dashboard/summary（登录即可访问，不挂权限点），
  但列表的「跳转」入口按权限显隐——没有台账/外发权限的用户点过去只会撞守卫。
-->
<template>
  <div class="page" v-loading="loading">
    <el-card shadow="never" class="welcome-card">
      <div class="welcome__text">
        <h2>{{ greeting }}，{{ userStore.userInfo?.realName || userStore.userInfo?.username }}</h2>
        <p>
          业务主线：录订单 → 部件外发（可选）→ 回货 → 装配 → 成品入库 → 成品出库；
          下方为<b>进行中订单</b>的交付情况，明细见订单跟踪台账。
        </p>
      </div>
    </el-card>

    <div class="sum-bar">
      <app-stat-card color="blue" :value="cards.activeOrders" label="进行中订单" :link-text="canLedger ? '台账>' : ''" @link="go('/ledger')">
        <template #icon><el-icon><Tickets /></el-icon></template>
      </app-stat-card>
      <app-stat-card color="amber" :value="cards.productionOwed" label="总生产欠数(支)" :link-text="canLedger ? '台账>' : ''" @link="go('/ledger')">
        <template #icon><el-icon><Tools /></el-icon></template>
      </app-stat-card>
      <app-stat-card color="red" :value="cards.deliveryOwed" label="总发货欠数(支)" :link-text="canLedger ? '台账>' : ''" @link="go('/ledger')">
        <template #icon><el-icon><Van /></el-icon></template>
      </app-stat-card>
      <app-stat-card color="slate" :value="cards.overdueOrders" label="逾期订单" :link-text="canLedger ? '台账>' : ''" @link="go('/ledger')">
        <template #icon><el-icon><Warning /></el-icon></template>
      </app-stat-card>
    </div>

    <el-row :gutter="16" class="list-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="list-card">
          <template #header>
            <div class="list-card__head">
              <span class="list-card__title">
                <el-icon class="is-danger"><Warning /></el-icon> 逾期未发货
              </span>
              <el-button v-if="canLedger" link type="primary" @click="go('/ledger')">查看台账</el-button>
            </div>
          </template>
          <el-table :data="summary.overdueOrders" size="small" :show-header="true" empty-text="暂无逾期，交付良好">
            <el-table-column label="客户" prop="customerName" min-width="100" show-overflow-tooltip />
            <el-table-column label="订单编号" min-width="105" show-overflow-tooltip>
              <template #default="{ row }">{{ row.productionNo || row.orderNo || '—' }}</template>
            </el-table-column>
            <el-table-column label="产品型号" prop="productModel" min-width="120" show-overflow-tooltip />
            <el-table-column label="交期" width="95" align="center">
              <template #default="{ row }"><span class="num-overdue">{{ row.deliveryDate || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="逾期" width="70" align="center">
              <template #default="{ row }"><el-tag size="small" type="danger">{{ row.days }} 天</el-tag></template>
            </el-table-column>
            <el-table-column label="欠数" width="70" align="center">
              <template #default="{ row }"><span class="num-owed">{{ row.deliveryOwed }}</span></template>
            </el-table-column>
          </el-table>
          <div v-if="summary.overdueOrders.length >= summary.topLimit" class="list-card__more">
            仅显示逾期最久的前 {{ summary.topLimit }} 条，完整清单见台账「只看逾期」
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="list-card">
          <template #header>
            <div class="list-card__head">
              <span class="list-card__title">
                <el-icon class="is-warning"><Clock /></el-icon> 临近交期（{{ summary.upcomingDays }} 天内）
              </span>
              <el-button v-if="canLedger" link type="primary" @click="go('/ledger')">查看台账</el-button>
            </div>
          </template>
          <el-table :data="summary.upcomingOrders" size="small" empty-text="近期无到期订单">
            <el-table-column label="客户" prop="customerName" min-width="100" show-overflow-tooltip />
            <el-table-column label="订单编号" min-width="105" show-overflow-tooltip>
              <template #default="{ row }">{{ row.productionNo || row.orderNo || '—' }}</template>
            </el-table-column>
            <el-table-column label="产品型号" prop="productModel" min-width="120" show-overflow-tooltip />
            <el-table-column label="交期" width="95" align="center">
              <template #default="{ row }">{{ row.deliveryDate || '—' }}</template>
            </el-table-column>
            <el-table-column label="剩余" width="70" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.days <= 2 ? 'danger' : 'warning'">
                  {{ row.days === 0 ? '今天' : `${row.days} 天` }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="欠数" width="70" align="center">
              <template #default="{ row }"><span class="num-owed">{{ row.deliveryOwed }}</span></template>
            </el-table-column>
          </el-table>
          <div v-if="summary.upcomingOrders.length >= summary.topLimit" class="list-card__more">
            仅显示最先到期的前 {{ summary.topLimit }} 条
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="list-card">
      <template #header>
        <div class="list-card__head">
          <span class="list-card__title">
            <el-icon class="is-danger"><Van /></el-icon> 外发超期未回齐
          </span>
          <el-button v-if="canOutsource" link type="primary" @click="go('/outsource')">查看外发</el-button>
        </div>
      </template>
      <el-table :data="summary.overdueOutsource" size="small" empty-text="无超期外发单">
        <el-table-column label="发坯单号" width="120">
          <template #default="{ row }">{{ formatBlankNo(row.blankNo) || '—' }}</template>
        </el-table-column>
        <el-table-column label="加工商" prop="processorName" min-width="120" show-overflow-tooltip />
        <el-table-column label="表面处理" width="100" align="center">
          <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
        </el-table-column>
        <el-table-column label="颜色" width="80" align="center">
          <template #default="{ row }">{{ row.color || '—' }}</template>
        </el-table-column>
        <el-table-column label="要求回货" width="100" align="center">
          <template #default="{ row }"><span class="num-overdue">{{ row.requireBackDate || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="超期" width="70" align="center">
          <template #default="{ row }"><el-tag size="small" type="danger">{{ row.days }} 天</el-tag></template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="tagTypeOf(OUTSOURCE_STATUS, row.status) as any">
              {{ labelOf(OUTSOURCE_STATUS, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发出" width="70" align="center" prop="sendQty" />
        <el-table-column label="已回" width="70" align="center" prop="returnedQty" />
        <el-table-column label="未回" width="70" align="center">
          <template #default="{ row }"><span class="num-owed">{{ row.pendingQty }}</span></template>
        </el-table-column>
      </el-table>
      <div v-if="summary.overdueOutsource.length >= summary.topLimit" class="list-card__more">
        仅显示超期最久的前 {{ summary.topLimit }} 条
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Tickets, Tools, Van, Warning, Clock } from '@element-plus/icons-vue';
import { getDashboardSummary, type DashboardSummary } from '@/api/dashboard';
import { useUserStore } from '@/stores/user';
import { loadDict } from '@/composables/useDict';
import { OUTSOURCE_STATUS, formatBlankNo, labelOf, tagTypeOf } from '@/constants/dict';
import AppStatCard from '@/components/AppStatCard.vue';

const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);

const summary = ref<DashboardSummary>({
  cards: { activeOrders: 0, productionOwed: 0, deliveryOwed: 0, overdueOrders: 0 },
  overdueOrders: [],
  upcomingOrders: [],
  overdueOutsource: [],
  topLimit: 10,
  upcomingDays: 7,
});
const cards = computed(() => summary.value.cards);

const canLedger = computed(() => userStore.hasPermission('ledger'));
const canOutsource = computed(() => userStore.hasPermission('outsource'));

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

async function load() {
  loading.value = true;
  try {
    summary.value = await getDashboardSummary();
  } finally {
    loading.value = false;
  }
}
load();
// KeepAlive 下 onActivated 在**首次挂载时也会触发**，与上面的 load() 撞成两次请求；
// 首次跳过，之后每次从别的页签切回来才刷新（看板是 4 条聚合查询，值得省这一次）。
let activatedOnce = false;
onActivated(() => {
  if (activatedOnce) load();
  else activatedOnce = true;
});

function go(path: string) {
  router.push(path);
}
function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null): string {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}
</script>

<script lang="ts">
export default { name: 'HomeDashboard' };
</script>

<style scoped lang="scss">
.welcome-card {
  margin-bottom: 12px;
  .welcome__text {
    h2 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0; color: var(--el-text-color-secondary); line-height: 1.8; }
  }
}
.sum-bar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 4px 0 16px;
}
.list-row { margin-bottom: 0; }
.list-card {
  margin-bottom: 16px;
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    .is-danger { color: var(--el-color-danger); }
    .is-warning { color: var(--el-color-warning); }
  }
  &__more {
    margin-top: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-align: right;
  }
}
.num-owed { color: var(--el-color-warning); font-weight: 600; }
.num-overdue { color: var(--el-color-danger); font-weight: 600; }
</style>
