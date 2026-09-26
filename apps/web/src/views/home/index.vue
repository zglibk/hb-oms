<!--
  首页看板（销售视角，设计文档 §5.2）。

  欢迎区：问候 + 日历摘要（公历/农历/年余/下一法定假日）
  汇总卡：进行中订单数 / 总成品欠数 / 总发货欠数 / 逾期订单数
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
      <!-- 装饰层：时段色渐变 + 光晕 + 点阵。单独一层并自带裁剪——卡片本身不能 overflow:hidden，
           否则日历浮层会被裁掉 -->
      <div class="welcome-bg" aria-hidden="true"></div>
      <!-- 欢迎词独占横幅；日历折叠进右侧按钮，**只有悬停展开**（2026-09-25 取消了点击固定）：
           鼠标移到按钮上展开浮层面板（不占横幅空间、不挤动页面），离开按钮+面板即收起；
           键盘 Tab 聚焦按钮同样展开。 -->
      <div class="welcome__text">
        <div class="welcome-hero">
          <span class="welcome-hero__icon"><el-icon><component :is="toneIcon" /></el-icon></span>
          <div class="welcome-hero__text">
            <h2 class="welcome-greet">{{ greeting }}，{{ politeName }}</h2>
            <p class="welcome-sub">{{ welcomeSub }}</p>
          </div>
        </div>
        <!-- 中部舞台：占欢迎词与日历按钮之间的全部空位、铺满横幅高度——放大了也盖不到文字，
             空位窄时两端被裁掉而不是压扁。滑轨插画在前，法定假期期间（整段假期每一天）烟花在后 -->
        <div class="welcome-stage" aria-hidden="true">
          <WelcomeFireworks v-if="cal.todayHoliday" class="welcome-stage__fx" />
          <WelcomeRailArt class="welcome-stage__art" />
        </div>
        <div class="cal-dock" @mouseleave="calOpen = false">
          <button
            type="button"
            class="cal-toggle"
            :class="{ 'is-open': calOpen }"
            :aria-expanded="calOpen"
            aria-label="日历"
            @mouseenter="calOpen = true"
            @focus="calOpen = true"
            @blur="calOpen = false"
          >
            <el-icon class="cal-toggle__arrow"><DArrowLeft /></el-icon>
            <el-icon><Calendar /></el-icon>
          </button>

          <Transition name="cal-reveal">
            <section v-show="calOpen" class="cal-panel" aria-label="今日日历">
              <!-- 抬头：大号日期 -->
              <header class="cal-panel__head">
                <span class="cal-panel__day">{{ calHead.day }}</span>
                <div class="cal-panel__ym">
                  <b>{{ calHead.ym }}</b>
                  <span>{{ calHead.week }}</span>
                </div>
              </header>

              <div class="cal-panel__rows">
                <div class="cal-row cal-row--lunar">
                  <svg class="cal-row__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M15.2 3.2a8.8 8.8 0 1 0 5.6 15.4A9.2 9.2 0 0 1 15.2 3.2z"
                      fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"
                    />
                    <circle cx="9.2" cy="10.2" r="0.9" fill="currentColor" />
                    <circle cx="12.4" cy="13.8" r="0.7" fill="currentColor" />
                  </svg>
                  <span class="cal-row__label">农历</span>
                  <div class="cal-row__body">
                    <b>{{ cal.lunarText }}</b>
                    <small v-if="cal.nextJieQi">
                      <template v-if="cal.nextJieQi.daysLeft === 0">今天{{ cal.nextJieQi.name }}</template>
                      <template v-else>距{{ cal.nextJieQi.name }}还有 <em>{{ cal.nextJieQi.daysLeft }}</em> 天</template>
                    </small>
                  </div>
                </div>

                <div class="cal-row cal-row--holiday">
                  <svg class="cal-row__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3c2.2 2.4 3.4 4.4 3.4 6.2A3.4 3.4 0 1 1 12 5.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                    <path d="M12 3c-2.2 2.4-3.4 4.4-3.4 6.2A3.4 3.4 0 1 0 12 5.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                    <path d="M8.2 14.5c1.2 2.8 2.6 4.6 3.8 6.5 1.2-1.9 2.6-3.7 3.8-6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                    <circle cx="12" cy="9.4" r="1.2" fill="currentColor" />
                  </svg>
                  <span class="cal-row__label">节假</span>
                  <div class="cal-row__body">
                    <!-- 正在放假：只有节日正日（如八月十五）才说「今天是中秋节」，假期里其他天说「假期第 N 天」 -->
                    <template v-if="cal.todayHoliday">
                      <b>
                        <span class="is-today">{{
                          cal.todayHoliday.isFestivalDay
                            ? `今天是${cal.todayHoliday.name}`
                            : `${cal.todayHoliday.name}假期 · 第 ${cal.todayHoliday.dayIndex} 天`
                        }}</span>
                      </b>
                      <small v-if="cal.nextHoliday">距{{ cal.nextHoliday.name }}还有 <em>{{ cal.nextHoliday.daysLeft }}</em> 天</small>
                    </template>
                    <b v-else-if="cal.nextHoliday">距{{ cal.nextHoliday.name }}还有 <em>{{ cal.nextHoliday.daysLeft }}</em> 天</b>
                    <b v-else>近期暂无法定节假日</b>
                  </div>
                </div>

                <div class="cal-row cal-row--year">
                  <svg class="cal-row__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 3h10v4.2c0 1.4-.7 2.7-1.9 3.4L12 13l-3.1-2.4A4 4 0 0 1 7 7.2V3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
                    <path d="M7 21h10v-4.2c0-1.4-.7-2.7-1.9-3.4L12 11l-3.1 2.4A4 4 0 0 0 7 16.8V21z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
                    <path d="M9.5 6.5h5M9.5 17.5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                  <span class="cal-row__label">年余</span>
                  <div class="cal-row__body">
                    <small>{{ cal.year }} 年还剩</small>
                    <span class="year-cd" :aria-label="yearCdLabel">
                      <SevenSegNumber :value="cal.yearLeftDays" class="year-cd__digits" />
                      <span class="year-cd__lbl">天</span>
                      <SevenSegNumber :value="cal.yearLeftHours" :pad="2" class="year-cd__digits" />
                      <span class="year-cd__lbl">时</span>
                      <SevenSegNumber :value="cal.yearLeftMinutes" :pad="2" class="year-cd__digits" />
                      <span class="year-cd__lbl">分</span>
                      <SevenSegNumber :value="cal.yearLeftSeconds" :pad="2" class="year-cd__digits" />
                      <span class="year-cd__lbl">秒</span>
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </Transition>
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
      <app-stat-card color="amber" :value="cards.productionOwed" label="总成品欠数(支)" :link-text="canLedger ? '台账>' : ''" @link="go('/ledger')">
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
              <el-button v-permission="'ledger'" link type="primary" @click="go('/ledger')">查看台账</el-button>
            </div>
          </template>

          <!-- 空态收成一条横幅，不再撑出一张只有表头的空表 -->
          <div v-if="!owedRows.length" class="list-empty">
            <el-icon><CircleCheck v-if="isOverdueTab" /><Clock v-else /></el-icon>
            <span>{{ isOverdueTab ? '暂无逾期，交付良好' : `未来 ${summary.upcomingDays} 天内没有到期且欠货的订单` }}</span>
          </div>
          <template v-else>
            <el-table
              ref="owedTableRef"
              :data="owedRows"
              size="small"
              :max-height="LIST_MAX_HEIGHT"
              @mouseenter="owedScroll.pause()"
              @mouseleave="owedScroll.resume()"
            >
              <el-table-column label="客户" prop="customerName" min-width="68" show-overflow-tooltip />
              <el-table-column label="订单编号" min-width="84" show-overflow-tooltip>
                <template #default="{ row }">{{ row.productionNo || row.orderNo || '—' }}</template>
              </el-table-column>
              <el-table-column label="产品名称" prop="productName" min-width="110" show-overflow-tooltip />
              <el-table-column :label="owedDimLabel" width="92" align="center">
                <template #header>
                  <el-tooltip content="点击切换本表 mm / 寸" placement="top">
                    <button type="button" class="dim-toggle" @click="toggleDimUnit('owed')">
                      {{ owedDimLabel }}<el-icon><Switch /></el-icon>
                    </button>
                  </el-tooltip>
                </template>
                <template #default="{ row }">{{ owedDimText(row.dimensionMm) }}</template>
              </el-table-column>
              <el-table-column label="交期" width="80" align="center">
                <template #default="{ row }">
                  <span :class="{ 'num-overdue': isOverdueTab }">{{ row.deliveryDate || '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="isOverdueTab ? '逾期' : '剩余'" width="62" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="isOverdueTab || row.days <= 2 ? 'danger' : 'warning'">
                    {{ row.days }} 天
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="欠数" width="58" align="center">
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
              <el-button v-permission="'outsource'" link type="primary" @click="go('/outsource')">查看外发</el-button>
            </div>
          </template>
          <div v-if="!hasOutsource" class="list-empty">
            <el-icon><CircleCheck /></el-icon>
            <span>暂无外发回厂记录</span>
          </div>
          <template v-else>
            <el-table
              ref="outsourceTableRef"
              :data="summary.recentOutsource"
              size="small"
              :max-height="LIST_MAX_HEIGHT"
              @mouseenter="outsourceScroll.pause()"
              @mouseleave="outsourceScroll.resume()"
            >
              <el-table-column label="回厂日期" width="78">
                <template #default="{ row }">{{ row.backDate || '—' }}</template>
              </el-table-column>
              <el-table-column label="生产单号" min-width="72" show-overflow-tooltip>
                <template #default="{ row }">{{ row.productionNo || row.orderNo || '—' }}</template>
              </el-table-column>
              <el-table-column label="加工商" prop="processorName" width="64" show-overflow-tooltip>
                <template #default="{ row }">
                  <color-tag v-if="row.processorName" :seed="row.processorName">{{ row.processorName }}</color-tag>
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="产品名称" prop="productName" min-width="110" show-overflow-tooltip />
              <el-table-column :label="outDimLabel" width="92" align="center">
                <template #header>
                  <el-tooltip content="点击切换本表 mm / 寸" placement="top">
                    <button type="button" class="dim-toggle" @click="toggleDimUnit('out')">
                      {{ outDimLabel }}<el-icon><Switch /></el-icon>
                    </button>
                  </el-tooltip>
                </template>
                <template #default="{ row }">{{ outDimText(row.dimensionMm) }}</template>
              </el-table-column>
              <el-table-column label="表面处理" width="72" align="center">
                <template #default="{ row }">
                  <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ dictLabel(surfaceDict, row.surfaceType) }}</color-tag>
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="数量(支)" width="68" align="center">
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
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Tickets, Tools, Van, Warning, Clock, CircleCheck, Switch, Calendar, DArrowLeft,
  Sunrise, Sunny, Moon, MoonNight, CoffeeCup,
} from '@element-plus/icons-vue';
import { getDashboardSummary, type DashboardSummary } from '@/api/dashboard';
import { useUserStore } from '@/stores/user';
import { DIMENSION_UNIT } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useAutoScroll } from '@/composables/useAutoScroll';
import { useDimensionView } from '@/composables/useDimensionView';

