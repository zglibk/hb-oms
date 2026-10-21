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
            <h2 class="welcome-greet">{{ welcomeGreeting }}</h2>
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
      description="如需查看，请联系管理员在「角色管理 → 分配权限」中勾选「统计查看 → 查看首页看板」。"
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

    <!-- 中段双卡：常用功能占 2/3，交付风险占 1/3，原有上下区域不改。 -->
    <el-row v-if="canDashboard && showOverviewCards" :gutter="16" class="overview-row">
      <el-col :xs="24" :lg="16">
        <el-card shadow="never" class="overview-card quick-card">
          <div class="overview-card__head">
            <span class="overview-card__title">
              <IconLayoutGridFilled class="overview-card__title-icon" aria-hidden="true" />
              常用功能
            </span>
          </div>
          <div class="quick-grid">
            <button
              v-for="action in quickActions"
              :key="action.label"
              type="button"
              class="quick-action"
              :class="`is-${action.tone}`"
              :disabled="!canUseQuickAction(action)"
              @click="openQuickAction(action)"
            >
              <span
                v-if="!canUseQuickAction(action)"
                class="quick-action__denied"
                aria-hidden="true"
              ></span>
              <span class="quick-action__icon">
                <component :is="action.icon" :size="32" :stroke-width="2.1" aria-hidden="true" />
              </span>
              <span class="quick-action__label">{{ action.label }}</span>
            </button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="8">
        <el-card v-loading="riskLoading" shadow="never" class="overview-card risk-card">
          <div class="overview-card__head">
            <span class="overview-card__title">
              <IconChartPieFilled class="overview-card__title-icon" aria-hidden="true" />
              交付风险分布
            </span>
            <div class="risk-filters">
              <el-select
                v-model="riskDays"
                class="risk-period"
                size="small"
                placeholder="自定义"
                aria-label="交付风险统计周期"
                @change="onRiskDaysChange"
              >
                <el-option v-for="item in riskDayOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-date-picker
                v-model="riskDateRange"
                class="risk-date-range"
                type="daterange"
                size="small"
                value-format="YYYY-MM-DD"
                format="YYYY-MM-DD"
                range-separator="-"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                :disabled-date="disableFutureRiskDate"
                aria-label="交付风险下单日期范围"
                @change="onRiskDateRangeChange"
              />
            </div>
          </div>

          <div class="risk-content">
            <div class="risk-chart-wrap">
              <AppChart :option="riskChartOption" height="160px" />
              <div class="risk-chart-center" aria-hidden="true">
                <strong>{{ formatCount(deliveryRisk.total) }}</strong>
                <span>进行中订单</span>
              </div>
            </div>
            <div class="risk-legend" aria-label="交付风险分类明细">
              <div v-for="item in riskItems" :key="item.key" class="risk-legend__row">
                <span class="risk-legend__dot" :style="{ backgroundColor: item.color }"></span>
                <span class="risk-legend__label">{{ item.label }}</span>
                <strong :style="{ color: item.chartColor }">{{ formatCount(item.metric.count) }}</strong>
                <span class="risk-legend__rate">{{ formatPercent(item.metric.rate) }}</span>
              </div>
            </div>
          </div>

          <div class="risk-footer">
            <div v-for="item in riskItems" :key="item.key" class="risk-metric" :class="`is-${item.key}`">
              <span class="risk-metric__icon">
                <component :is="item.icon" :size="18" :stroke-width="2.25" aria-hidden="true" />
              </span>
              <div class="risk-metric__body">
                <div class="risk-metric__summary">
                  <strong>{{ formatCount(item.metric.count) }}</strong>
                  <span>{{ item.shortLabel }}</span>
                </div>
                <span
                  class="risk-metric__trend"
                  :class="trendClass(item.key, item.metric.changeRate)"
                  :aria-label="`较上期 ${formatTrend(item.metric.changeRate)}`"
                >
                  <component :is="trendIcon(item.metric.changeRate)" :size="11" :stroke-width="3" aria-hidden="true" />
                  {{ formatTrend(item.metric.changeRate) }}
                </span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

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
              class="home-detail-table"
              :data="owedRows"
              size="small"
              :max-height="listMaxHeight"
              :row-class-name="detailRowClassName"
              @row-click="openProductDetail"
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

      <!-- 右：近期外发回厂 / 通知公告双页签。
           2026-08-10 外发取消发坯单、不再登记计划回厂时间后，「超期未回齐」失去判定
           基准（没有计划日、也没有"还在外面没回"的记录），这张卡改为展示最近几条回厂
           流水，位置与布局不变。 -->
      <el-col :xs="24" :lg="12">
        <el-card
          shadow="never"
          class="list-card"
          :class="{ 'is-empty': homeTab === 'outsource' ? !hasOutsource : !announcementStore.homeList.length }"
        >
          <template #header>
            <div class="list-card__head">
              <el-tabs v-model="homeTab" class="lc-tabs">
                <el-tab-pane name="outsource">
                  <template #label>
                    <span class="lc-tab">
                      <el-icon :class="hasOutsource ? 'is-primary' : 'is-muted'"><Van /></el-icon>
                      近期外发回厂
                      <el-tag size="small" round effect="plain" :type="counts.recentOutsource ? 'primary' : 'info'">{{ counts.recentOutsource }}</el-tag>
                    </span>
                  </template>
                </el-tab-pane>
                <el-tab-pane name="announcement">
                  <template #label>
                    <span class="lc-tab home-notice-tab">
                      <el-icon :class="announcementStore.unreadCount ? 'is-danger' : 'is-muted'"><Bell /></el-icon>
                      通知公告
                      <span v-if="announcementStore.unreadCount" class="home-notice-badge">{{ announcementBadge }}</span>
                    </span>
                  </template>
                </el-tab-pane>
              </el-tabs>
              <el-button
                v-if="homeTab === 'outsource'"
                v-permission="'outsource'"
                link type="primary"
                @click="go('/outsource')"
              >查看外发</el-button>
              <el-button v-else link type="primary" @click="announcementStore.openCenter()">更多</el-button>
            </div>
          </template>
          <template v-if="homeTab === 'outsource'">
            <div v-if="!hasOutsource" class="list-empty">
              <el-icon><CircleCheck /></el-icon>
              <span>暂无外发回厂记录</span>
            </div>
            <el-table
              v-else
              ref="outsourceTableRef"
              class="home-detail-table"
              :data="summary.recentOutsource"
              size="small"
              :max-height="listMaxHeight"
              :row-class-name="detailRowClassName"
              @row-click="openProductDetail"
              @mouseenter="outsourceScroll.pause()"
              @mouseleave="outsourceScroll.resume()"
            >
              <el-table-column label="回厂日期" width="96">
                <template #default="{ row }">{{ row.backDate || '—' }}</template>
              </el-table-column>
              <el-table-column label="生产单号" width="116" show-overflow-tooltip>
                <template #default="{ row }">{{ row.productionNo || row.orderNo || '—' }}</template>
              </el-table-column>
              <el-table-column label="加工商" prop="processorName" width="96" show-overflow-tooltip>
                <template #default="{ row }">
                  <color-tag v-if="row.processorName" :seed="row.processorName">{{ row.processorName }}</color-tag>
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="产品名称" prop="productName" min-width="132" show-overflow-tooltip />
              <el-table-column label="边别" width="76" align="center">
                <template #default="{ row }">{{ outsourceSideText(row) }}</template>
              </el-table-column>
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
              <el-table-column label="表面处理" width="88" align="center">
                <template #default="{ row }">
                  <color-tag v-if="row.surfaceType" :seed="row.surfaceType">{{ dictLabel(surfaceDict, row.surfaceType) }}</color-tag>
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="数量(支)" width="76" align="center">
                <template #default="{ row }"><b>{{ row.returnQty }}</b></template>
              </el-table-column>
            </el-table>
            <div v-if="hasOutsource && summary.recentOutsource.length >= summary.topLimit" class="list-card__more">
              共 {{ counts.recentOutsource }} 条，仅显示最近 {{ summary.topLimit }} 条
            </div>
          </template>
          <template v-else>
            <div v-if="!announcementStore.homeList.length" class="list-empty">
              <el-icon><CircleCheck /></el-icon>
              <span>暂无通知公告</span>
            </div>
            <div v-else class="home-notice-list" :style="{ maxHeight: `${listMaxHeight}px` }">
              <button
                v-for="item in announcementStore.homeList"
                :key="item.id"
                type="button"
                class="home-notice-row"
                @click="go(`/announcement/${item.id}`)"
              >
                <AnnouncementLevel :level="item.level" />
                <span class="home-notice-row__title" :title="item.title">{{ item.title }}</span>
                <span v-if="item.isUnread" class="home-notice-new">New</span>
              </button>
            </div>
          </template>
        </el-card>
      </el-col>
    </el-row>

    <!-- 每轮发布后首次进首页弹出更新明细（是否弹由服务端按人判定） -->
    <ChangelogNoticeDialog />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  Tickets, Tools, Van, Warning, Clock, CircleCheck, Switch, Calendar, DArrowLeft, Bell,
  Sunrise, Sunny, Moon, MoonNight, CoffeeCup,
} from '@element-plus/icons-vue';
import {
  IconAlertCircle,
  IconAdjustments,
  IconArrowDown,
  IconArrowUp,
  IconBellRinging,
  IconChartBar,
  IconChartPieFilled,
  IconCircleCheck,
  IconBuildingWarehouse,
  IconClipboardText,
  IconClock,
  IconExternalLink,
  IconHome,
  IconLayoutGridFilled,
  IconMinus,
  IconNotes,
  IconPackages,
  IconSettings,
  IconUpload,
  IconUserCog,
} from '@tabler/icons-vue';
import type { EChartsOption } from 'echarts';
import {
  getDashboardSummary,
  getDeliveryRisk,
  type DashboardSummary,
  type DeliveryRiskSummary,
} from '@/api/dashboard';
import { useUserStore } from '@/stores/user';
import { useAnnouncementStore } from '@/stores/announcement';
import { DIMENSION_UNIT, FINISHED_BIZ_TYPE, sideLabel } from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useAutoScroll } from '@/composables/useAutoScroll';
import { useDimensionView } from '@/composables/useDimensionView';
import { useFeatureFlags } from '@/composables/useFeatureFlags';

