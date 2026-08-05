/**
 * 主题色工具
 * ------------------------------------------------------------
 * Element Plus 的主色由一组 CSS 变量控制：
 *   --el-color-primary            主色
 *   --el-color-primary-light-{1-9} 主色与白色按 10%~90% 混合的浅色梯度
 *   --el-color-primary-dark-2     主色与黑色按 20% 混合的深色
 * 切换主题色即动态生成上述变量并写入 :root。
 */

/**
 * 预设主题色
 * ------------------------------------------------------------
 * 围绕「五金滑轨制造 · 订单管理」场景设计：
 * - 整体偏工业冷调，饱和度适中，降低长时间盯屏的视觉疲劳；
 * - 蓝色系占比更高（钢蓝/钛钢蓝/钴蓝/默认蓝），契合制造业稳重气质；
 * - 工程橙作五金工具联想的强调色，钢铁灰作中性工业灰兜底。
 */
export const PRESET_COLORS = [
  { label: '钢蓝', value: '#2563EB' },
  { label: '钛钢蓝', value: '#4A6FA5' },
  { label: '钴蓝', value: '#1E3A8A' },
  { label: '默认蓝', value: '#409EFF' },
  { label: '工程橙', value: '#C2410C' },
  { label: '主题绿', value: '#13A67D' },
  { label: '钢铁灰', value: '#475569' },
  { label: '墨黑', value: '#303133' },
];

/** 默认主题色：钢蓝（饱和度低于原 #1E5EFF，长时间阅读更舒适） */
export const DEFAULT_COLOR = '#2563EB';

const WHITE = '#FFFFFF';
const BLACK = '#000000';

/** 将 #RGB / #RRGGBB 解析为 [r,g,b] */
function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** [r,g,b] → #RRGGBB */
function toHex([r, g, b]: [number, number, number]): string {
  const to2 = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

/**
 * 按权重混合两种颜色。
 * weight 为 color2 的占比（0~1），与 Element Plus 内部 mix 规则一致。
 */
function mix(color1: string, color2: string, weight: number): string {
  const c1 = parseHex(color1);
  const c2 = parseHex(color2);
  const result = c1.map((v, i) => v * (1 - weight) + c2[i] * weight) as [
    number,
    number,
    number,
  ];
  return toHex(result);
}

/** 校验是否为合法 16 进制颜色 */
export function isValidHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((color || '').trim());
}

/** hex → [h(0-360), s(0-100), l(0-100)] */
function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s * 100, l * 100];
}

/** 字符串哈希 → 非负整数（用于把标签文本稳定映射到某个颜色） */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface TagColorStyle {
  /** 背景色 */
  bg: string;
  /** 文字色 */
  text: string;
  /** 边框色 */
  border: string;
}

/**
 * 基于主题主色与种子字符串，生成一个「和谐但各不相同」的标签配色。
 * - 以主题主色的色相为基准，按种子哈希做黄金角（137.5°）色相偏移：
 *   同一文本颜色稳定不变，不同文本颜色区分度高；
 * - 饱和度取自主题色（并设下限，避免灰色主题下标签变灰）；
 * - 整体色相随主题主色改变而整体旋转，做到「在主题色基础上随机」。
 */
export function seededTagColor(seed: string, primary: string): TagColorStyle {
  const base = isValidHexColor(primary) ? primary : DEFAULT_COLOR;
  const [h0, s0] = hexToHsl(base);
  const hash = hashString(seed || 'tag');
  const hue = (((h0 + hash * 137.508) % 360) + 360) % 360;
  const sat = Math.min(85, Math.max(55, s0));
  return {
    bg: `hsl(${hue}, ${sat}%, 93%)`,
    text: `hsl(${hue}, ${Math.min(90, sat + 5)}%, 34%)`,
    border: `hsl(${hue}, ${sat}%, 80%)`,
  };
}

/**
 * 应用主题色：生成并写入 Element Plus 主色相关 CSS 变量。
 * @param color 合法的 16 进制颜色，非法时回退到默认色
 */
export function applyThemeColor(color: string): void {
  const primary = isValidHexColor(color) ? color.toUpperCase() : DEFAULT_COLOR;
  const root = document.documentElement;

  root.style.setProperty('--el-color-primary', primary);

  // 浅色梯度 light-1 ~ light-9（与白色混合）
  for (let i = 1; i <= 9; i++) {
    root.style.setProperty(
      `--el-color-primary-light-${i}`,
      mix(primary, WHITE, i * 0.1),
    );
  }

  // 深色 dark-2（与黑色混合）
  root.style.setProperty('--el-color-primary-dark-2', mix(primary, BLACK, 0.2));

  // ---- 侧边栏配色：固定深色系（经典后台风格，不随主题主色整体变色）----
  // 深色侧栏长时间使用更耐看；切换主题色只影响选中高亮与 Element 主色，
  // 侧栏底色保持稳定的深蓝灰。
  root.style.setProperty('--sidebar-bg', '#1F2A3A');
  // Logo 区更深一档，与菜单区形成视觉分隔
  root.style.setProperty('--sidebar-logo-bg', '#151D2A');
  // 二三级子菜单容器：略深，体现层级关系
  root.style.setProperty('--sidebar-submenu-bg', '#19222F');
  // 悬停：比底色略亮，提供反馈
  root.style.setProperty('--sidebar-hover-bg', '#2A3547');
  // 选中项：主题主色实心块 + 白字（唯一跟随主题色的侧栏元素）
  root.style.setProperty('--sidebar-active-bg', primary);

  // 列表表头 / 隔行灰在 styles/index.scss :root 硬编码，不随主题色变化
}