import { getCalendarBrief } from '@/utils/calendar-info';
import { welcomeTip, type TipData } from './welcome-tips';
import AppStatCard from '@/components/AppStatCard.vue';
import SevenSegNumber from '@/components/SevenSegNumber.vue';
import WelcomeRailArt from './WelcomeRailArt.vue';
import WelcomeFireworks from './WelcomeFireworks.vue';
import ColorTag from '@/components/ColorTag.vue';

const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);

/**
 * 规格查看单位：初值取系统配置的「默认规格单位」，用户可临时切换（不改库）。
 * 逻辑与台账页、订单列表共用同一个 composable。
 */
/**
 * 规格单位开关做在各表的「规格」列表头里（原先两表共用一个开关、单占一行，太费纵向空间）。
 * 开关就在本表表头上，**各管各的**：左右两张表各调一次 useDimensionView，
 * 初值都取系统配置的默认单位，手动切换只影响本表。只影响展示不改库。
 */
const { viewUnit: owedDimUnit, colLabel: owedDimLabel, text: owedDimText } = useDimensionView();
const { viewUnit: outDimUnit, colLabel: outDimLabel, text: outDimText } = useDimensionView();
/** 按表名取 ref 再切：模板里顶层 ref 会被自动解包，直接把 ref 当参数传进来拿到的只是字符串 */
function toggleDimUnit(table: 'owed' | 'out') {
  const unit = table === 'owed' ? owedDimUnit : outDimUnit;
  unit.value = unit.value === DIMENSION_UNIT.INCH ? DIMENSION_UNIT.MM : DIMENSION_UNIT.INCH;
}