import { getCalendarBrief } from '@/utils/calendar-info';
import { welcomeTip, type TipData } from './welcome-tips';
import AppStatCard from '@/components/AppStatCard.vue';
import AppChart from '@/components/AppChart.vue';
import SevenSegNumber from '@/components/SevenSegNumber.vue';
import WelcomeRailArt from './WelcomeRailArt.vue';
import WelcomeFireworks from './WelcomeFireworks.vue';
import ChangelogNoticeDialog from './ChangelogNoticeDialog.vue';
import ColorTag from '@/components/ColorTag.vue';
import AnnouncementLevel from '@/components/announcement/AnnouncementLevel.vue';
import { ADMIN_ROLE_CODE, SUPER_ADMIN_ROLE_CODE } from '@hb-oms/shared';
import {
  businessToday,
  datePickerDay,
  formatBusinessDate,
  formatDateTime,
} from '@/utils/date';

const router = useRouter();
const userStore = useUserStore();
const announcementStore = useAnnouncementStore();
const { homeOwedScrollSpeed, homeOutsourceScrollSpeed } = useFeatureFlags();
const announcementBadge = computed(() => announcementStore.unreadCount > 99 ? '99+' : announcementStore.unreadCount);
const loading = ref(false);
const overviewMedia = typeof window === 'undefined'
  ? null
  : window.matchMedia('(min-width: 1600px) and (min-height: 901px)');
