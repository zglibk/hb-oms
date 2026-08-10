<!--
  首页看板（销售视角，设计文档 §5.2）。

  欢迎区：问候 + 日历摘要（公历/农历/年余/下一法定假日）
  汇总卡：进行中订单数 / 总生产欠数 / 总发货欠数 / 逾期订单数
  列表区：左卡「逾期未发货 / 临近交期」页签切换，右卡「外发超期未回齐」

  按设计文档明确**不做 ECharts 大屏**，普通管理页即可。
  数据全部来自 GET /dashboard/summary（权限点 stat:dashboard）。
  **无该权限时不发请求、不弹 403**，欢迎区与日历照常显示，只是四卡与列表留空——
  首页是所有人的落地页，不该因为看不到经营数字就整页报错。
  列表的「跳转」入口另按权限显隐——没有台账/外发权限的用户点过去只会撞守卫。
-->
<template>
  <div class="page" v-loading="loading">
    <el-card shadow="never" class="welcome-card">
      <div class="welcome__text">
        <h2 class="welcome-greet" :class="`is-${greetingTone}`">{{ greeting }}，{{ politeName }}</h2>
        <div class="welcome-cal" aria-label="今日日历">
          <span class="cal-chip cal-chip--solar">
            <svg class="cal-chip__icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.7" />
              <path d="M3 10h18" fill="none" stroke="currentColor" stroke-width="1.7" />
              <path d="M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
              <circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" />
              <circle cx="12" cy="14.5" r="1.1" fill="currentColor" />
              <circle cx="15.5" cy="14.5" r="1.1" fill="currentColor" />
            </svg>
            <el-tag size="small" effect="plain" type="primary" round>公历</el-tag>
            <b>{{ cal.solarText }}</b>
          </span>

          <span class="cal-chip cal-chip--lunar">
            <svg class="cal-chip__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15.2 3.2a8.8 8.8 0 1 0 5.6 15.4A9.2 9.2 0 0 1 15.2 3.2z"
                fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"
              />
              <circle cx="9.2" cy="10.2" r="0.9" fill="currentColor" />
              <circle cx="12.4" cy="13.8" r="0.7" fill="currentColor" />
            </svg>
            <el-tag size="small" effect="plain" round class="cal-tag--lunar">农历</el-tag>
            <b>
              {{ cal.lunarText }}
              <template v-if="cal.nextJieQi">
                <span class="cal-sep">·</span>
                <template v-if="cal.nextJieQi.daysLeft === 0">今天{{ cal.nextJieQi.name }}</template>
                <template v-else>距{{ cal.nextJieQi.name }}还有 <em>{{ cal.nextJieQi.daysLeft }}</em> 天</template>
              </template>
            </b>
          </span>

          <span class="cal-chip cal-chip--holiday">
            <svg class="cal-chip__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3c2.2 2.4 3.4 4.4 3.4 6.2A3.4 3.4 0 1 1 12 5.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
              <path d="M12 3c-2.2 2.4-3.4 4.4-3.4 6.2A3.4 3.4 0 1 0 12 5.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
              <path d="M8.2 14.5c1.2 2.8 2.6 4.6 3.8 6.5 1.2-1.9 2.6-3.7 3.8-6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
              <circle cx="12" cy="9.4" r="1.2" fill="currentColor" />
            </svg>
            <el-tag size="small" effect="plain" type="danger" round>节假</el-tag>
            <b v-if="cal.nextHoliday">
              <template v-if="cal.nextHoliday.daysLeft === 0">今天是{{ cal.nextHoliday.name }}</template>
              <template v-else>距{{ cal.nextHoliday.name }}还有 <em>{{ cal.nextHoliday.daysLeft }}</em> 天</template>
            </b>
            <b v-else>近期暂无法定节假日</b>
          </span>

          <span class="cal-chip cal-chip--year">
            <svg class="cal-chip__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3h10v4.2c0 1.4-.7 2.7-1.9 3.4L12 13l-3.1-2.4A4 4 0 0 1 7 7.2V3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
              <path d="M7 21h10v-4.2c0-1.4-.7-2.7-1.9-3.4L12 11l-3.1 2.4A4 4 0 0 0 7 16.8V21z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
              <path d="M9.5 6.5h5M9.5 17.5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <el-tag size="small" effect="plain" type="warning" round>年余</el-tag>
            <b>{{ cal.year }} 年还剩 <em>{{ cal.yearLeftDays }}</em> 天 <em class="cal-hms">{{ cal.yearLeftHms }}</em></b>
          </span>
        </div>
      </div>
    </el-card>

    <el-alert
      v-if="!canDashboard"
      class="no-stat"
      type="info"
      :closable="false"
      show-icon
      title="您的角色未获授「查看首页看板」权限，经营汇总数据不予显示"
      description="如需查看，请联系系统管理员在「角色管理 → 分配权限」中勾选「统计查看 → 查看首页看板」。"
    />

    <div class="sum-bar" v-if="canDashboard">
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

    <el-row :gutter="16" class="list-row" v-if="canDashboard">
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

      <!-- 右：近期外发回厂。
           2026-08-10 外发取消发坯单、不再登记计划回厂时间后，「超期未回齐」失去判定
           基准（没有计划日、也没有"还在外面没回"的记录），这张卡改为展示最近几条回厂
           流水，位置与布局不变。 -->
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="list-card" :class="{ 'is-empty': !hasOutsource }">
          <template #header>
            <div class="list-card__head">
              <span class="list-card__title">
                <el-icon :class="hasOutsource ? 'is-primary' : 'is-muted'"><Van /></el-icon>
                近期外发回厂
                <el-tag
                  size="small" round effect="plain"
                  :type="counts.recentOutsource ? 'primary' : 'info'"
                >{{ counts.recentOutsource }}</el-tag>
              </span>
              <el-button v-if="canOutsource" link type="primary" @click="go('/outsource')">查看外发</el-button>
            </div>
          </template>
          <div v-if="!hasOutsource" class="list-empty">
            <el-icon><CircleCheck /></el-icon>
            <span>暂无外发回厂记录</span>
          </div>
          <template v-else>
            <el-table :data="summary.recentOutsource" size="small">
              <el-table-column label="回厂日期" width="105">
                <template #default="{ row }">{{ row.backDate || '—' }}</template>
              </el-table-column>
              <el-table-column label="加工商" prop="processorName" min-width="110" show-overflow-tooltip />
              <el-table-column label="产品型号" prop="productModel" min-width="130" show-overflow-tooltip />
              <el-table-column label="表面处理" width="90" align="center">
                <template #default="{ row }">{{ dictLabel(surfaceDict, row.surfaceType) }}</template>
              </el-table-column>
              <el-table-column label="数量(支)" width="86" align="center">
                <template #default="{ row }"><b>{{ row.returnQty }}</b></template>
              </el-table-column>
            </el-table>
            <div v-if="summary.recentOutsource.length >= summary.topLimit" class="list-card__more">
              共 {{ counts.recentOutsource }} 条，仅显示最近 {{ summary.topLimit }} 条
            </div>
          </template>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Tickets, Tools, Van, Warning, Clock, CircleCheck } from '@element-plus/icons-vue';
