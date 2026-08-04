<template>
  <div class="slider-captcha">
    <!-- 拼图区域：背景图 + 可拖动滑块 -->
    <div
      ref="stageRef"
      class="sc-stage"
      :style="{ aspectRatio: `${data?.width || 2} / ${data?.height || 1}` }"
      v-loading="loading"
    >
      <img v-if="data" :src="data.backgroundImage" class="sc-bg" draggable="false" alt="" />
      <img
        v-if="data"
        :src="data.sliderImage"
        class="sc-piece"
        draggable="false"
        alt=""
        :style="{
          width: pieceSizePx + 'px',
          top: pieceTopPx + 'px',
          left: pieceLeftPx + 'px',
        }"
      />
      <!-- 校验结果遮罩 -->
      <div v-if="status === 'success'" class="sc-result sc-result--ok" aria-live="polite">
        <el-icon aria-hidden="true"><CircleCheck /></el-icon> 验证通过
      </div>
    </div>

    <!-- 滑轨 -->
    <div ref="trackRef" class="sc-track" :class="`is-${status}`">
      <div class="sc-track__fill" :style="{ width: handleX + 'px' }" />
      <div
        class="sc-handle"
        role="slider"
        tabindex="0"
        aria-label="拖动滑块完成拼图验证"
        aria-valuemin="0"
        :aria-valuemax="trackMax"
        :aria-valuenow="Math.round(handleX)"
        :style="{ transform: `translateX(${handleX}px)` }"
        @mousedown="onStart"
        @touchstart.passive="onStart"
        @keydown="onKeydown"
      >
        <el-icon v-if="status === 'success'" aria-hidden="true"><Check /></el-icon>
        <el-icon v-else-if="status === 'fail'" aria-hidden="true"><Close /></el-icon>
        <el-icon v-else aria-hidden="true"><DArrowRight /></el-icon>
      </div>
      <span v-if="handleX < 8 && status === 'idle'" class="sc-track__tip"
        >按住滑块，拖动完成拼图…</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 滑块拼图验证码组件
 *
 * 交互流程：
 *   挂载 → 拉取验证码（背景 + 拼图块 + 缺口Y坐标）
 *   → 用户拖动滑轨手柄，拼图块横向跟随
 *   → 松手时把「显示坐标」按比例换算回「原图坐标系」上报 verify
 *   → 成功 emit('success', verifyToken)；失败自动刷新重试
 *
 * 坐标换算说明：背景原图 300×150，实际渲染宽度自适应容器，
 * 上报 slideX = 显示位移 × (原图宽 / 显示宽)，与后端 ±1px 容差对齐；
 * 验证成功后用后端返回的真实坐标吸附展示，避免停留在容差边缘。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  Check,
  Close,
  DArrowRight,
  CircleCheck,
} from '@element-plus/icons-vue';
import {
  getSliderCaptcha,
  verifySliderCaptcha,
  type SliderCaptchaData,
} from '@/api/captcha';

const emit = defineEmits<{
  /** 验证通过，携带一次性登录凭证 */
  (e: 'success', verifyToken: string): void;
  /** 凭证被消费（登录失败）后由父组件调用 reset，通过状态回调告知 */
  (e: 'reset'): void;
}>();

const stageRef = ref<HTMLElement>();
const trackRef = ref<HTMLElement>();
const loading = ref(false);
const data = ref<SliderCaptchaData | null>(null);
const status = ref<'idle' | 'dragging' | 'success' | 'fail'>('idle');
const handleX = ref(0); // 手柄位移（显示像素）
const DEFAULT_STAGE_WIDTH = 300;
const HANDLE_SIZE = 42;

/** 显示尺寸换算 */
const stageWidth = () =>
  stageRef.value?.getBoundingClientRect().width || DEFAULT_STAGE_WIDTH;
const trackWidth = () =>
  trackRef.value?.getBoundingClientRect().width || DEFAULT_STAGE_WIDTH;
const getScale = () => (data.value ? stageWidth() / data.value.width : 1);
const scale = computed(getScale);
const pieceSizePx = computed(() =>
  data.value ? data.value.sliderSize * scale.value : 50,
);
const pieceTopPx = computed(() =>
  data.value ? data.value.gapY * scale.value : 0,
);
const pieceLeftPx = computed(() => handleX.value);

/** 滑轨最大位移（用于 aria-valuemax 与键盘步进） */
const trackMax = computed(() => {
  return Math.max(trackWidth() - HANDLE_SIZE, 0);
});

