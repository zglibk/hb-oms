/**
 * 数据大屏配色与 ECharts 公共选项（蓝色科幻主题）。
 * 大屏是固定深色画布，**不跟随系统主题色**——车间电视远看要的是高对比，不是品牌色。
 */
export const SCREEN = {
  bg: '#030d22',
  panel: 'rgba(6, 28, 61, 0.78)',
  border: '#1d4f8f',
  glow: '#3fd0ff',
  primary: '#2f7bff',
  cyan: '#5fe3ff',
  text: '#cfe6ff',
  textStrong: '#e6f6ff',
  muted: '#6f93bf',
  grid: '#12355f',
  amber: '#ffc35a',
  red: '#ff6b6b',
  green: '#34e3a4',
} as const;

/** 坐标轴通用样式 */
export function axisStyle() {
  return {
    axisLine: { lineStyle: { color: SCREEN.border } },
    axisTick: { show: false },
    axisLabel: { color: SCREEN.muted, fontSize: 13 },
    splitLine: { lineStyle: { color: SCREEN.grid, type: 'dashed' as const } },
  };
}

export function tooltipStyle() {
  return {
    trigger: 'axis' as const,
    backgroundColor: 'rgba(4, 18, 43, 0.92)',
    borderColor: SCREEN.glow,
    textStyle: { color: SCREEN.textStrong, fontSize: 13 },
  };
}

/** 数字显示：≥1 万显示「x.xx万」，大屏格子窄，六七位数挤不下 */
export function shortNum(v: number): string {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(2).replace(/\.?0+$/, '')}万`;
  return n.toLocaleString('zh-CN');
}