const summary = ref<DashboardSummary>({
  cards: { activeOrders: 0, productionOwed: 0, deliveryOwed: 0, overdueOrders: 0 },
  overdueOrders: [],
  upcomingOrders: [],
  recentOutsource: [],
  counts: { overdueOrders: 0, upcomingOrders: 0, recentOutsource: 0 },
  topLimit: 100,
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
const hasOutsource = computed(() => summary.value.recentOutsource.length > 0);

/* ===== 逾期 / 临近交期 页签 ===== */
const owedTab = ref<'overdue' | 'upcoming'>('overdue');
const isOverdueTab = computed(() => owedTab.value === 'overdue');
const owedRows = computed(() =>
  isOverdueTab.value ? summary.value.overdueOrders : summary.value.upcomingOrders,
);
const owedTruncated = computed(() => owedRows.value.length >= summary.value.topLimit);

/* ===== 待办列表自动滚动 ===== */

/**
 * 列表可见高度（px）：表头 33.8 + 10 行 × 31.8 ≈ 352（size="small" 实测值；取整多 1~2px 会露出下一行的边线）。
 *
 * 2026-08-13 由 5 行改 10 行，2026-09-25 改为 8 行，2026-09-26 又改回 10 行（均为使用方要求）。2026-09-25 起接口每块最多
 * 返回 100 条（topLimit，原为 10 条、与可见行数相同，列表从来滚不起来）：超过 10 行即自动轮播，
 * 鼠标移入暂停、可滚轮手动翻看。可见行数与返回条数是两回事，别再改成相等。
 * 改行数只改这个数——行高变了先量一遍 el-table 的实际 header/row 高度再算。
 */
const LIST_MAX_HEIGHT = 352;

const owedTableRef = ref<any>(null);
const outsourceTableRef = ref<any>(null);

/**
 * el-table 的实际滚动元素：body-wrapper 里包着一层 el-scrollbar，滚的是它的 wrap。
 * 兜一个 body-wrapper 本身，万一哪天换成原生滚动条（`native`）也不至于失效。
 */
function scrollWrapOf(table: any): HTMLElement | null {
  const root: HTMLElement | undefined = table?.$el;
  if (!root) return null;
  return (
    root.querySelector<HTMLElement>('.el-table__body-wrapper .el-scrollbar__wrap') ??
    root.querySelector<HTMLElement>('.el-table__body-wrapper')
  );
}

const owedScroll = useAutoScroll(() => scrollWrapOf(owedTableRef.value));
const outsourceScroll = useAutoScroll(() => scrollWrapOf(outsourceTableRef.value));
onMounted(() => {
  owedScroll.start();
  outsourceScroll.start();
});

/** 换页签等于换了一份数据，停在半路的滚动位置对新列表没有意义 */
watch(owedTab, () => owedScroll.reset());

/** 没有逾期、却有临近到期的，默认停在「临近交期」页，省用户一次点击 */
function pickDefaultTab() {
  owedTab.value =
    counts.value.overdueOrders === 0 && counts.value.upcomingOrders > 0 ? 'upcoming' : 'overdue';
}

const surfaceDict = ref<Array<{ label: string; value: string }>>([]);
loadDict('surface_type').then((rows: any[]) => {
  surfaceDict.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});

/** 每秒刷新：驱动年余倒计时（天/时/分/秒）与时段欢迎色 */
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

/** 横幅的时段图标与副标题：与问候语同一套时段划分，整条横幅随时段换色调 */
const TONE_ICON: Record<GreetingTone, unknown> = {
  night: MoonNight,
  morning: Sunrise,
  forenoon: Sunny,
  noon: CoffeeCup,
  afternoon: Sunny,
  evening: Moon,
};
const toneIcon = computed(() => TONE_ICON[greetingTone.value]);

/** 看板数据是否已返回：未返回前不拿初始的全 0 拼带数字的提示 */
const summaryLoaded = ref(false);
/** 提示文案用的实时数字（口径见 welcome-tips.ts 的 TipData）；无看板权限或未加载时为 null */
const tipData = computed<TipData | null>(() => {
  if (!canDashboard.value || !summaryLoaded.value) return null;
  const s = summary.value;
  const d = new Date(nowTick.value);
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    activeOrders: s.cards.activeOrders,
    overdueOrders: s.cards.overdueOrders,
    overdueItems: s.counts.overdueOrders,
    upcomingItems: s.counts.upcomingOrders,
    upcomingDays: s.upcomingDays,
    productionOwed: s.cards.productionOwed,
    deliveryOwed: s.cards.deliveryOwed,
    // 回厂列表按回厂日期倒序、最多 100 条，一天内回厂一般不会超过这个数
    todayBack: s.recentOutsource.filter((r) => r.backDate === today).length,
  };
});
/** 日期 + 岗位×时段提示（文案在 welcome-tips.ts）；节日正日换成节日祝福，假期其他天换成假期问候 */
const welcomeSub = computed(() => {
  const h = cal.value.todayHoliday;
  const tip = h
    ? h.isFestivalDay
      ? `今天是${h.name}，节日快乐`
      : `${h.name}假期中，祝您假期愉快`
    : welcomeTip(userStore.roles, greetingTone.value, tipData.value);
  return `${calHead.value.ym.replace(/^\d+年/, '')}${calHead.value.day}日 ${calHead.value.week} · ${tip}`;
});

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

/**
 * 日历折叠：默认只露右侧按钮。
 * 只有悬停展开（浮层，不挤布局），鼠标离开按钮+日历整块区域即收起；键盘聚焦按钮同样展开。
 * 2026-09-25 取消了「点击固定」（使用方要求）。
 */
const calOpen = ref(false);
/** 日历面板抬头：大号「日」+ 年月 + 星期 */
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
const calHead = computed(() => {
  const d = new Date(nowTick.value);
  return { day: d.getDate(), ym: `${d.getFullYear()}年${d.getMonth() + 1}月`, week: `星期${WEEK_CN[d.getDay()]}` };
});

const yearCdLabel = computed(() => {
  const c = cal.value;
  return `${c.year} 年还剩 ${c.yearLeftDays} 天 ${c.yearLeftHours} 小时 ${c.yearLeftMinutes} 分 ${c.yearLeftSeconds} 秒`;
});

async function load() {
  if (!canDashboard.value) return; // 无权限：不请求，避免整页 403 提示
  loading.value = true;
  try {
    summary.value = await getDashboardSummary();
    summaryLoaded.value = true;
    pickDefaultTab();
    // 刷新后行数变了，滚动位置要回到第一行
    void nextTick(() => {
      owedScroll.reset();
      outsourceScroll.reset();
    });
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

/* 纵向间距统一交给全局 .page 的 flex gap（= 页面内边距 --hb-page-padding），与横幅上方空距一致。
   各块自己不要再加上下 margin：flex 项的 margin 不合并，会与 gap 叠加（曾叠成 30px） */
.welcome-card {
  flex-shrink: 0;
  overflow: visible;
  /* 日历面板会垂到横幅下方，盖在汇总卡上：横幅整体要叠在后续兄弟元素之上 */
  position: relative;
  z-index: 5;

  /* 横幅色调 = 当前主题色（「更换主题」即时生效）：竖条 / 徽章 / 渐变 / 光晕 / 问候语都取它。
     2026-09-26 前按时段换色（早橙午青晚紫），与用户选的主题色各说各话；时段现在只决定图标（日/月） */
  --tone-rgb: var(--hb-primary-rgb, 19, 166, 125);

  :deep(.el-card__body) {
    overflow: visible;
    max-height: none;
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .welcome__text {
    position: relative; /* 叠在装饰层之上 */
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;

    .welcome-greet {
      margin: 0;
      flex-shrink: 0;
      white-space: nowrap;
      line-height: 1.25;
      /* 回退链：自带楷书 → 系统楷体（Win 楷体 / macOS 楷体）→ 通用衬线，
         字体没下完或加载失败时仍是楷味，不会突兀地掉成黑体 */
      font-family: 'Ma Shan Zheng', KaiTi, STKaiti, '楷体', serif;
      /* 楷书字面比黑体小一圈，同字号看着偏弱，故略放大并收紧字距 */
      font-size: 24px;
      font-weight: 400;
      letter-spacing: 0.01em;
      color: var(--el-color-primary);
      transition: color 0.35s ease;
    }
  }
}

/* 装饰层：铺满卡片、自带圆角裁剪，不接收鼠标 */
.welcome-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: var(--el-card-border-radius, 4px);
  pointer-events: none;
  background:
    radial-gradient(circle at 96% -30%, rgba(var(--tone-rgb), 0.16) 0, transparent 42%),
    radial-gradient(circle at 80% 150%, rgba(var(--tone-rgb), 0.1) 0, transparent 38%),
    linear-gradient(100deg, rgba(var(--tone-rgb), 0.09) 0%, rgba(var(--tone-rgb), 0.02) 45%, transparent 70%);
  transition: background 0.35s ease;

  /* 左侧时段色竖条 */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: linear-gradient(180deg, rgba(var(--tone-rgb), 0.9), rgba(var(--tone-rgb), 0.45));
  }
  /* 右侧点阵纹理，向左淡出 */
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 42%;
    background-image: radial-gradient(rgba(var(--tone-rgb), 0.22) 1px, transparent 1.2px);
    background-size: 14px 14px;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 70%);
    mask-image: linear-gradient(90deg, transparent, #000 70%);
  }
}

/* 中部舞台：flex 占满欢迎词与日历按钮之间的空位；上下负外边距抵掉卡片内边距（16px），铺满横幅高度。
   自己裁剪溢出——卡片本身不能 overflow:hidden（日历浮层会被裁） */
.welcome-stage {
  flex: 1 1 0;
  min-width: 0;
  align-self: stretch;
  position: relative;
  margin: -16px 0;
  overflow: hidden;
  pointer-events: none;

  &__fx {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  /* 绝对定位 + 上下贴边：高度由横幅决定、宽度按 viewBox 比例算出。
     不能放在文档流里——SVG 会先按空位宽度铺满、再按比例反推高度，把横幅撑高（曾撑到 110px） */
  &__art {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    height: 100%;
    width: auto;
    transform: translateX(-50%);
  }
}
@media (max-width: 768px) {
  .welcome-stage { display: none; }
}

.welcome-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;

  &__icon {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    font-size: 24px;
    color: rgb(var(--tone-rgb));
    background: rgba(var(--tone-rgb), 0.12);
    box-shadow: inset 0 0 0 1px rgba(var(--tone-rgb), 0.18);
  }
  &__text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
}
.welcome-sub {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 日历停靠区：只有按钮占位（在欢迎词行的最右侧）；面板是它的绝对定位子元素，
   不参与排版，悬停与固定两种状态都不占横幅空间 */
.cal-dock {
  position: relative;
  margin-left: auto;
  flex-shrink: 0;
}

.cal-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 40px;
  height: 32px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--el-text-color-regular);
  font-size: 16px;
  cursor: pointer;
  transition: color 0.15s ease;

  /* 无框无底：状态只靠图标颜色和箭头方向表达 */
  &:hover,
  &.is-open {
    color: var(--el-color-primary);
  }
  /* 展开时箭头掉头（指向「收回去」的方向） */
  &.is-open .cal-toggle__arrow { transform: rotate(180deg); }
  &:focus-visible {
    outline: 2px solid var(--el-color-primary-light-5);
    outline-offset: 2px;
    border-radius: 6px;
  }
  &__arrow {
    font-size: 12px;
    transition: transform 0.2s ease;
  }
}

