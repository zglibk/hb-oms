<!--
  查询条件区的「更多」开关（2026-09-25，订单跟踪台账与产品汇总共用）。

  用法：常用条件固定一行、放在第一个 el-form 里，本按钮放在该行末尾的按钮组中；
  其余条件放进紧随其后的第二个 el-form，加 class="filter-bar filter-more" 并 v-show 绑定同一个开关，
  外面包一层 <Transition name="filter-more-fade">（只做淡入淡出，**不要用 el-collapse-transition**，
  它逐帧改高度，会拖着下方大表格逐帧重排而卡顿）。虚线分隔与过渡样式在全局 styles/index.scss。

  count = 折叠区里当前生效的条件个数：**收起时**显示在按钮上（如「更多（2）」），
  避免「列表被隐藏条件筛过却不自知」；展开时条件就在眼前，不再显示。
-->
<script setup lang="ts">
import { ArrowDown } from '@element-plus/icons-vue';

defineProps<{ count?: number }>();
const open = defineModel<boolean>({ default: false });
</script>

<template>
  <el-button size="small" link type="primary" class="filter-more-toggle" :aria-expanded="open" @click="open = !open">
    更多<template v-if="!open && count">（{{ count }}）</template>
    <el-icon class="filter-more-toggle__icon" :class="{ 'is-open': open }"><ArrowDown /></el-icon>
  </el-button>
</template>

<style scoped lang="scss">
.filter-more-toggle {
  margin-left: 4px;
  &__icon {
    margin-left: 2px;
    transition: transform 0.2s ease;
    &.is-open { transform: rotate(180deg); }
  }
}
</style>
