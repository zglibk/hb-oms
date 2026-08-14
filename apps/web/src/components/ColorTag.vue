<template>
  <span class="color-tag" :style="tagStyle"><slot>{{ seed }}</slot></span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { seededTagColor } from '@/utils/theme';

/**
 * 内容标签：颜色在主题主色基础上、按文本内容随机分配（同文本颜色稳定）。
 * 用于人员、部门、类别等「需要区分、但没有固定语义色」的内容标签，
 * 避免全部呈现单一主题色，同时保证同一内容在各页面保持相同颜色。
 *
 * ⚠️ **不要改回 el-tag**（2026-08-14）：el-tag 是 `inline-flex` + 固定 `height`
 * + `vertical-align: middle`，**参与行盒高度计算**。本机上 20px 的标签正好塞进
 * 表格单元格 23px 的行盒、不撑高；换一台机器字体度量稍有出入，行盒就被顶到
 * 24~25px，表格行高从 32 涨到 33~34——首页三张待办表按「表头 34 + 10 行 × 32」
 * 定死了 max-height，10 行正好溢出几像素，`useAutoScroll` 于是不停地滚几像素、
 * 到底、跳回顶部，看着就是列表在反复抖动（使用方实测反馈）。
 *
 * 现在用**纯内联元素 + 完全继承字号行高**，两条缺一不可：
 *   1. `display: inline`——按 CSS 规范，非替换内联元素的**垂直 padding 与边框
 *      不参与行盒高度计算**；
 *   2. **字号与行高一律 inherit**——只做到第 1 条还不够：标签若用自己的字号
 *      （原来写死 12px），它与周围文字**基线不同**，两个内联盒按基线对齐后的并集
 *      仍会比行盒高出 1~2px（实测：单元格字号 14px 时行盒 23→24，16px 时 →25，
 *      对应表格行高 32→33/34，10 行就溢出 10~20px 开始抖）。继承之后标签与正文
 *      共用同一条基线、同一个行盒，只是多画了背景和边框。
 *
 * 所以**别给它加** `display: inline-block/inline-flex`、`height`、`line-height`
 * 或独立 `font-size`——每一样都会让行高重新变得依赖字体度量。
 */
const props = withDefaults(
  defineProps<{
    /** 决定颜色的种子（通常即标签文本）；默认取插槽显示文本 */
    seed: string;
    /**
     * 保留入参以兼容既有调用（28 处），但**刻意不再改变字号**——
     * 独立字号会让标签与正文基线错开、重新把行撑高（见组件头注释第 2 条）。
     */
    size?: 'large' | 'default' | 'small';
  }>(),
  { size: 'small' },
);

const theme = useThemeStore();

const tagStyle = computed(() => {
  const c = seededTagColor(props.seed, theme.primaryColor);
  return {
    '--tag-bg': c.bg,
    '--tag-border': c.border,
    '--tag-text': c.text,
  };
});
</script>

<style scoped>
/*
 * display:inline + 字号行高全继承，是本组件「不撑高行」的两条核心约束，
 * 理由见上方组件注释。改这里前先读那段。
 */
.color-tag {
  display: inline;
  padding: 1px 6px;
  border: 1px solid var(--tag-border);
  border-radius: 3px;
  background: var(--tag-bg);
  color: var(--tag-text);
  font-size: inherit;
  line-height: inherit;
  white-space: nowrap;
}
</style>