/* 日历面板：贴在按钮左侧、顶边与按钮对齐，向左展开；超出横幅的部分浮在下方内容之上 */
.cal-panel {
  position: absolute;
  top: 0;
  right: calc(100% + 10px);
  z-index: 30;
  width: 340px;
  box-sizing: border-box;
  padding: 14px 16px 12px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  box-shadow: 0 10px 28px rgba(15, 40, 32, 0.14);

  /* 桥接按钮与面板之间的 10px 空隙：属于面板的一部分，鼠标从按钮移进面板途中不会触发收起 */
  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: -10px;
    width: 10px;
    height: 40px;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 12px;
    margin-bottom: 4px;
    border-bottom: 1px dashed var(--el-border-color-lighter);
  }
  &__day {
    min-width: 52px;
    height: 52px;
    padding: 0 6px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  &__ym {
    display: flex;
    flex-direction: column;
    gap: 4px;
    b { font-size: 15px; color: var(--el-text-color-primary); }
    span { font-size: 13px; color: var(--el-text-color-secondary); }
  }
}

/* 面板内容：图标 + 标签 + 内容 三列对齐 */
.cal-row {
  display: grid;
  grid-template-columns: 18px 32px 1fr;
  align-items: start;
  column-gap: 8px;
  padding: 9px 0;

  & + & { border-top: 1px solid var(--el-fill-color); }

  &__icon {
    width: 18px;
    height: 18px;
    margin-top: 1px;
  }
  &__label {
    font-size: 12px;
    line-height: 20px;
    color: var(--el-text-color-secondary);
  }
  &__body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    line-height: 20px;

    b {
      font-size: 13px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
    small {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
    em {
      font-style: normal;
      font-weight: 700;
    }
  }

  /* 农历行随主题色；节假（红）与年余（橙）是语义色，不跟主题 */
  &--lunar {
    .cal-row__icon { color: var(--el-color-primary); }
    b { color: var(--el-color-primary-dark-2); }
    em { color: var(--el-color-primary-dark-2); }
  }
  &--holiday {
    .cal-row__icon { color: var(--el-color-danger); }
    em { color: var(--el-color-danger); }
    /* 节假日当天整句标红 */
    .is-today { color: var(--el-color-danger); }
  }
  &--year {
    .cal-row__icon { color: var(--el-color-warning); }
  }
}

.year-cd {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  line-height: 1;

  &__lbl {
    font-size: 12px;
    font-weight: 500;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
  }

  &__digits {
    /* 数码字明显高于旁边文案 */
    :deep(.seven-seg) {
      width: 13px;
      height: 22px;
    }
  }
}

/* 「向左展开」：从右边缘往左揭开 */
.cal-reveal-enter-active,
.cal-reveal-leave-active {
  transition: clip-path 0.26s ease, opacity 0.2s ease;
}
.cal-reveal-enter-from,
.cal-reveal-leave-to {
  clip-path: inset(0 0 0 100% round 12px);
  opacity: 0;
}
.cal-reveal-enter-to,
.cal-reveal-leave-from {
  clip-path: inset(0 0 0 0 round 12px);
}

@media (max-width: 768px) {
  .welcome-greet {
    font-size: 21px !important; /* 覆盖全局 h2 压缩；楷书字面偏小，比原 18px 略放大 */
  }

  /* 窄屏左侧放不下：面板改从按钮正下方弹出、右对齐 */
  .cal-panel {
    top: calc(100% + 8px);
    right: 0;
    width: min(340px, calc(100vw - 32px));
    &::after { display: none; }
  }
}

.no-stat {
  margin: 0;
}

.sum-bar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 0;
}
/* 「规格」列表头即单位开关：保持表头原样式，只加切换图标与悬停反馈 */
.dim-toggle {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 0; border: 0; background: none;
  font: inherit; color: inherit; cursor: pointer; white-space: nowrap;
  .el-icon { font-size: 12px; color: var(--el-color-primary); }
  &:hover { color: var(--el-color-primary); }
}
/* 窄屏两卡上下叠放时的间距用 row-gap（只出现在两卡之间），**不要给卡片加 margin-bottom**：
   宽屏两卡并排时那截 margin 会垫在页面最底部，与 el-main 的底部内边距叠加，
   内容明明放得下也会冒出垂直滚动条（2026-09-25 修） */
.list-row {
  margin-bottom: 0;
  row-gap: var(--hb-page-padding);
}
.list-card {
  margin-bottom: 0;

  /* 表格与卡头、底部说明之间的留白收紧一些，首页在常见 1080p 屏幕下一屏放得下 */
  :deep(.el-card__body) {
    padding-top: 12px;
    padding-bottom: 12px;
  }

  /* 空态时收紧内边距，卡片不至于为一行提示撑出大片留白 */
  &.is-empty :deep(.el-card__body) {
    padding-top: 8px;
    padding-bottom: 10px;
  }

  /* min-height 与 .lc-tabs 的页签项高度对齐：左卡头是 el-tabs（27px），右卡头只有
     标题+角标（20px），不统一的话左右两张卡差 7px、底边对不齐 */
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 28px;
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
