<!--
  数据可视化大屏（蓝色科幻主题，只读）。

  两个入口，数据完全相同：
  - 后台：顶栏「数据可视化」按钮新标签打开，带登录态，需 `stat:screen`；
  - 车间电视：免登录，地址 `/oms/admin/screen#key=访问码`。访问码放在 **hash** 里——hash 不发给服务器、
    不进 Nginx access log；读到后存 localStorage 并从地址栏抹掉，之后电视开机直接看。

  画布**宽高都铺满视口**：逻辑高度固定 1080、逻辑宽度按屏幕宽高比算（再整体等比缩放），
  所以 16:9 / 16:10 / 21:9 / 32:9 的屏幕都满屏、不留黑边、字不变形；三列按比例分宽。
  屏幕窄于 MIN_W（如 4:3）时改为固定逻辑宽度、让逻辑高度变高，面板纵向拉长而不是挤成一团。
  时间范围只作用于标「区间」的面板，标「实时」的面板与筛选无关（口径见 screen.service 头注释）。
-->
<template>
  <div ref="viewportRef" class="sv">
    <div class="sv__canvas" :style="canvasStyle">
      <!-- ===== 顶部标题 ===== -->
      <header class="sv__head">
        <div class="sv__head-side">
          <span class="sv__clock">{{ clockText }}</span>
          <span class="sv__muted">{{ weekText }}</span>
          <button
            v-if="canFullscreen"
            type="button"
            class="sv__fs-btn"
            :title="isFullscreen ? '退出全屏（Esc）' : '全屏显示'"
            :aria-label="isFullscreen ? '退出全屏' : '全屏显示'"
            @click="toggleFullscreen"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path v-if="!isFullscreen" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              <path v-else d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            </svg>
            <span>{{ isFullscreen ? '退出全屏' : '全屏' }}</span>
          </button>
        </div>
        <div class="sv__title-wrap">
          <svg class="sv__title-deco" viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden="true">
            <!-- 标题框：梯形下底 150~850（占列宽 70%），标题文字要落在这段里，改字号/字数先量一下 -->
            <path d="M0 10 H110 L150 72 H850 L890 10 H1000" fill="none" stroke="#3fd0ff" stroke-width="2" />
            <path d="M190 84 H810" stroke="#1d4f8f" stroke-width="4" />
            <path class="sv__scan" d="M190 84 H310" stroke="#5fe3ff" stroke-width="4" />
            <path d="M0 20 H90 M910 20 H1000" stroke="#1d4f8f" stroke-width="1" />
            <g fill="#3fd0ff">
              <rect x="40" y="26" width="10" height="4" /><rect x="56" y="26" width="10" height="4" opacity="0.6" /><rect x="72" y="26" width="10" height="4" opacity="0.3" />
              <rect x="918" y="26" width="10" height="4" opacity="0.3" /><rect x="934" y="26" width="10" height="4" opacity="0.6" /><rect x="950" y="26" width="10" height="4" />
            </g>
          </svg>
          <h1 class="sv__title" :data-text="title">{{ title }}</h1>
        </div>
        <div class="sv__head-side sv__head-side--right">
          <div class="sv__range" role="group" aria-label="时间范围">
            <button
              v-for="p in PRESETS"
              :key="p.key"
              type="button"
              class="sv__range-btn"
              :class="{ 'is-active': preset === p.key }"
              @click="choosePreset(p.key)"
            >{{ p.label }}</button>
            <el-date-picker
              v-model="customRange"
              type="daterange"
              value-format="YYYY-MM-DD"
              range-separator="~"
              start-placeholder="开始"
              end-placeholder="结束"
              :clearable="false"
              :disabled-date="(d: Date) => d.getTime() > Date.now()"
              popper-class="sv-picker-popper"
              placement="bottom-end"
              class="sv__picker"
              :class="{ 'is-active': preset === 'custom' }"
              @change="onCustomRange"
            />
          </div>
        </div>
      </header>

      <!-- ===== 无权限 / 需访问码 ===== -->
      <div v-if="access !== 'ok'" class="sv__gate">
        <ScreenPanel title="数据大屏访问" class="sv__gate-panel">
          <p class="sv__gate-msg">{{ gateMessage }}</p>
          <form v-if="access === 'needKey'" class="sv__gate-form" @submit.prevent="submitKey">
            <input v-model.trim="keyInput" class="sv__gate-input" placeholder="请输入管理员提供的大屏访问码" autocomplete="off" />
            <button type="submit" class="sv__range-btn is-active">进入大屏</button>
          </form>
          <p v-if="gateError" class="sv__gate-err">{{ gateError }}</p>
        </ScreenPanel>
      </div>

      <template v-else>
        <!-- ===== 指标卡 ===== -->
        <div class="sv__kpis">
          <div v-for="k in kpis" :key="k.label" class="sv__kpi" :class="k.tone && `sv__kpi--${k.tone}`">
            <span class="sv__kpi-label">{{ k.label }}</span>
            <span class="sv__kpi-val">{{ shortNum(k.value) }}</span>
            <span class="sv__kpi-tag">{{ k.tag }}</span>
          </div>
        </div>

        <!-- ===== 三列主体 ===== -->
        <div class="sv__main">
          <div class="sv__col">
            <ScreenPanel title="订单状态分布" kind="range" class="sv__p-status">
              <AppChart v-if="!statusEmpty" :option="statusOption" height="100%" />
              <div v-else class="sv__empty">所选时间段内没有新下的订单</div>
            </ScreenPanel>
            <ScreenPanel title="客户发货欠数 TOP5" kind="live" class="sv__p-cust">
              <AppChart v-if="data.customerOwedTop.length" :option="customerOption" height="100%" />
              <div v-else class="sv__empty">暂无欠数</div>
            </ScreenPanel>
            <ScreenPanel title="外发回厂趋势（零件支）" kind="range" class="sv__p-os">
              <AppChart :option="outsourceOption" height="100%" />
              <div v-if="outsourceEmpty" class="sv__nodata">{{ NO_DATA_TEXT }}</div>
            </ScreenPanel>
          </div>

          <div class="sv__col">
            <ScreenPanel title="业务主线 · 流转" kind="range" class="sv__p-flow">
              <ScreenFlow v-bind="data.flow" />
            </ScreenPanel>
            <ScreenPanel title="成品入库 / 出库趋势" kind="range" class="sv__p-trend">
              <AppChart :option="trendOption" height="100%" />
              <div v-if="trendEmpty" class="sv__nodata">{{ NO_DATA_TEXT }}</div>
            </ScreenPanel>
          </div>

          <div class="sv__col">
            <ScreenPanel title="装配车间产出" kind="range" class="sv__p-ws">
              <AppChart v-if="data.workshopOutput.length" :option="workshopOption" height="100%" />
              <div v-else class="sv__empty">区间内无完工批次</div>
            </ScreenPanel>
            <ScreenPanel title="逾期未发货" kind="live" class="sv__p-list">
              <div class="sv__list-head"><span>客户</span><span>产品</span><span>欠数</span><span>逾期</span></div>
              <div
                ref="overdueRef"
                class="sv__list"
                @mouseenter="overdueScroll.pause()"
                @mouseleave="overdueScroll.resume()"
              >
                <div v-for="r in data.overdueOrders" :key="r.orderProductId" class="sv__list-row">
                  <span>{{ r.customerName || '—' }}</span>
                  <span :title="r.productName || r.productModel">{{ r.productName || r.productModel }}</span>
                  <span>{{ shortNum(r.deliveryOwed) }}</span>
                  <span :class="r.days > 30 ? 'sv__red' : 'sv__amber'">{{ r.days }}天</span>
                </div>
                <div v-if="!data.overdueOrders.length" class="sv__empty">暂无逾期</div>
              </div>
            </ScreenPanel>
            <ScreenPanel title="近期外发回厂" kind="live" class="sv__p-list">
              <div class="sv__list-head"><span>日期</span><span>产品</span><span>加工商</span><span>数量</span></div>
              <div
                ref="outsourceRef"
                class="sv__list"
                @mouseenter="outsourceScroll.pause()"
                @mouseleave="outsourceScroll.resume()"
              >
                <div v-for="r in data.recentOutsource" :key="r.id" class="sv__list-row">
                  <span>{{ (r.backDate || '').slice(5) }}</span>
                  <span :title="r.productName || ''">{{ r.productName || '—' }}</span>
                  <span>{{ r.processorName || '—' }}</span>
                  <span>{{ shortNum(r.returnQty) }}</span>
                </div>
                <div v-if="!data.recentOutsource.length" class="sv__empty">暂无记录</div>
              </div>
            </ScreenPanel>
          </div>
        </div>

        <!-- ===== 底部摘要 ===== -->
        <footer class="sv__foot">
          <span class="sv__foot-line" aria-hidden="true" />
          <span class="sv__foot-bar" aria-hidden="true" />
          <span>呆滞品结存 <b>{{ shortNum(data.summary.dullStockPcs) }}</b> 支</span>
          <span>部件台账在库 <b>{{ data.summary.partBalanceItems }}</b> 档</span>
          <span>区间新订单 <b>{{ data.summary.newOrders }}</b> 张</span>
          <span class="sv__muted">统计区间 {{ data.range.from }} ~ {{ data.range.to }} · 更新于 {{ updatedText }}</span>
          <span class="sv__foot-bar" aria-hidden="true" />
          <span class="sv__foot-line" aria-hidden="true" />
        </footer>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import AppChart from '@/components/AppChart.vue';
