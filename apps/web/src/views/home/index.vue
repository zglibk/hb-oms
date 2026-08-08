<!--
  首页看板（销售视角，设计文档 §5.2）。

  汇总卡：进行中订单数 / 总生产欠数 / 总发货欠数 / 逾期订单数
  列表区：左卡「逾期未发货 / 临近交期」页签切换，右卡「外发超期未回齐」

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
      <!-- 左：逾期未发货 / 临近交期 合并成一张页签卡。
           两者都是「交期视角的待办」，并排两张卡既占地方又要来回扫；
           页签标签带**总条数**角标，不切过去也知道那边有没有事。 -->
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="list-card" :class="{ 'is-empty': !owedRows.length }">
          <template #header>
            <div class="list-card__head">
              <el-tabs v-model="owedTab" class="lc-tabs">
                <el-tab-pane name="overdue">
                  <template #label>
                    <span class="lc-tab">
                      <el-icon :class="counts.overdueOrders ? 'is-danger' : 'is-muted'"><Warning /></el-icon>
                      逾期未发货
                      <el-tag
                        size="small" round effect="plain"
                        :type="counts.overdueOrders ? 'danger' : 'info'"
                      >{{ counts.overdueOrders }}</el-tag>
                    </span>
                  </template>
                </el-tab-pane>
                <el-tab-pane name="upcoming">
                  <template #label>
                    <span class="lc-tab">
                      <el-icon :class="counts.upcomingOrders ? 'is-warning' : 'is-muted'"><Clock /></el-icon>
                      临近交期（{{ summary.upcomingDays }} 天）
                      <el-tag
                        size="small" round effect="plain"
                        :type="counts.upcomingOrders ? 'warning' : 'info'"
                      >{{ counts.upcomingOrders }}</el-tag>
                    </span>
                  </template>
                </el-tab-pane>
              </el-tabs>
              <el-button v-if="canLedger" link type="primary" @click="go('/ledger')">查看台账</el-button>
            </div>
          </template>

          <!-- 空态收成一条横幅，不再撑出一张只有表头的空表 -->
          <div v-if="!owedRows.length" class="list-empty">
            <el-icon><CircleCheck v-if="isOverdueTab" /><Clock v-else /></el-icon>
            <span>{{ isOverdueTab ? '暂无逾期，交付良好' : `未来 ${summary.upcomingDays} 天内没有到期且欠货的订单` }}</span>
          </div>
          <template v-else>
            <el-table :data="owedRows" size="small">
              <el-table-column label="客户" prop="customerName" min-width="100" show-overflow-tooltip />
              <el-table-column label="订单编号" min-width="105" show-overflow-tooltip>
                <template #default="{ row }">{{ row.productionNo || row.orderNo || '—' }}</template>
              </el-table-column>
              <el-table-column label="产品型号" prop="productModel" min-width="120" show-overflow-tooltip />
              <el-table-column label="交期" width="95" align="center">
                <template #default="{ row }">
                  <span :class="{ 'num-overdue': isOverdueTab }">{{ row.deliveryDate || '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="isOverdueTab ? '逾期' : '剩余'" width="70" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="isOverdueTab || row.days <= 2 ? 'danger' : 'warning'">
                    {{ !isOverdueTab && row.days === 0 ? '今天' : `${row.days} 天` }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="欠数" width="70" align="center">
                <template #default="{ row }"><span class="num-owed">{{ row.deliveryOwed }}</span></template>
              </el-table-column>
            </el-table>
            <div v-if="owedTruncated" class="list-card__more">
              共 {{ isOverdueTab ? counts.overdueOrders : counts.upcomingOrders }} 条，仅显示{{
                isOverdueTab ? '逾期最久' : '最先到期'
              }}的前 {{ summary.topLimit }} 条{{ isOverdueTab ? '，完整清单见台账「只看逾期」' : '' }}
            </div>
          </template>
        </el-card>
      </el-col>

      <!-- 右：外发超期未回齐（原来在最下方通栏，移到这里与左卡并排）。
           为压缩宽度去掉「颜色 / 要求回货 / 发出」三列：超期天数已表达了要求回货日期，
           发出量由「已回 + 未回」可推。**接口返回不变**，日后要加回来只是模板的事。 -->
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="list-card" :class="{ 'is-empty': !hasOutsource }">
          <template #header>
            <div class="list-card__head">
              <span class="list-card__title">
                <el-icon :class="hasOutsource ? 'is-danger' : 'is-muted'"><Van /></el-icon>
                外发超期未回齐
                <el-tag
                  size="small" round effect="plain"
                  :type="counts.overdueOutsource ? 'danger' : 'info'"
                >{{ counts.overdueOutsource }}</el-tag>
              </span>
              <el-button v-if="canOutsource" link type="primary" @click="go('/outsource')">查看外发</el-button>
            </div>
          </template>
          <div v-if="!hasOutsource" class="list-empty">
            <el-icon><CircleCheck /></el-icon>
            <span>无超期外发单，加工厂回货正常</span>
          </div>
          <template v-else>
            <el-table :data="summary.overdueOutsource" size="small">
              <el-table-column label="发坯单号" width="112">
                <template #default="{ row }">{{ formatBlankNo(row.blankNo) || '—' }}</template>
              </el-table-column>
              <el-table-column label="加工商" prop="processorName" min-width="110" show-overflow-tooltip />
              <el-table-column label="表面处理" width="90" align="center">
                <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
              </el-table-column>
              <el-table-column label="超期" width="70" align="center">
                <template #default="{ row }"><el-tag size="small" type="danger">{{ row.days }} 天</el-tag></template>
              </el-table-column>
              <el-table-column label="状态" width="86" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="tagTypeOf(OUTSOURCE_STATUS, row.status) as any">
                    {{ labelOf(OUTSOURCE_STATUS, row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="已回" width="64" align="center" prop="returnedQty" />
              <el-table-column label="未回" width="64" align="center">
                <template #default="{ row }"><span class="num-owed">{{ row.pendingQty }}</span></template>
              </el-table-column>
            </el-table>
            <div v-if="summary.overdueOutsource.length >= summary.topLimit" class="list-card__more">
              共 {{ counts.overdueOutsource }} 条，仅显示超期最久的前 {{ summary.topLimit }} 条
            </div>
          </template>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Tickets, Tools, Van, Warning, Clock, CircleCheck } from '@element-plus/icons-vue';
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
  counts: { overdueOrders: 0, upcomingOrders: 0, overdueOutsource: 0 },
  topLimit: 10,
  upcomingDays: 7,
});
const cards = computed(() => summary.value.cards);

/**
 * 角标用**服务端返回的总条数**，不是 `list.length`：
 * 列表被 topLimit 截断，25 条只显示 10 条却标 10，用户会以为只有 10 条。
 */
const counts = computed(() => summary.value.counts);

const canLedger = computed(() => userStore.hasPermission('ledger'));
const canOutsource = computed(() => userStore.hasPermission('outsource'));
const hasOutsource = computed(() => summary.value.overdueOutsource.length > 0);

/* ===== 逾期 / 临近交期 页签 ===== */
const owedTab = ref<'overdue' | 'upcoming'>('overdue');
const isOverdueTab = computed(() => owedTab.value === 'overdue');
const owedRows = computed(() =>
  isOverdueTab.value ? summary.value.overdueOrders : summary.value.upcomingOrders,
);
const owedTruncated = computed(() => owedRows.value.length >= summary.value.topLimit);

/** 没有逾期、却有临近到期的，默认停在「临近交期」页，省用户一次点击 */
function pickDefaultTab() {
  owedTab.value =
    counts.value.overdueOrders === 0 && counts.value.upcomingOrders > 0 ? 'upcoming' : 'overdue';
}

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
    pickDefaultTab();
  } finally {
    loading.value = false;
  }
}
load();
// KeepAlive 下 onActivated 在**首次挂载时也会触发**，与上面的 load() 撞成两次请求；
// 首次跳过，之后每次从别的页签切回来才刷新（看板是 5 条聚合查询，值得省这一次）。
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

  /* 空态时收紧内边距，卡片不至于为一行提示撑出大片留白 */
  &.is-empty :deep(.el-card__body) {
    padding-top: 8px;
    padding-bottom: 10px;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  &__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    .is-danger { color: var(--el-color-danger); }
    .is-warning { color: var(--el-color-warning); }
    .is-muted { color: var(--el-text-color-secondary); }
  }
  &__more {
    margin-top: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-align: right;
  }
}

/* 卡片头里的页签：去掉 el-tabs 自带的下边框与内容区，让它像标题一样贴着卡头 */
.lc-tabs {
  flex: 1;
  min-width: 0;

  :deep(.el-tabs__header) { margin: 0; }
  :deep(.el-tabs__nav-wrap::after) { display: none; }
  :deep(.el-tabs__item) {
    height: 28px;
    line-height: 28px;
    padding: 0 14px;
    font-size: 14px;
    &:first-child { padding-left: 0; }
  }
  /* 表格渲染在卡片 body 里，页签内容区不该占高 */
  :deep(.el-tabs__content) { display: none; }
}
.lc-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  .is-danger { color: var(--el-color-danger); }
  .is-warning { color: var(--el-color-warning); }
  .is-muted { color: var(--el-text-color-secondary); }
}

/* 空列表横幅：一行图标 + 文案，替代只有表头的空表格 */
.list-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 13px;
  .el-icon { color: var(--el-color-success); }
}

.num-owed { color: var(--el-color-warning); font-weight: 600; }
.num-overdue { color: var(--el-color-danger); font-weight: 600; }
</style>