import { getDashboardSummary, type DashboardSummary } from '@/api/dashboard';
import { useUserStore } from '@/stores/user';
import { loadDict } from '@/composables/useDict';

import { getCalendarBrief } from '@/utils/calendar-info';
import AppStatCard from '@/components/AppStatCard.vue';

const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);

const summary = ref<DashboardSummary>({
  cards: { activeOrders: 0, productionOwed: 0, deliveryOwed: 0, overdueOrders: 0 },
  overdueOrders: [],
  upcomingOrders: [],
  recentOutsource: [],
  counts: { overdueOrders: 0, upcomingOrders: 0, recentOutsource: 0 },
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
/** 看板数据权限：无此权限则整块汇总不请求也不渲染 */
const canDashboard = computed(() => userStore.hasPermission('stat:dashboard'));
const canOutsource = computed(() => userStore.hasPermission('outsource'));
const hasOutsource = computed(() => summary.value.recentOutsource.length > 0);

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

/** 每秒刷新：驱动年余 hh:mm:ss 与时段欢迎色 */
const nowTick = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  clockTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});

type GreetingTone = 'night' | 'morning' | 'forenoon' | 'noon' | 'afternoon' | 'evening';

const greetingMeta = computed(() => {
  void nowTick.value;
  const h = new Date().getHours();
  if (h < 6) return { text: '夜深了', tone: 'night' as GreetingTone };
  if (h < 9) return { text: '早上好', tone: 'morning' as GreetingTone };
  if (h < 12) return { text: '上午好', tone: 'forenoon' as GreetingTone };
  if (h < 14) return { text: '中午好', tone: 'noon' as GreetingTone };
  if (h < 18) return { text: '下午好', tone: 'afternoon' as GreetingTone };
  return { text: '晚上好', tone: 'evening' as GreetingTone };
});
const greeting = computed(() => greetingMeta.value.text);
const greetingTone = computed(() => greetingMeta.value.tone);

/**
 * 欢迎称呼：
 * - 姓名为「管理员」或以「管理员」结尾（如系统管理员）→ 原样显示，不做「X先生/女士」
 * - 其余有性别时用「姓+先生/女士」
 */
const politeName = computed(() => {
  const u = userStore.userInfo;
  const name = (u?.realName || '').trim();
  if (!name) return u?.username || '用户';
  if (name === '管理员' || /管理员$/.test(name)) return name;
  const surname = name.charAt(0);
  if (u?.gender === 1) return `${surname}先生`;
  if (u?.gender === 2) return `${surname}女士`;
  return name;
});