import ScreenPanel from './ScreenPanel.vue';
import ScreenFlow from './ScreenFlow.vue';
import { SCREEN, axisStyle, shortNum, tooltipStyle } from './theme';
import { getPublicScreenData, getScreenData, ScreenKeyError, type ScreenData } from '@/api/screen';
import { tokenStore } from '@/utils/request';
import { useUserStore } from '@/stores/user';
import { useAutoScroll } from '@/composables/useAutoScroll';

/** 逻辑高度基准：所有字号 / 卡片高度按 1080 高的屏设计 */
const BASE_H = 1080;
/**
 * 逻辑宽度下限：标题框 600 绝对居中，右上角 7 个预设 + 日期框约 590px 要放在标题框右侧，
 * 再窄就压到标题上（比 16:9 窄的屏会走这条：逻辑高度变大、面板纵向拉长）。
 * 改标题宽度 / 增减预设按钮时用 check-screen-ui 那套量法重新核一遍。
 */
const MIN_W = 1920;
const REFRESH_MS = 60_000;
const KEY_STORAGE = 'hb_oms_screen_key';
const RANGE_STORAGE = 'hb_oms_screen_range';

const userStore = useUserStore();
const title = '海宝订单数据大屏';

/* ---------------- 画布缩放 ---------------- */
const viewportRef = ref<HTMLElement>();
const box = ref({ w: 1920, h: BASE_H, scale: 1 });
/**
 * 宽高都铺满：先按高度定缩放（逻辑高 1080），逻辑宽 = 视口宽 / 缩放；
 * 逻辑宽不足 MIN_W 时改按宽度定缩放，逻辑高随之变大。两种情况画布都正好盖满视口。
 */
