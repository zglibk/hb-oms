<template>
  <div class="login-bg-trigger-wrap">
    <el-popover
      v-model:visible="visible"
      placement="top-end"
      :width="300"
      trigger="click"
      popper-class="login-bg-popper"
    >
      <template #reference>
        <button class="login-bg-trigger" title="切换登录页背景" type="button">
          <el-icon><Picture /></el-icon>
        </button>
      </template>

      <div class="login-bg-panel">
        <div class="login-bg-panel__title">登录页背景</div>
        <div class="login-bg-grid">
          <!-- 全部方案：1 系统默认 + 4 预置 SVG -->
          <div
            v-for="s in LOGIN_BG_SCHEMES"
            :key="s.id"
            class="login-bg-swatch"
            :class="{ active: themeStore.loginBgScheme === s.id }"
            :style="swatchStyle(s)"
            :title="s.name"
            @click="onSelect(s.id)"
          >
            <span class="login-bg-swatch__name">{{ s.name }}</span>
            <el-icon v-if="themeStore.loginBgScheme === s.id" class="login-bg-swatch__check">
              <Check />
            </el-icon>
          </div>
        </div>

        <div class="login-bg-panel__footer">
          <el-button text size="small" @click="themeStore.resetLoginBg()">
            恢复默认
          </el-button>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Picture, Check } from '@element-plus/icons-vue';
import { useThemeStore } from '@/stores/theme';
import { LOGIN_BG_SCHEMES, type LoginBgScheme } from '@/constants/login-bg';

const themeStore = useThemeStore();
const visible = ref(false);

function onSelect(id: string) {
  themeStore.setLoginBg(id);
  visible.value = false;
}

function swatchStyle(s: LoginBgScheme): Record<string, string> {
  const t = s.thumbnail;
  return { backgroundImage: t.startsWith('linear') ? t : `url(${t})` };
}
</script>

<!-- 触发按钮位于登录页右下角 -->
<style scoped lang="scss">
.login-bg-trigger-wrap {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 10;
}
.login-bg-trigger {
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  color: #41a881;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
  .el-icon { font-size: 20px; }
  &:hover { transform: scale(1.08); box-shadow: 0 6px 16px rgba(0,0,0,0.2); }
  &:active { transform: scale(0.96); }
}
</style>

<!-- el-popover 被 teleport 到 body，用非 scoped 全局样式以 popper-class 限定 -->
<style lang="scss">
.login-bg-popper {
  .login-bg-panel__title {
    font-size: 13px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 12px;
  }
  .login-bg-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .login-bg-swatch {
    position: relative;
    height: 70px;
    border-radius: 8px;
    cursor: pointer;
    background-size: cover;
    background-position: center;
    overflow: hidden;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.08) inset;
    transition: transform 0.15s, box-shadow 0.15s;
    &:hover { transform: scale(1.03); }
    &.active {
      box-shadow: 0 0 0 2px #fff inset, 0 0 0 3px var(--el-color-primary);
    }
  }
  .login-bg-swatch__name {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    padding: 4px 6px;
    font-size: 12px;
    color: #fff;
    text-align: center;
    background: linear-gradient(to top, rgba(0,0,0,0.55), transparent);
  }
  .login-bg-swatch__check {
    position: absolute;
    top: 4px; right: 4px;
    width: 18px; height: 18px;
    border-radius: 50%;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 12px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 2px #fff;
  }
  .login-bg-panel__footer {
    margin-top: 12px;
    text-align: right;
  }
}
</style>