/** 欢迎区日历摘要（公历 / 农历+节气 / 节假 / 年余倒计时） */
const cal = computed(() => getCalendarBrief(new Date(nowTick.value)));

async function load() {
  if (!canDashboard.value) return; // 无权限：不请求，避免整页 403 提示
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
/*
 * 欢迎词专用中文楷书（马善政楷书 Ma Shan Zheng）。
 *
 * **声明放在首页组件里而不是全局样式**：字体文件 2.6MB，全站只有欢迎词这一处用。
 * @font-face 是懒加载的——浏览器只在真正有元素用到这个 family 时才去下它，
 * 放这里能保证除首页外的页面一个字节都不下。（scoped 只作用于选择器，
 * @font-face 这类 at-rule 不受影响，照常全局生效。）
 *
 * **不做字体子集化**：欢迎词是「问候语 + 用户姓名」，姓名是任意汉字、无法预先
 * 枚举，砍字集会让某些人的名字缺字变成豆腐块，所以只能带完整中文字体。
 *
 * **font-display: swap**：2.6MB 在外网可能要几秒，期间先用系统楷体/默认字体把字
 * 显示出来，字体到了再换。不加的话浏览器默认 block，欢迎词会先空白一段时间。
 */
@font-face {
  font-family: 'Ma Shan Zheng';
  src: url('../../assets/fonts/ma-shan-zheng-zh.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

/*
 * 覆盖 layout `.main > * { min-height: 0 }`：手机端主区为 flex 列时，
 * 首页若被压成视口高度，欢迎卡内容溢出就会在卡片内出现垂直滚动条。
 */
.page {
  min-height: min-content;
  height: auto;
  overflow: visible;
}

.welcome-card {
  flex-shrink: 0;
  margin-bottom: 12px;
  overflow: visible;

  :deep(.el-card__body) {
    overflow: visible;
    max-height: none;
  }

  .welcome__text {
    .welcome-greet {
      margin: 0 0 12px;
      /* 回退链：自带楷书 → 系统楷体（Win 楷体 / macOS 楷体）→ 通用衬线，
         字体没下完或加载失败时仍是楷味，不会突兀地掉成黑体 */
      font-family: 'Ma Shan Zheng', KaiTi, STKaiti, '楷体', serif;
      /* 楷书字面比黑体小一圈，同字号看着偏弱，故略放大并收紧字距 */
      font-size: 24px;
      font-weight: 400;
      letter-spacing: 0.01em;
      transition: color 0.35s ease;

      &.is-night { color: #64748b; }
      &.is-morning { color: #ea580c; }
      &.is-forenoon { color: #0284c7; }
      &.is-noon { color: #d97706; }
      &.is-afternoon { color: #0d9488; }
      &.is-evening { color: #4f46e5; }
    }
  }
}

.welcome-cal {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  overflow: visible;
}

.cal-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 10px 6px 8px;
  border-radius: 999px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  line-height: 1.3;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(15, 40, 32, 0.06);
  }

  b {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    white-space: nowrap;
  }
  em {
    font-style: normal;
    font-weight: 700;
    color: inherit;
  }

  .cal-sep {
    margin: 0 0.25em;
    opacity: 0.45;
    font-weight: 400;
  }

  .cal-hms {
    font-variant-numeric: tabular-nums;
    font-family: ui-monospace, "SF Mono", Consolas, monospace;
    letter-spacing: 0.02em;
  }

  &__icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  &--solar {
    .cal-chip__icon { color: var(--el-color-primary); }
    b { color: var(--el-color-primary); }
  }
  &--lunar {
    .cal-chip__icon { color: #0d9488; }
    b {
      color: #0f766e;
      white-space: normal;
    }
  }
  &--year {
    .cal-chip__icon { color: var(--el-color-warning); }
    b em { color: var(--el-color-warning); }
  }
  &--holiday {
    .cal-chip__icon { color: var(--el-color-danger); }
    b em { color: var(--el-color-danger); }
  }
}

.cal-tag--lunar {
  --el-tag-text-color: #0f766e;
  --el-tag-border-color: rgba(13, 148, 136, 0.35);
  --el-tag-bg-color: rgba(13, 148, 136, 0.08);
}

@media (max-width: 768px) {
  .welcome-greet {
    font-size: 21px !important; /* 覆盖全局 h2 压缩；楷书字面偏小，比原 18px 略放大 */
  }

  .cal-chip {
    border-radius: 10px;
    width: 100%;
    box-sizing: border-box;
    overflow: visible;
    b {
      white-space: normal;
      word-break: break-word;
    }
  }
}
.no-stat {
  margin-bottom: 12px;
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