function fit() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let scale = vh / BASE_H;
  if (vw / scale < MIN_W) scale = vw / MIN_W;
  box.value = { w: vw / scale, h: vh / scale, scale };
}
const canvasStyle = computed(() => ({
  width: `${box.value.w}px`,
  height: `${box.value.h}px`,
  transform: `translate(-50%, -50%) scale(${box.value.scale})`,
}));

/* ---------------- 全屏 ---------------- */
/**
 * 浏览器全屏（Fullscreen API）：进入后画布按新视口重算铺满（resize → fit）。
 * 状态以 fullscreenchange 为准——用户按 Esc 退出时按钮文字要跟着变。
 * 注意按 F11 进的是浏览器自身的全屏，API 感知不到，按钮仍显示「全屏」，属正常。
 */
const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;
const isFullscreen = ref(!!document.fullscreenElement);
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}

/* ---------------- 时钟 ---------------- */
const now = ref(new Date());
const pad = (n: number) => String(n).padStart(2, '0');
const clockText = computed(() => {
  const d = now.value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
});
const weekText = computed(() => `星期${'日一二三四五六'[now.value.getDay()]}`);

/* ---------------- 时间范围 ---------------- */
type PresetKey = 'today' | 'week' | 'last30' | 'month' | 'quarter' | 'year' | 'custom';
const PRESETS: Array<{ key: Exclude<PresetKey, 'custom'>; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'last30', label: '近30天' },
  { key: 'month', label: '本月' },
  { key: 'quarter', label: '本季' },
  { key: 'year', label: '本年' },
];
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 预设区间一律截止到今天（每次刷新重算，跨天挂着的电视自动跟上） */
function rangeOf(key: Exclude<PresetKey, 'custom'>): [string, string] {
  const t = new Date();
  const start = new Date(t);
  if (key === 'week') start.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  // 滚动窗口：月初 / 季初时「本月」「本季」只有几天、区间面板几乎全是 0，电视上看着像坏了
  if (key === 'last30') start.setDate(t.getDate() - 29);
  if (key === 'month') start.setDate(1);
  if (key === 'quarter') start.setMonth(Math.floor(t.getMonth() / 3) * 3, 1);
  if (key === 'year') start.setMonth(0, 1);
  return [ymd(start), ymd(t)];
}

function loadSavedRange(): { preset: PresetKey; custom: [string, string] | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(RANGE_STORAGE) || 'null');
    if (saved?.preset === 'custom' && Array.isArray(saved.custom)) return { preset: 'custom', custom: saved.custom };
    if (PRESETS.some((p) => p.key === saved?.preset)) return { preset: saved.preset, custom: null };
  } catch {
    /* 隐私模式 / 脏值：回落本月 */
  }
  return { preset: 'last30', custom: null };
}
const saved = loadSavedRange();
const preset = ref<PresetKey>(saved.preset);
// 日期框始终显示当前生效的区间（选了预设也同步过去），否则「本年」高亮时框里还写着本月
const customRange = ref<[string, string] | null>(saved.custom ?? rangeOf(saved.preset as Exclude<PresetKey, 'custom'>));

