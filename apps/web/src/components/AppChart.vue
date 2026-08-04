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

onMounted(() => {
  nextTick(() => {
    if (!chartRef.value) return;
    chart = echarts.init(chartRef.value);
    chart.setOption(props.option);
    window.addEventListener('resize', resize);
  });
});

watch(
  () => props.option,
  (opt) => chart?.setOption(opt, true),
  { deep: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  chart?.dispose();
  chart = null;
});
</script>
