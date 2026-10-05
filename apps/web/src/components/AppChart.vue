<template>
  <div ref="chartRef" :style="{ width: '100%', height }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

const props = withDefaults(
  defineProps<{
    option: EChartsOption;
    height?: string;
  }>(),
  { height: '300px' },
);

const chartRef = ref<HTMLElement>();
let chart: echarts.ECharts | null = null;

const resize = () => chart?.resize();
/**
 * 观察容器自身尺寸而不是 window resize：容器可能因父级布局变化而变尺寸（如数据大屏按视口
 * 重算画布逻辑宽高），window resize 回调里 DOM 还没按新尺寸重排，量到的是旧尺寸。
 */
let observer: ResizeObserver | null = null;

onMounted(() => {
  nextTick(() => {
    if (!chartRef.value) return;
    chart = echarts.init(chartRef.value);
    chart.setOption(props.option);
    observer = new ResizeObserver(resize);
    observer.observe(chartRef.value);
  });
});

watch(
  () => props.option,
  (opt) => chart?.setOption(opt, true),
  { deep: true },
);

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>