function currentRange() {
  const [from, to] = preset.value === 'custom' && customRange.value ? customRange.value : rangeOf(preset.value as Exclude<PresetKey, 'custom'>);
  return { from, to };
}
function persistRange() {
  try {
    localStorage.setItem(RANGE_STORAGE, JSON.stringify({ preset: preset.value, custom: preset.value === 'custom' ? customRange.value : null }));
  } catch {
    /* 忽略 */
  }
}
function choosePreset(key: Exclude<PresetKey, 'custom'>) {
  preset.value = key;
  customRange.value = rangeOf(key);
  persistRange();
  load();
}
function onCustomRange(v: [string, string] | null) {
  if (!v) return;
  preset.value = 'custom';
  persistRange();
  load();
}

/* ---------------- 访问方式 ---------------- */
type Access = 'ok' | 'needKey' | 'forbidden';
const access = ref<Access>('ok');
const gateError = ref('');
const keyInput = ref('');
const gateMessage = computed(() =>
  access.value === 'forbidden'
    ? '你的账号没有「查看数据大屏」权限，请联系管理员在角色管理中授权（授权后刷新本页即可）。'
    : '车间电视免登录查看需要访问码，由管理员在「系统管理 → 系统配置 → 数据大屏」生成。',
);

function readKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}
function saveKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* 忽略 */
  }
}

/** 地址栏 #key=… 只读一次：存起来后立即抹掉，免得访问码留在浏览器历史 / 被人拍照 */
function takeKeyFromHash() {
  const m = /(?:^#|&)key=([^&]+)/.exec(window.location.hash);
  if (!m) return;
  saveKey(decodeURIComponent(m[1]));
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
}

/** 有登录态且有权限 → 登录入口；否则有访问码 → 免登录入口 */
function useJwt(): boolean {
  return !!tokenStore.get() && userStore.hasPermission('stat:screen');
}

/* ---------------- 数据 ---------------- */
const empty: ScreenData = {
  range: { from: '', to: '', bucket: 'day' },
  generatedAt: '',
  cards: { activeOrders: 0, productionOwed: 0, deliveryOwed: 0, overdueOrders: 0, stockQty: 0, rangeOutbound: 0 },
  orderStatus: [],
  customerOwedTop: [],
  flow: { orderQty: 0, outsourceReturned: 0, assembled: 0, inbound: 0, outbound: 0, completionRate: 0, deliveryRate: 0 },
  trend: { labels: [], inbound: [], outbound: [], outsource: [] },
  workshopOutput: [],
  overdueOrders: [],
  recentOutsource: [],
  summary: { dullStockPcs: 0, partBalanceItems: 0, newOrders: 0 },
};
const data = reactive<ScreenData>({ ...empty });
const updatedText = computed(() => (data.generatedAt ? new Date(data.generatedAt).toTimeString().slice(0, 8) : '—'));

let loading = false;
async function load() {
  if (loading) return;
  loading = true;
  try {
    const range = currentRange();
    let res: ScreenData;
    if (useJwt()) {
      res = await getScreenData(range);
    } else {
      const key = readKey();
      // 登录了但没权限、手里又有访问码时仍走访问码（同一台电脑既当办公机又挂大屏）
      if (!key) {
        access.value = tokenStore.get() ? 'forbidden' : 'needKey';
        return;
      }
      res = await getPublicScreenData(range, key);
    }
    Object.assign(data, res);
    access.value = 'ok';
    gateError.value = '';
    requestAnimationFrame(() => {
      overdueScroll.reset();
      outsourceScroll.reset();
    });
  } catch (e) {
    if (e instanceof ScreenKeyError) {
      saveKey('');
      access.value = 'needKey';
      gateError.value = e.message;
    }
    // 其它错误（网络抖动等）保留上一次的数据，下个刷新周期再试——电视上不弹窗打扰
  } finally {
    loading = false;
  }
}

function submitKey() {
  if (!keyInput.value) {
    gateError.value = '请输入访问码';
    return;
  }
  saveKey(keyInput.value);
  keyInput.value = '';
  load();
}

/* ---------------- 指标卡 ---------------- */
const kpis = computed(() => [
  { label: '进行中订单', value: data.cards.activeOrders, tag: '实时 · 张' },
  { label: '成品欠数', value: data.cards.productionOwed, tag: '实时 · 支' },
  { label: '发货欠数', value: data.cards.deliveryOwed, tag: '实时 · 支', tone: 'amber' },
  { label: '逾期订单', value: data.cards.overdueOrders, tag: '实时 · 张', tone: 'red' },
  { label: '成品库存', value: data.cards.stockQty, tag: '实时 · 支' },
  { label: '区间出库', value: data.cards.rangeOutbound, tag: '区间 · 支', tone: 'green' },
]);

/* ---------------- 图表 ---------------- */
/**
 * 区间面板全为 0 时盖一层提示：月初 / 季初选「本月」「本季」只有几天，一条贴底的平线
 * 在电视上看着像接口坏了。提示写明是「这段时间没有」，并引导换个范围。
 */
const NO_DATA_TEXT = '所选时间段暂无数据，可切换「近30天」或「本年」查看';
const allZero = (...arr: number[][]) => arr.every((a) => a.every((v) => !v));
const statusEmpty = computed(() => data.orderStatus.every((r) => !r.count));
const outsourceEmpty = computed(() => allZero(data.trend.outsource));
const trendEmpty = computed(() => allZero(data.trend.inbound, data.trend.outbound));

const axisLabels = computed(() => data.trend.labels.map((k) => (data.range.bucket === 'month' ? k : k.slice(5))));

const statusOption = computed<EChartsOption>(() => {
  const total = data.orderStatus.reduce((s, r) => s + r.count, 0);
  return {
    color: [SCREEN.glow, SCREEN.primary, SCREEN.amber],
    tooltip: { trigger: 'item', backgroundColor: 'rgba(4,18,43,0.92)', borderColor: SCREEN.glow, textStyle: { color: SCREEN.textStrong } },
    legend: { orient: 'vertical', right: 10, top: 'middle', textStyle: { color: SCREEN.text, fontSize: 15 }, itemGap: 18 },
    title: { text: String(total), subtext: '区间订单', left: '34%', top: '38%', textAlign: 'center',
      textStyle: { color: SCREEN.textStrong, fontSize: 30, fontWeight: 600 }, subtextStyle: { color: SCREEN.muted, fontSize: 13 } },
    series: [
      { type: 'pie', radius: ['76%', '80%'], center: ['35%', '50%'], silent: true, label: { show: false },
        data: [{ value: 1, itemStyle: { color: SCREEN.border } }] },
      { type: 'pie', radius: ['52%', '68%'], center: ['35%', '50%'], label: { show: false }, stillShowZeroSum: false,
        itemStyle: { borderColor: SCREEN.bg, borderWidth: 3 },
        data: data.orderStatus.map((r) => ({ name: `${r.label}  ${r.count}`, value: r.count })) },
    ],
  };
});

const customerOption = computed<EChartsOption>(() => {
  const rows = [...data.customerOwedTop].reverse();
  return {
    grid: { left: 8, right: 70, top: 6, bottom: 6, containLabel: true },
    tooltip: { ...tooltipStyle(), trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: rows.map((r) => r.customerName), ...axisStyle(), axisLabel: { color: SCREEN.text, fontSize: 15, width: 110, overflow: 'truncate' } },
    series: [{
      type: 'bar', barWidth: 14, data: rows.map((r) => r.deliveryOwed),
      itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: 'rgba(47,123,255,0.25)' }, { offset: 1, color: SCREEN.glow }] } },
      label: { show: true, position: 'right', color: SCREEN.cyan, fontSize: 14, formatter: (p: any) => shortNum(p.value) },
      showBackground: true, backgroundStyle: { color: 'rgba(18,53,95,0.45)' },
    }],
  };
});