const showOverviewCards = ref(overviewMedia?.matches ?? true);

function onOverviewMediaChange(event: MediaQueryListEvent) {
  showOverviewCards.value = event.matches;
  if (event.matches) void loadRisk();
  void nextTick(scheduleListHeightUpdate);
}

type QuickTone = 'green' | 'blue' | 'orange' | 'violet' | 'red';
interface QuickAction {
  label: string;
  icon: Component;
  tone: QuickTone;
  path: string;
  query?: Record<string, string>;
  permissions: string[];
}

/** 2×6 常用入口；无权限保留置灰，符合全局按钮权限约定。 */
const quickActions: QuickAction[] = [
  { label: '订单管理', icon: IconNotes, tone: 'green', path: '/order', permissions: ['order'] },
  { label: '外发登记', icon: IconExternalLink, tone: 'blue', path: '/outsource/form', permissions: ['outsource', 'outsource:create'] },
  { label: '装配管理', icon: IconSettings, tone: 'orange', path: '/assembly', permissions: ['assembly'] },
  {
    label: '生产入库', icon: IconHome, tone: 'violet', path: '/finished-stock/form',
    query: { bizType: FINISHED_BIZ_TYPE.INBOUND }, permissions: ['finished-stock', 'finished-stock:create'],
  },
  {
    label: '销售出库', icon: IconUpload, tone: 'red', path: '/finished-stock/form',
    query: { bizType: FINISHED_BIZ_TYPE.SALE_OUTBOUND }, permissions: ['finished-stock', 'finished-stock:create'],
  },
  { label: '订单台账', icon: IconClipboardText, tone: 'blue', path: '/ledger', permissions: ['ledger'] },
  { label: '产品汇总', icon: IconChartBar, tone: 'green', path: '/analysis/product-summary', permissions: ['product-summary'] },
  { label: '呆滞品', icon: IconPackages, tone: 'violet', path: '/dull-stock', permissions: ['dull-stock'] },
  { label: '成品库存', icon: IconBuildingWarehouse, tone: 'orange', path: '/stock-balance', permissions: ['stock-balance'] },
  { label: '用户管理', icon: IconUserCog, tone: 'blue', path: '/system/user', permissions: ['system:user'] },
  { label: '通知公告', icon: IconBellRinging, tone: 'red', path: '/system/announcement', permissions: ['system:announcement'] },
  { label: '系统配置', icon: IconAdjustments, tone: 'green', path: '/system/config', permissions: ['system:config'] },
];

