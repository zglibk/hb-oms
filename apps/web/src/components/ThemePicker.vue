<template>
  <span class="theme-trigger" title="切换主题色" @click="visible = true">
    <el-icon><Brush /></el-icon>
    <span class="theme-trigger__label">更换主题</span>
  </span>

  <el-drawer
    v-model="visible"
    title="主题设置"
    direction="rtl"
    :size="300"
    :close-on-click-modal="true"
    class="theme-drawer"
  >
    <div class="theme-panel">
      <div class="theme-panel__title">主题色</div>
      <div class="theme-swatches">
        <span
          v-for="c in PRESET_COLORS"
          :key="c.value"
          class="theme-swatch"
          :class="{ active: isActive(c.value) }"
          :style="{ background: c.value }"
          :title="c.label"
          @click="select(c.value)"
        >
          <el-icon v-if="isActive(c.value)"><Check /></el-icon>
        </span>
      </div>

      <div class="theme-panel__row">
        <span class="theme-panel__label">自定义颜色</span>
        <el-color-picker
          :model-value="themeStore.primaryColor"
          :predefine="presetValues"
          @change="onCustomChange"
        />
      </div>

      <div class="theme-panel__footer">
        <el-button text size="small" @click="themeStore.resetPrimaryColor()">
          恢复默认
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { PRESET_COLORS } from '@/utils/theme';

const themeStore = useThemeStore();
const presetValues = PRESET_COLORS.map((c) => c.value);
const visible = ref(false);

function isActive(value: string) {
  return themeStore.primaryColor.toUpperCase() === value.toUpperCase();
}

function select(value: string) {
  themeStore.setPrimaryColor(value);
}

function onCustomChange(value: string | null) {
  if (value) themeStore.setPrimaryColor(value);
}
</script>

<!-- 触发按钮位于组件内联渲染，使用 scoped 样式 -->
<style scoped lang="scss">
.theme-trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  color: inherit;
  /* 与顶栏文档/更新日志按钮同档字号 */
  font-size: var(--hb-font-size-xs);
  font-weight: 400;
  height: var(--hb-header-control-size);
  padding: 0 0.75rem;
  border-radius: 0.5rem;
  transition:
    color 0.25s cubic-bezier(0.22, 0.61, 0.36, 1),
    background 0.25s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);

  .el-icon {
    font-size: 0.8125rem;
    transition: transform 0.25s cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  &__label {
    line-height: 1;
  }
  /* 底部主色刻线，与导航栏其他按钮统一 */
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 4px;
    width: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--el-color-primary);
    transform: translateX(-50%);
    transition: width 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  &:hover {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    &::after {
      width: 60%;
    }
    .el-icon {
      /* 画笔图标：轻摇涂刷感 */
      transform: rotate(-12deg) scale(1.1);
    }
  }
  &:active {
    transform: scale(0.96);
  }
}
</style>

<!-- 抽屉内容被 teleport 到 body，需用非 scoped 样式并以 class 限定作用域 -->
<style lang="scss">
.theme-drawer {
  .theme-panel__title {
    font-size: 13px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 12px;
  }
  .theme-panel__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color-lighter);
  }
  .theme-panel__label {
    font-size: 13px;
    color: #606266;
  }
  .theme-panel__footer {
    margin-top: 20px;
    text-align: right;
  }

  .theme-swatches {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .theme-swatch {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08) inset;
    transition: transform 0.15s;

    &:hover {
      transform: scale(1.08);
    }
    &.active {
      box-shadow:
        0 0 0 2px #fff inset,
        0 0 0 3px currentColor;
    }
    .el-icon {
      font-size: 18px;
    }
  }
}

/* 手机端：抽屉宽度收窄为 70vw，避免遮挡过多主页面 */
@media (max-width: 767.98px) {
  .theme-drawer.el-drawer {
    width: 70vw !important;
  }
}
</style>
