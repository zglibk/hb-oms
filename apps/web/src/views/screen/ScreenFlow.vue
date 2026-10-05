<!--
  业务主线流转：订单 → 外发 → 装配 → 入库 → 出库，六边形节点 + 流动光带。
  节点下方是区间内各环节的量（支）；外发计的是零件支数（一套三节轨 = 3 个零件），
  与其余四个整轨支数不是一个计量对象，节点旁特意注明（同台账「部件 / 成品」分栏的理由）。
-->
<template>
  <svg class="sf" viewBox="0 0 860 300" role="img" aria-label="业务主线流转">
    <defs>
      <linearGradient id="sf-line" x1="0" x2="1">
        <stop offset="0" stop-color="#2f7bff" stop-opacity="0.2" />
        <stop offset="0.5" stop-color="#3fd0ff" />
        <stop offset="1" stop-color="#2f7bff" stop-opacity="0.2" />
      </linearGradient>
      <radialGradient id="sf-node" cx="0.5" cy="0.5" r="0.6">
        <stop offset="0" stop-color="#0f3a7a" />
        <stop offset="1" stop-color="#061c3d" />
      </radialGradient>
      <filter id="sf-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <!-- 底轨 + 流动光带 -->
    <path :d="`M${xs[0]} 140 H${xs[xs.length - 1]}`" stroke="#12355f" stroke-width="10" />
    <path :d="`M${xs[0]} 140 H${xs[xs.length - 1]}`" stroke="url(#sf-line)" stroke-width="2" />
    <path class="sf__flow" :d="`M${xs[0]} 140 H${xs[xs.length - 1]}`" stroke="#5fe3ff" stroke-width="4" stroke-dasharray="14 46" filter="url(#sf-glow)" />

    <g v-for="(n, i) in nodes" :key="n.label">
      <!-- 外圈旋转虚线环 -->
      <circle class="sf__ring" :cx="xs[i]" cy="140" r="66" fill="none" stroke="#1d4f8f" stroke-width="1.5" stroke-dasharray="6 8" :style="{ transformOrigin: `${xs[i]}px 140px` }" />
      <polygon :points="hex(xs[i], 140, 54)" fill="url(#sf-node)" stroke="#3fd0ff" stroke-width="2" filter="url(#sf-glow)" />
      <text :x="xs[i]" y="134" text-anchor="middle" class="sf__label">{{ n.label }}</text>
      <text :x="xs[i]" y="160" text-anchor="middle" class="sf__sub">{{ n.sub }}</text>
      <text :x="xs[i]" y="240" text-anchor="middle" class="sf__val" :class="{ 'sf__val--amber': n.amber }">{{ shortNum(n.value) }}</text>
      <text :x="xs[i]" y="266" text-anchor="middle" class="sf__unit">{{ n.unit }}</text>
    </g>

    <text x="430" y="34" text-anchor="middle" class="sf__rate">
      完成率 <tspan class="sf__rate-num">{{ completionRate }}%</tspan>
      <tspan dx="28">发货率 </tspan><tspan class="sf__rate-num">{{ deliveryRate }}%</tspan>
      <tspan dx="12" class="sf__rate-note">（进行中订单 · 实时）</tspan>
    </text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { shortNum } from './theme';

const props = defineProps<{
  orderQty: number;
  outsourceReturned: number;
  assembled: number;
  inbound: number;
  outbound: number;
  completionRate: number;
  deliveryRate: number;
}>();

const xs = [90, 260, 430, 600, 770];

const nodes = computed(() => [
  { label: '订单', sub: 'ORDER', value: props.orderQty, unit: '下单 · 成品支' },
  { label: '外发', sub: 'OUTSOURCE', value: props.outsourceReturned, unit: '回厂 · 零件支', amber: true },
  { label: '装配', sub: 'ASSEMBLY', value: props.assembled, unit: '完成 · 成品支' },
  { label: '入库', sub: 'INBOUND', value: props.inbound, unit: '入库 · 成品支' },
  { label: '出库', sub: 'OUTBOUND', value: props.outbound, unit: '发货 · 成品支' },
]);

/** 尖顶六边形顶点 */
function hex(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}
</script>

<style scoped lang="scss">
.sf {
  display: block;
  width: 100%;
  height: 100%;
}
.sf__flow {
  animation: sf-flow 2.4s linear infinite;
}
.sf__ring {
  animation: sf-spin 18s linear infinite;
}
@keyframes sf-flow {
  to { stroke-dashoffset: -60; }
}
@keyframes sf-spin {
  to { transform: rotate(360deg); }
}
.sf__label { fill: #e6f6ff; font-size: 22px; font-weight: 600; letter-spacing: 2px; }
.sf__sub { fill: #6f93bf; font-size: 11px; letter-spacing: 1px; }
.sf__val { fill: #5fe3ff; font-size: 30px; font-weight: 600; font-family: 'DIN Alternate', 'Bahnschrift', Consolas, monospace; }
.sf__val--amber { fill: #ffc35a; }
.sf__unit { fill: #6f93bf; font-size: 13px; }
.sf__rate { fill: #cfe6ff; font-size: 17px; }
.sf__rate-num { fill: #5fe3ff; font-weight: 600; font-size: 22px; }
.sf__rate-note { fill: #6f93bf; font-size: 13px; }

@media (prefers-reduced-motion: reduce) {
  .sf__flow,
  .sf__ring { animation: none; }
}
</style>