function canUseQuickAction(action: QuickAction): boolean {
  return action.permissions.every((code) => userStore.hasPermission(code));
}

function openQuickAction(action: QuickAction) {
  if (!canUseQuickAction(action)) return;
  router.push({ path: action.path, query: action.query });
}

type RiskDays = 30 | 60 | 90;
type RiskKey = 'overdue' | 'upcoming' | 'normal';
const riskDays = ref<RiskDays | undefined>(30);
const riskDayOptions: Array<{ label: string; value: RiskDays }> = [
  { label: '近30天', value: 30 },
  { label: '近60天', value: 60 },
  { label: '近90天', value: 90 },
];
/** 周期预设也把实际生效区间填进日期框；是否自定义仍由 riskDays 是否为空判断。 */
function riskRangeOf(days: RiskDays): [string, string] {
  const to = businessToday();
  const from = new Date(`${to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return [from.toISOString().slice(0, 10), to];
}
const riskDateRange = ref<[string, string] | null>(riskRangeOf(30));
const riskLoading = ref(false);
const deliveryRisk = ref<DeliveryRiskSummary>({
  days: 30,
  dateFrom: '',
  dateTo: '',
  total: 0,
  overdue: { count: 0, rate: 0, changeRate: 0 },
  upcoming: { count: 0, rate: 0, changeRate: 0 },
  normal: { count: 0, rate: 0, changeRate: 0 },
});
const riskItems = computed(() => [
  {
    key: 'overdue' as const, label: '逾期未发货', shortLabel: '逾期未发货', color: '#ff5a60',
    chartColor: '#ff5a60', icon: IconAlertCircle, metric: deliveryRisk.value.overdue,
  },
  {
    key: 'upcoming' as const, label: `临近交期（${summary.value.upcomingDays}天）`,
    shortLabel: `临近交期（${summary.value.upcomingDays}天）`,
    color: '#ff9f2f', chartColor: '#ff9f2f', icon: IconClock, metric: deliveryRisk.value.upcoming,
  },
  {
    key: 'normal' as const, label: '正常推进', shortLabel: '正常推进', color: '#16b88f', chartColor: '#43cdb0',
    icon: IconCircleCheck, metric: deliveryRisk.value.normal,
  },
]);
const riskChartOption = computed<EChartsOption>(() => {
  const values = riskItems.value.map((item) => ({
    value: item.metric.count,
    name: item.label,
    itemStyle: { color: item.chartColor },
  }));
  const hasData = deliveryRisk.value.total > 0;
  return {
    animationDuration: 500,
    tooltip: hasData
      ? {
          trigger: 'item',
          appendTo: 'body',
          confine: false,
          formatter: '{b}<br/>{c} 个订单（{d}%）',
        }
      : { show: false },
    series: [{
      type: 'pie',
      radius: ['52.5%', '83%'],
      center: ['50%', '52%'],
      startAngle: 90,
      clockwise: true,
      silent: !hasData,
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderColor: '#fff', borderWidth: hasData ? 1.5 : 0 },
      data: hasData ? values : [{ value: 1, name: '暂无数据', itemStyle: { color: '#edf1f5' } }],
    }],
  };
});

const countFormatter = new Intl.NumberFormat('zh-CN');
function formatCount(value: number): string { return countFormatter.format(value); }
function formatPercent(value: number): string { return `${value.toFixed(1)}%`; }
function formatTrend(value: number): string { return `${Math.abs(value).toFixed(1)}%`; }
function trendIcon(value: number): Component {
  return value > 0 ? IconArrowUp : value < 0 ? IconArrowDown : IconMinus;
}
function trendClass(key: RiskKey, value: number): string {
  if (value === 0) return 'is-neutral';
  const favorable = key === 'normal' ? value > 0 : value < 0;
  return favorable ? 'is-good' : 'is-bad';
}

const disableFutureRiskDate = (date: Date) => datePickerDay(date) > businessToday();

function onRiskDaysChange(value: RiskDays) {
  if (!riskDayOptions.some((item) => item.value === value)) return;
  riskDateRange.value = riskRangeOf(value);
  void loadRisk();
}

function onRiskDateRangeChange(value: [string, string] | null) {
  if (!value?.[0] || !value?.[1]) {
    riskDays.value = 30;
    riskDateRange.value = riskRangeOf(30);
    void loadRisk();
    return;
  }
  const days = Math.round((Date.parse(value[1]) - Date.parse(value[0])) / 86_400_000) + 1;
  if (days < 1 || days > 366) {
    ElMessage.warning(days < 1 ? '开始日期不能晚于结束日期' : '日期范围最长为 366 天');
    riskDays.value = 30;
    riskDateRange.value = riskRangeOf(30);
    void loadRisk();
    return;
  }
  riskDays.value = undefined;
  void loadRisk();
}

let riskRequestSeq = 0;
async function loadRisk() {
  if (!canDashboard.value || !showOverviewCards.value) return;
  const seq = ++riskRequestSeq;
  riskLoading.value = true;
  try {
    const days = riskDays.value;
    const range = riskDateRange.value;
    // 周期预设与自定义范围互斥传给接口；日期框即使已显示预设区间，也不能同时发送两组参数。
    const result = await getDeliveryRisk(days
      ? { days }
      : range
        ? { dateFrom: range[0], dateTo: range[1] }
        : { days: 30 });
    if (seq === riskRequestSeq) {
      deliveryRisk.value = result;
      // 以后端实际统计边界为准，避免跨天或服务端口径调整后筛选框与卡片数据不一致。
      riskDateRange.value = [result.dateFrom, result.dateTo];
    }
  } finally {
    if (seq === riskRequestSeq) riskLoading.value = false;
  }
}

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
const homeTab = ref<'outsource' | 'announcement'>('outsource');

/* ===== 逾期 / 临近交期 页签 ===== */
const owedTab = ref<'overdue' | 'upcoming'>('overdue');
const isOverdueTab = computed(() => owedTab.value === 'overdue');
const owedRows = computed(() =>
  isOverdueTab.value ? summary.value.overdueOrders : summary.value.upcomingOrders,
);
const owedTruncated = computed(() => owedRows.value.length >= summary.value.topLimit);

/* ===== 待办列表自动滚动 ===== */

const owedTableRef = ref<any>(null);
const outsourceTableRef = ref<any>(null);

/**
 * 首页表格高度按「表格顶部 → 当前视口底部」的实际剩余空间换算为整数行：
 * - 矮屏 / 浏览器放大时减少行数，避免页面底部只露半行；
 * - 高屏增加行数，利用原本空白的区域；
 * - 卡片底部说明、body 内边距、el-main 底部内边距都从可用空间扣除。
 *
 * size="small" 实测：表头 33.8px、数据行 31.8px。保留 4～30 行的边界，极矮屏仍有
 * 基本可读性，超高屏也不会把首页拉成过长清单。接口仍最多返回 100 条，超出可见行才
 * 由 useAutoScroll 轮播；可见行数与接口返回条数是两回事。
 */
const TABLE_HEADER_HEIGHT = 33.8;
const TABLE_ROW_HEIGHT = 31.8;
const MIN_VISIBLE_ROWS = 4;
const MAX_VISIBLE_ROWS = 30;
const listMaxHeight = ref(Math.ceil(TABLE_HEADER_HEIGHT + TABLE_ROW_HEIGHT * 10));
let listResizeRaf = 0;

function tableRootOf(table: any): HTMLElement | null {
  return table?.$el instanceof HTMLElement ? table.$el : null;
}

function updateListMaxHeight() {
  const roots = [tableRootOf(owedTableRef.value), tableRootOf(outsourceTableRef.value)]
    .filter((root): root is HTMLElement => !!root);
  if (!roots.length) return;

  const main = roots[0].closest<HTMLElement>('.main');
  // rect.top 会随 el-main 的滚动位置变化；补回 scrollTop，窗口在页面已滚动时缩放也不会误算成超大表格。
  const tableTop = Math.min(...roots.map((root) => root.getBoundingClientRect().top))
    + (main?.scrollTop ?? 0);
  const mainBottomPadding = main
    ? Number.parseFloat(getComputedStyle(main).paddingBottom) || 0
    : 0;

  // 两张卡底部说明可能一边有、一边没有；取较大值，保证并排卡片都不越过视口底边。
  const cardBottomSpace = Math.max(
    ...roots.map((root) => {
      const body = root.closest<HTMLElement>('.el-card__body');
      if (!body) return 0;
      const bodyStyle = getComputedStyle(body);
      const bodyPadding = Number.parseFloat(bodyStyle.paddingBottom) || 0;
      const more = body.querySelector<HTMLElement>('.list-card__more');
      if (!more) return bodyPadding;
      const moreMargin = Number.parseFloat(getComputedStyle(more).marginTop) || 0;
      return bodyPadding + more.offsetHeight + moreMargin;
    }),
  );

  // 再留 2px 给卡片边框与浏览器的小数像素取整，避免刚好卡在底边时露出半条边线。
  const available = window.innerHeight - tableTop - mainBottomPadding - cardBottomSpace - 2;
  const rows = Math.min(
    MAX_VISIBLE_ROWS,
    Math.max(MIN_VISIBLE_ROWS, Math.floor((available - TABLE_HEADER_HEIGHT) / TABLE_ROW_HEIGHT)),
  );
  const nextHeight = Math.ceil(TABLE_HEADER_HEIGHT + TABLE_ROW_HEIGHT * rows);
  if (nextHeight === listMaxHeight.value) return;

  listMaxHeight.value = nextHeight;
  void nextTick(() => {
    owedTableRef.value?.doLayout?.();
    outsourceTableRef.value?.doLayout?.();
    owedScroll.reset();
    outsourceScroll.reset();
  });
}

function scheduleListHeightUpdate() {
  cancelAnimationFrame(listResizeRaf);
  listResizeRaf = requestAnimationFrame(updateListMaxHeight);
}

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

const owedScroll = useAutoScroll(() => scrollWrapOf(owedTableRef.value), { speed: homeOwedScrollSpeed });
const outsourceScroll = useAutoScroll(() => scrollWrapOf(outsourceTableRef.value), {
  speed: homeOutsourceScrollSpeed,
});
onMounted(() => {
  owedScroll.start();
  outsourceScroll.start();
  overviewMedia?.addEventListener('change', onOverviewMediaChange);
  window.addEventListener('resize', scheduleListHeightUpdate);
  void nextTick(scheduleListHeightUpdate);
});

/** 换页签等于换了一份数据：滚动归零；底部说明可能随条数出现/消失，也要重算可见行。 */
watch(owedTab, () => {
  owedScroll.reset();
  void nextTick(scheduleListHeightUpdate);
});
watch(homeTab, () => {
  outsourceScroll.reset();
  void nextTick(scheduleListHeightUpdate);
});

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
  overviewMedia?.removeEventListener('change', onOverviewMediaChange);
  window.removeEventListener('resize', scheduleListHeightUpdate);
  cancelAnimationFrame(listResizeRaf);
});

type GreetingTone = 'night' | 'morning' | 'forenoon' | 'noon' | 'afternoon' | 'evening';

const greetingMeta = computed(() => {
  const h = Number(formatDateTime(nowTick.value).slice(11, 13));
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
  const today = formatBusinessDate(nowTick.value);
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
 * 欢迎称呼：其余有性别时用「姓+先生/女士」。
 * 「管理员 / 系统管理员 / 超级管理员」属于账号的角色占位名，由 welcomeGreeting 改成「欢迎回来」。
 */
const politeName = computed(() => {
  const u = userStore.userInfo;
  const name = (u?.realName || '').trim();
  if (!name) return u?.username || '用户';
  const surname = name.charAt(0);
  if (u?.gender === 1) return `${surname}先生`;
  if (u?.gender === 2) return `${surname}女士`;
  return name;
});

/** 管理员使用「X先生/女士晚上好，欢迎回来」；角色占位名不直接用于称呼 */
const welcomeGreeting = computed(() => {
  const name = (userStore.userInfo?.realName || '').trim();
  if (
    userStore.roles.some(
      (role) => role === SUPER_ADMIN_ROLE_CODE || role === ADMIN_ROLE_CODE,
    )
  ) {
    if (name === '管理员' || /管理员$/.test(name)) return `${greeting.value}，欢迎回来`;
    return `${politeName.value}${greeting.value}，欢迎回来`;
  }
  return `${greeting.value}，${politeName.value}`;
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
  const today = formatBusinessDate(nowTick.value);
  const [year, month, day] = today.split('-').map(Number);
  const week = new Date(`${today}T00:00:00Z`).getUTCDay();
  return { day, ym: `${year}年${month}月`, week: `星期${WEEK_CN[week]}` };
});

const yearCdLabel = computed(() => {
  const c = cal.value;
  return `${c.year} 年还剩 ${c.yearLeftDays} 天 ${c.yearLeftHours} 小时 ${c.yearLeftMinutes} 分 ${c.yearLeftSeconds} 秒`;
});

async function load() {
  if (!canDashboard.value) return; // 无权限：不请求，避免整页 403 提示
  loading.value = true;
  try {
    const [dashboard] = await Promise.all([getDashboardSummary(), loadRisk()]);
    summary.value = dashboard;
    summaryLoaded.value = true;
    pickDefaultTab();
    // 刷新后行数变了，滚动位置要回到第一行
    void nextTick(() => {
      scheduleListHeightUpdate();
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
  scheduleListHeightUpdate();
  if (activatedOnce) load();
  else activatedOnce = true;
});

function go(path: string) {
  router.push(path);
}

/** 首页交期待办与近期外发回厂表格统一下钻到产品级台账；通知公告走独立详情页。 */
function openProductDetail(row: { orderProductId?: number | null }) {
  if (!canLedger.value) {
    ElMessage.warning('暂无订单跟踪台账查看权限，请联系管理员授权');
    return;
  }
  if (!row.orderProductId) {
    ElMessage.warning('该记录未关联订单产品，无法打开详情');
    return;
  }
  router.push({ path: '/ledger', query: { orderProductId: String(row.orderProductId) } });
}

/** 有权限时用手型提示可下钻；无权限仍保留点击反馈，明确告知授权要求。 */
function detailRowClassName() {
  return canLedger.value ? 'is-detail-clickable' : 'is-detail-locked';
}
function outsourceSideText(row: { side: string; legacyUnassigned: boolean }): string {
  return row.legacyUnassigned ? '历史未分边' : (sideLabel(row.side) || '通用');
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

/* 中间双卡：左侧 2×6 快捷入口占 2/3，右侧圆环风险分布占 1/3。 */
.overview-row {
  margin-bottom: 0;
  row-gap: var(--hb-page-padding);

  > :deep(.el-col) {
    display: flex;
  }
}

.overview-card {
  display: flex;
  width: 100%;
  height: 268px;
  flex-direction: column;
  border-color: #e5eaf1;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgb(15 23 42 / 3%);

  :deep(.el-card__body) {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    padding: 8px 14px 10px;
    box-sizing: border-box;
  }

  &__head {
    display: flex;
    min-height: 20px;
    flex: 0 0 20px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #101a33;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1;
    white-space: nowrap;

    &-icon {
      display: block;
      width: 18px;
      height: 18px;
      flex: 0 0 18px;
      color: var(--el-color-primary);
    }
  }
}

.quick-card :deep(.el-card__body) {
  padding-right: 16px;
  padding-left: 16px;
}

.quick-grid {
  display: grid;
  min-height: 0;
  height: 186px;
  flex: 0 0 186px;
  margin-top: 10px;
  grid-template-columns: repeat(6, 85px);
  grid-template-rows: repeat(2, 85px);
  justify-content: center;
  column-gap: clamp(12px, calc((100% - 558px) / 5), 85px);
  row-gap: 16px;
}

.quick-action {
  --quick-color: var(--el-color-primary);
  --quick-bg: var(--el-color-primary-light-9);
  position: relative;
  display: flex;
  width: 85px;
  height: 85px;
  min-width: 0;
  aspect-ratio: 1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 7px;
  padding: 8px 4px 7px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #14203a;
  font: inherit;
  cursor: pointer;
  transition: background-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;

  &:hover:not(:disabled),
  &:focus-visible {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--quick-color) 24%, transparent);
    background: var(--quick-bg);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--quick-color) 12%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--quick-color);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  &__icon {
    display: flex;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    align-items: center;
    justify-content: center;
    color: var(--quick-color);

    svg {
      display: block;
      width: 32px !important;
      height: 32px !important;
      aspect-ratio: 1;
      flex: none;
    }
  }

  &__denied {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 16px;
    height: 16px;
    border: 2px solid #f04444;
    border-radius: 50%;
    background: #fff;
    box-sizing: border-box;
    box-shadow: 0 1px 3px rgb(240 68 68 / 18%);

    &::after {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 8px;
      height: 2px;
      border-radius: 1px;
      background: #f04444;
      content: '';
      transform: translate(-50%, -50%);
    }
  }

  &__label {
    overflow: hidden;
    max-width: 100%;
    font-size: 12px;
    font-weight: 400;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.is-green { --quick-color: #09ad83; --quick-bg: #eaf8f4; }
  &.is-blue { --quick-color: #1877ed; --quick-bg: #edf5ff; }
  &.is-orange { --quick-color: #ff8a0a; --quick-bg: #fff5e9; }
  &.is-violet { --quick-color: #6552ea; --quick-bg: #f2f0ff; }
  &.is-red { --quick-color: #ff515b; --quick-bg: #fff0f1; }
}

.risk-period {
  width: 84px;
  flex: 0 0 84px;

  :deep(.el-select__wrapper) {
    min-height: 30px;
    padding: 2px 7px;
    border-radius: 6px;
    box-shadow: 0 0 0 1px #dfe6ef inset;
    font-size: 12px;

    .el-select__suffix { color: #53617a; }
  }
}

.risk-card .overview-card__head {
  min-height: 30px;
  flex-basis: 30px;
}

.risk-filters {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
  gap: 6px;
}

.risk-date-range {
  --el-date-editor-daterange-width: 184px;
  width: 184px !important;
  max-width: 184px;
  flex: 0 0 184px;

  :deep(.el-range-separator) {
    width: 10px;
    padding: 0 2px;
    font-size: 11px;
  }
}

:deep(.risk-date-range.el-range-editor.el-input__wrapper) {
  width: 184px !important;
  max-width: 184px;
  min-height: 30px;
  padding: 2px 7px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #dfe6ef inset;
  font-size: 11px;
}

.risk-card :deep(.el-card__body) {
  padding-right: 12px;
  padding-left: 12px;
}

.risk-content {
  display: grid;
  height: 160px;
  margin-top: 3px;
  grid-template-columns: minmax(160px, 0.95fr) minmax(220px, 1.05fr);
  align-items: center;
  gap: 2px;
}

.risk-chart-wrap {
  position: relative;
  min-width: 0;
  height: 160px;
  transform: translateX(-3px);
}

.risk-chart-center {
  position: absolute;
  inset: 52% auto auto 50%;
  display: flex;
  align-items: center;
  flex-direction: column;
  transform: translate(-50%, -50%);
  pointer-events: none;
  line-height: 1.1;

  strong {
    color: #18233d;
    font-family: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 21px;
  }

  span {
    margin-top: 4px;
    color: #273550;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
}

.risk-legend {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 22px;
  padding-right: 2px;

  &__row {
    display: grid;
    grid-template-columns: 9px minmax(108px, 1fr) 42px 44px;
    align-items: center;
    gap: 7px;
    color: #263550;
    font-size: 12px;
    line-height: 17px;
  }

  &__dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  &__label { white-space: nowrap; }
  strong {
    color: #17233f;
    font-family: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
    font-size: 14px;
    font-weight: 700;
    text-align: right;
  }
  &__rate {
    color: #7d8ba3;
    font-size: 12px;
    text-align: right;
  }
}

.risk-footer {
  display: grid;
  height: 55px;
  margin-top: 2px;
  padding-top: 6px;
  border-top: 1px solid #e8edf3;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  box-sizing: border-box;
  transform: translateY(1px);
}

.risk-metric {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 5px;
  border-right: 1px solid #e8edf3;

  &:last-child { border-right: 0; }

  &__icon {
    display: flex;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;

    svg {
      display: block;
      width: 18px;
      height: 18px;
      aspect-ratio: 1;
      flex: none;
    }
  }

  &__body {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  &__summary {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    flex-direction: column;

    strong {
      font-family: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.3px;
      line-height: 17px;
    }

    span {
      overflow: hidden;
      max-width: 78px;
      margin-top: 1px;
      color: #6f7e96;
      font-size: 10px;
      line-height: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__trend {
    display: inline-flex;
    align-items: center;
    flex: none;
    font-family: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
    font-size: 10px;
    font-weight: 700;
    line-height: 14px;
    white-space: nowrap;

    svg {
      width: 11px;
      height: 11px;
      margin-right: 1px;
      flex: none;
    }
  }

  &.is-overdue {
    .risk-metric__icon { background: #fff0f1; color: #ff5a60; }
    .risk-metric__summary strong { color: #ff5a60; }
  }
  &.is-upcoming {
    .risk-metric__icon { background: #fff5e9; color: #ff9f2f; }
    .risk-metric__summary strong { color: #f58a14; }
  }
  &.is-normal {
    .risk-metric__icon { background: #eaf8f4; color: #16b88f; }
    .risk-metric__summary strong { color: #12a982; }
  }
}

.is-good { color: #12a982; }
.is-bad { color: #ff515b; }
.is-neutral { color: var(--el-text-color-secondary); }

@media (min-width: 1361px) {
  .risk-content { grid-template-columns: 145px minmax(0, 1fr); }
  .risk-legend { gap: 20px; }
  .risk-legend__row { grid-template-columns: 9px minmax(0, 1fr) 34px 40px; gap: 5px; }
  .risk-legend__label { overflow: hidden; text-overflow: ellipsis; }
  .risk-metric { padding: 0 4px; gap: 7px; }
}

/* 典型笔记本 CSS 视口（1366×768、1536×864、1920×900）及更小屏幕不展示中段双卡。 */
@media (max-width: 1599px), (max-height: 900px) {
  .overview-row { display: none; }
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

/* 首页待办行可直接下钻；悬停底色同时说明当前点击目标是整行。 */
.home-detail-table {
  :deep(.el-table__body tr.is-detail-clickable) {
    cursor: pointer;
  }
  :deep(.el-table__body tr.is-detail-clickable:hover > td.el-table__cell) {
    background: var(--el-color-primary-light-9);
  }
  :deep(.el-table__body tr.is-detail-locked) {
    cursor: not-allowed;
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
.home-notice-tab { position: relative; }
.home-notice-badge {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}

/* 通告页签刻意用无表头、无网格线的自定义列表，且不接入自动滚动。 */
.home-notice-list {
  overflow-y: auto;
}
.home-notice-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 4px;
  min-height: 38px;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  color: var(--el-text-color-primary);
  text-align: left;
  cursor: pointer;
  &:hover { background: var(--el-color-primary-light-9); }
  &__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.home-notice-new {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
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