function areaLine(name: string, values: number[], color: string, dashed = false) {
  return {
    name, type: 'line' as const, data: values, smooth: true, symbol: 'circle', symbolSize: 6, showSymbol: values.length <= 31,
    lineStyle: { color, width: 2, type: dashed ? ('dashed' as const) : ('solid' as const) },
    itemStyle: { color },
    areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}55` }, { offset: 1, color: `${color}00` }] } },
  };
}

const outsourceOption = computed<EChartsOption>(() => ({
  grid: { left: 8, right: 30, top: 16, bottom: 4, containLabel: true },
  tooltip: tooltipStyle(),
  xAxis: { type: 'category', data: axisLabels.value, boundaryGap: false, ...axisStyle(), splitLine: { show: false } },
  yAxis: { type: 'value', minInterval: 1, ...axisStyle(), axisLabel: { color: SCREEN.muted, fontSize: 12, formatter: (v: number) => shortNum(v) } },
  series: [areaLine('外发回厂', data.trend.outsource, SCREEN.amber)],
}));

const trendOption = computed<EChartsOption>(() => ({
  grid: { left: 12, right: 36, top: 44, bottom: 6, containLabel: true },
  tooltip: tooltipStyle(),
  legend: { right: 10, top: 0, textStyle: { color: SCREEN.text, fontSize: 15 }, itemWidth: 22 },
  xAxis: { type: 'category', data: axisLabels.value, boundaryGap: false, ...axisStyle(), splitLine: { show: false } },
  yAxis: { type: 'value', minInterval: 1, ...axisStyle(), axisLabel: { color: SCREEN.muted, fontSize: 13, formatter: (v: number) => shortNum(v) } },
  series: [areaLine('成品入库', data.trend.inbound, SCREEN.glow), areaLine('成品出库', data.trend.outbound, SCREEN.amber, true)],
}));

const workshopOption = computed<EChartsOption>(() => ({
  grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
  tooltip: { ...tooltipStyle(), axisPointer: { type: 'shadow' } },
  xAxis: { type: 'category', data: data.workshopOutput.map((r) => r.workshop), ...axisStyle(), axisLabel: { color: SCREEN.text, fontSize: 14, interval: 0 } },
  yAxis: { type: 'value', minInterval: 1, ...axisStyle(), axisLabel: { color: SCREEN.muted, fontSize: 12, formatter: (v: number) => shortNum(v) } },
  series: [{
    type: 'bar', barMaxWidth: 26, data: data.workshopOutput.map((r) => r.qty),
    itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: SCREEN.glow }, { offset: 1, color: 'rgba(47,123,255,0.15)' }] } },
    label: { show: true, position: 'top', color: SCREEN.cyan, fontSize: 13, formatter: (p: any) => shortNum(p.value) },
  }],
}));

/* ---------------- 滚动列表 ---------------- */
const overdueRef = ref<HTMLElement>();
const outsourceRef = ref<HTMLElement>();
const overdueScroll = useAutoScroll(() => overdueRef.value, { speed: 22, holdMs: 2000 });
const outsourceScroll = useAutoScroll(() => outsourceRef.value, { speed: 22, holdMs: 2000 });
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------------- 生命周期 ---------------- */
let clockTimer: ReturnType<typeof setInterval> | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
function onVisible() {
  if (document.visibilityState === 'visible') load();
}

onMounted(() => {
  document.title = title;
  document.documentElement.classList.add('sv-no-scroll');
  takeKeyFromHash();
  fit();
  window.addEventListener('resize', fit);
  clockTimer = setInterval(() => (now.value = new Date()), 1000);
  // 页面不可见时跳过刷新（后台标签页白跑查询），切回来立即补一次
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') load();
  }, REFRESH_MS);
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  if (!reduceMotion) {
    overdueScroll.start();
    outsourceScroll.start();
  }
  load();
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove('sv-no-scroll');
  window.removeEventListener('resize', fit);
  document.removeEventListener('visibilitychange', onVisible);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  clearInterval(clockTimer);
  clearInterval(refreshTimer);
});
</script>

<style scoped lang="scss">
.sv {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #020a1a;
  color: #cfe6ff;
  font-family: 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif;
}
.sv__canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  padding: 0 24px 16px;
  box-sizing: border-box;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(47, 123, 255, 0.28), transparent 55%),
    linear-gradient(rgba(29, 79, 143, 0.12) 1px, transparent 1px) 0 0 / 40px 40px,
    linear-gradient(90deg, rgba(29, 79, 143, 0.12) 1px, transparent 1px) 0 0 / 40px 40px,
    #030d22;
}

/* ---- 标题栏 ---- */
.sv__head {
  position: relative;
  height: 96px;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.sv__head-side {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
  padding-top: 22px;
  &--right { justify-content: flex-end; }
}
.sv__clock {
  font-size: 22px;
  color: #5fe3ff;
  font-family: 'DIN Alternate', 'Bahnschrift', Consolas, monospace;
  letter-spacing: 1px;
}
.sv__muted { color: #6f93bf; font-size: 15px; }
.sv__title-wrap {
  /* 绝对居中：两侧控件宽度怎么变都不会把标题推偏（原 grid 1fr 列会被右侧控件撑宽） */
  position: absolute;
  left: 50%;
  top: 0;
  width: 600px;
  height: 90px;
  transform: translateX(-50%);
}
.sv__title-deco { position: absolute; inset: 0; width: 100%; height: 100%; }
.sv__scan { animation: sv-scan 4s ease-in-out infinite alternate; }
@keyframes sv-scan {
  from { transform: translateX(0); }
  to { transform: translateX(500px); }
}
.sv__title {
  position: relative;
  margin: 0;
  padding-top: 14px;
  text-align: center;
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 8px;
  /* 底色压成浅天蓝而不是近白：光影是白色亮带，底字太白就看不出有东西掠过 */
  color: #9fd8ff;
  text-shadow: 0 0 14px rgba(63, 208, 255, 0.85), 0 0 2px rgba(255, 255, 255, 0.6);

  /*
   * 光影掠过：同一行字再叠一层，只在一条斜向亮带里可见（background-clip: text），
   * 亮带从左往右匀速扫过，扫出右侧后**立即**从左侧重新进入（linear + infinite，无停顿）。
   * 背景图是文字宽度的 2.5 倍、亮带在图正中：position 100% 时亮带在文字左外侧、0% 时在右外侧，
   * 首尾两帧都看不见亮带，所以循环衔接处不会闪。
   */
  &::after {
    content: attr(data-text);
    position: absolute;
    inset: 0;
    padding: inherit;
    color: transparent;
    text-shadow: none;
    pointer-events: none;
    background: linear-gradient(
      105deg,
      transparent 0%,
      transparent 42%,
      rgba(255, 255, 255, 0.55) 46%,
      #fff 50%,
      rgba(255, 255, 255, 0.55) 54%,
      transparent 58%,
      transparent 100%
    );
    filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.85));
    background-size: 250% 100%;
    background-repeat: no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    animation: sv-shine 3.2s linear infinite;
  }
}
@keyframes sv-shine {
  from { background-position: 100% 0; }
  to { background-position: 0% 0; }
}

/* ---- 时间范围 ---- */
.sv__range { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.sv__range-btn {
  flex-shrink: 0;
  height: 32px;
  padding: 0 9px;
  white-space: nowrap;
  font-size: 14px;
  color: #9cc4ee;
  background: rgba(6, 28, 61, 0.8);
  border: 1px solid #1d4f8f;
  cursor: pointer;
  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  &:hover { color: #e6f6ff; border-color: #3fd0ff; }
  &.is-active {
    color: #04122b;
    background: linear-gradient(#5fe3ff, #2f9bff);
    border-color: #5fe3ff;
    font-weight: 600;
  }
}
.sv__fs-btn {
  flex-shrink: 0;
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  font-size: 15px;
  white-space: nowrap;
  color: #9cc4ee;
  background: rgba(6, 28, 61, 0.8);
  border: 1px solid #1d4f8f;
  cursor: pointer;
  &:hover { color: #e6f6ff; border-color: #3fd0ff; box-shadow: 0 0 8px rgba(63, 208, 255, 0.45); }
}
/* EP 的区间框宽度由 --el-date-editor-daterange-width（缺省 350px）决定，直接写 width 盖不住 */
.sv__range :deep(.el-date-editor--daterange) {
  --el-date-editor-daterange-width: 236px;
  flex-shrink: 0;
  margin-left: 6px;
}
:deep(.sv__picker.el-date-editor) {
  --el-input-bg-color: rgba(6, 28, 61, 0.8);
  --el-input-border-color: #1d4f8f;
  --el-input-hover-border-color: #3fd0ff;
  --el-input-text-color: #cfe6ff;
  --el-text-color-regular: #cfe6ff;
  height: 32px;
  box-shadow: 0 0 0 1px #1d4f8f inset;
  background: rgba(6, 28, 61, 0.8);
  .el-range-input { background: transparent; color: #cfe6ff; font-size: 14px; }
  .el-range-separator { color: #6f93bf; padding: 0 2px; }
  /* 日历小图标省掉：右上角与居中标题之间只剩 ~630px，7 个预设 + 日期框要挤进去 */
  .el-range__icon { display: none; }
  padding: 0 8px;
}
:deep(.sv__picker.is-active.el-date-editor) { box-shadow: 0 0 0 1px #5fe3ff inset, 0 0 8px rgba(63, 208, 255, 0.5); }

/* ---- 指标卡 ---- */
.sv__kpis {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  margin: 6px 0 16px;
}
.sv__kpi {
  position: relative;
  height: 104px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: linear-gradient(180deg, rgba(15, 58, 122, 0.55), rgba(6, 28, 61, 0.75));
  border: 1px solid #1d4f8f;
  clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%, 0 14px);
  &::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    width: 60%;
    height: 2px;
    transform: translateX(-50%);
    background: linear-gradient(90deg, transparent, #3fd0ff, transparent);
  }
}
.sv__kpi-label { font-size: 17px; color: #9cc4ee; letter-spacing: 1px; }
.sv__kpi-val {
  font-size: 40px;
  line-height: 1.1;
  font-weight: 600;
  color: #5fe3ff;
  font-family: 'DIN Alternate', 'Bahnschrift', Consolas, monospace;
  text-shadow: 0 0 12px rgba(95, 227, 255, 0.6);
}
.sv__kpi-tag { font-size: 12px; color: #6f93bf; }
.sv__kpi--amber .sv__kpi-val { color: #ffc35a; text-shadow: 0 0 12px rgba(255, 195, 90, 0.5); }
.sv__kpi--red .sv__kpi-val { color: #ff6b6b; text-shadow: 0 0 12px rgba(255, 107, 107, 0.5); }
.sv__kpi--green .sv__kpi-val { color: #34e3a4; text-shadow: 0 0 12px rgba(52, 227, 164, 0.5); }

/* ---- 主体 ---- */
.sv__main {
  flex: 1;
  min-height: 0;
  display: grid;
  /* 按比例分宽：宽屏时两侧也跟着变宽，不会只把中间拉长 */
  grid-template-columns: minmax(0, 26fr) minmax(0, 48fr) minmax(0, 26fr);
  gap: 16px;
}
.sv__col {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  > * { flex: 1 1 0; }
}
.sv__p-flow { flex: 45 1 0; }
.sv__p-trend { flex: 55 1 0; }

/* ---- 滚动列表 ---- */
.sv__list-head,
.sv__list-row {
  display: grid;
  grid-template-columns: 1.1fr 2fr 0.8fr 0.7fr;
  gap: 8px;
  align-items: center;
  font-size: 15px;
  > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span:nth-child(n + 3) { text-align: right; }
}
.sv__list-head {
  height: 32px;
  padding: 0 10px;
  color: #7fdcff;
  background: rgba(47, 123, 255, 0.18);
  border-bottom: 1px solid #1d4f8f;
}
.sv__list {
  position: absolute;
  inset: 32px 0 0;
  overflow: hidden;
}
.sv__list-row {
  height: 36px;
  padding: 0 10px;
  border-bottom: 1px dashed #12355f;
  &:nth-child(even) { background: rgba(18, 53, 95, 0.28); }
}
.sv__red { color: #ff6b6b; }
.sv__amber { color: #ffc35a; }
.sv__empty {
  height: 100%;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6f93bf;
  font-size: 16px;
}

.sv__nodata {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 8px 18px;
  font-size: 15px;
  color: #9cc4ee;
  white-space: nowrap;
  background: rgba(3, 13, 34, 0.85);
  border: 1px dashed #1d4f8f;
  pointer-events: none;
}

/* ---- 底部 ---- */
.sv__foot {
  flex-shrink: 0;
  height: 40px;
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 28px;
  font-size: 16px;
  white-space: nowrap;
  b { color: #5fe3ff; font-size: 20px; margin: 0 2px; }
}
.sv__foot-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, #1d4f8f, transparent); }
.sv__foot-bar { width: 60px; height: 4px; background: repeating-linear-gradient(90deg, #3fd0ff 0 10px, transparent 10px 14px); }

/* ---- 访问门 ---- */
.sv__gate { flex: 1; display: flex; align-items: center; justify-content: center; }
.sv__gate-panel { width: 720px; flex: none; }
.sv__gate-msg { font-size: 20px; line-height: 1.7; margin: 8px 0 20px; }
.sv__gate-form { display: flex; gap: 12px; }
.sv__gate-input {
  flex: 1;
  height: 42px;
  padding: 0 14px;
  font-size: 18px;
  color: #e6f6ff;
  background: rgba(3, 13, 34, 0.9);
  border: 1px solid #1d4f8f;
  outline: none;
  &:focus { border-color: #3fd0ff; box-shadow: 0 0 8px rgba(63, 208, 255, 0.5); }
}
.sv__gate-form .sv__range-btn { height: 42px; font-size: 18px; padding: 0 24px; }
.sv__gate-err { color: #ff6b6b; font-size: 16px; margin: 12px 0 0; }

@media (prefers-reduced-motion: reduce) {
  .sv__scan { animation: none; }
  .sv__title::after { animation: none; display: none; }
}
</style>

<style lang="scss">
/*
 * 大屏页不允许文档滚动（兜底）：画布本身按视口铺满，文档出现滚动只可能是弹层之类溢出。
 * 一旦冒出滚动条，它会吃掉视口高度，整块画布看着像上移（日期面板曾因全局 tooltip 限宽
 * 被压窄而溢出，根因已在 styles/index.scss 修掉，见那里的注释）。
 */
html.sv-no-scroll,
html.sv-no-scroll body {
  overflow: hidden;
}

/* 日期面板 teleport 到 body，scoped 管不到：深色化以免在大屏上弹出一块刺眼的白板 */
.sv-picker-popper.el-popper,
.sv-picker-popper .el-picker-panel,
.sv-picker-popper .el-date-range-picker,
.sv-picker-popper .el-date-picker {
  --el-bg-color-overlay: #061c3d;
  --el-border-color-light: #1d4f8f;
  --el-text-color-regular: #cfe6ff;
  --el-text-color-primary: #e6f6ff;
  --el-datepicker-text-color: #cfe6ff;
  --el-datepicker-header-text-color: #e6f6ff;
  --el-datepicker-inrange-bg-color: rgba(47, 123, 255, 0.3);
  --el-datepicker-inrange-hover-bg-color: rgba(47, 123, 255, 0.45);
  --el-datepicker-border-color: #1d4f8f;
  --el-fill-color-light: rgba(47, 123, 255, 0.2);
  --el-color-primary: #3fd0ff;
  --el-datepicker-active-color: #3fd0ff;
  --el-datepicker-hover-text-color: #5fe3ff;
  --el-datepicker-off-text-color: #4f6f99;
  --el-datepicker-icon-color: #9cc4ee;
  --el-datepicker-inner-border-color: #1d4f8f;
}
.sv-picker-popper .el-picker-panel {
  color: #cfe6ff;
  background: #061c3d;
}
/* 起止日两端格子与区间同色，选中圆点文字用深色压在亮青底上 */
.sv-picker-popper .el-date-table td.start-date .el-date-table-cell,
.sv-picker-popper .el-date-table td.end-date .el-date-table-cell {
  background-color: rgba(47, 123, 255, 0.3);
}
.sv-picker-popper .el-date-table td.start-date .el-date-table-cell__text,
.sv-picker-popper .el-date-table td.end-date .el-date-table-cell__text {
  color: #04122b;
  font-weight: 600;
}
.sv-picker-popper .el-date-table td.disabled .el-date-table-cell {
  background-color: transparent;
  color: #3a5478;
}
.sv-picker-popper .el-date-range-picker__content.is-left {
  border-right-color: #1d4f8f;
}
</style>