/** 拉取/刷新验证码 */
async function load() {
  loading.value = true;
  status.value = 'idle';
  handleX.value = 0;
  try {
    data.value = await getSliderCaptcha();
  } finally {
    loading.value = false;
  }
}

/** 供父组件调用：登录失败核销凭证后重置滑块 */
function reset() {
  load();
  emit('reset');
}

/** 供父组件调用：刷新验证码（标题栏刷新按钮） */
function refresh() {
  load();
}

defineExpose({ reset, refresh });

/** 键盘可达性：←/→ 调整位移，Enter 校验 */
function onKeydown(e: KeyboardEvent) {
  if (status.value === 'success' || loading.value || !data.value) return;
  const step = e.shiftKey ? 20 : 8;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    handleX.value = Math.max(0, handleX.value - step);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    handleX.value = Math.min(trackMax.value, handleX.value + step);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onEnd();
  }
}

// ── 拖动逻辑（鼠标 + 触屏统一处理） ──────────────────────────
let startClientX = 0;
let dragging = false;

function clientX(e: MouseEvent | TouchEvent): number {
  return 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
}

function onStart(e: MouseEvent | TouchEvent) {
  if (status.value === 'success' || loading.value || !data.value) return;
  dragging = true;
  status.value = 'dragging';
  startClientX = clientX(e) - handleX.value;
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd);
}

function onMove(e: MouseEvent | TouchEvent) {
  if (!dragging) return;
  if ('touches' in e) e.preventDefault(); // 阻止页面随手势滚动
  handleX.value = Math.min(
    Math.max(clientX(e) - startClientX, 0),
    trackMax.value,
  );
}

async function onEnd() {
  if (!dragging) return;
  dragging = false;
  removeListeners();
  if (!data.value) return;

  // 显示位移 → 原图坐标
  const currentScale = getScale();
  const slideX = Math.round(handleX.value / currentScale);
  try {
    const { verifyToken, correctX } = await verifySliderCaptcha(
      data.value.captchaId,
      slideX,
    );
    handleX.value = Math.min(correctX * currentScale, trackMax.value);
    status.value = 'success';
    emit('success', verifyToken);
  } catch {
    // 校验失败：短暂显示失败态后自动刷新（验证码已被后端消费，必须换新）
    status.value = 'fail';
    setTimeout(load, 800);
  }
}

function removeListeners() {
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onEnd);
  window.removeEventListener('touchmove', onMove);
  window.removeEventListener('touchend', onEnd);
}

onMounted(load);
onUnmounted(removeListeners);
</script>

<style scoped lang="scss">
.slider-captcha {
  user-select: none;
  -webkit-user-select: none;
}

/* 拼图舞台 */
.sc-stage {
  position: relative;
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(135deg, #f0f3f7 0%, #e8ecf2 100%);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04);

  .sc-bg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .sc-piece {
    position: absolute;
    pointer-events: none;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
  }

  .sc-result {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    backdrop-filter: blur(2px);

    &--ok {
      color: #fff;
      background: rgba(65, 168, 129, 0.85);
    }
  }
}

/* 滑轨 */
.sc-track {
  position: relative;
  height: 42px;
  margin-top: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 21px;
  background: linear-gradient(180deg, #f7f8fa 0%, #eef0f4 100%);
  overflow: hidden;

  &__fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: rgba(65, 168, 129, 0.15);
    transition: width 0.1s linear;
  }

  &__tip {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: #909399;
    pointer-events: none;
  }

  &.is-dragging .sc-track__fill {
    transition: none;
  }
  &.is-success {
    border-color: #41a881;
    .sc-track__fill {
      background: rgba(65, 168, 129, 0.28);
    }
  }
  &.is-fail {
    border-color: #f56c6c;
    .sc-track__fill {
      background: rgba(245, 108, 108, 0.18);
    }
  }
}

/* 滑块手柄 */
.sc-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 42px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 21px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
  cursor: grab;
  color: #606266;
  touch-action: none;
  transition: box-shadow 0.2s ease, color 0.2s ease;

  &:hover {
    box-shadow: 0 3px 10px rgba(65, 168, 129, 0.25), 0 0 0 1px rgba(65, 168, 129, 0.3);
    color: #41a881;
  }
  &:focus-visible {
    outline: 2px solid #41a881;
    outline-offset: 2px;
  }
  &:active {
    cursor: grabbing;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }

  .is-success & {
    color: #41a881;
  }
  .is-fail & {
    color: #f56c6c;
  }
}

/* 尊重用户的减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .sc-track__fill,
  .sc-handle {
    transition: none;
  }
}
</style>
