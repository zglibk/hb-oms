<template>
  <div class="inline-cropper">
    <!-- 未选图：上传占位 -->
    <el-upload
      v-if="!imgSrc"
      class="inline-cropper__picker"
      :show-file-list="false"
      :auto-upload="false"
      :accept="accept"
      :on-change="onPick"
    >
      <div class="inline-cropper__placeholder" :style="placeholderStyle">
        <el-icon><Plus /></el-icon>
        <span>{{ placeholderText }}</span>
      </div>
    </el-upload>

    <!-- 已选图：裁剪舞台 + 工具栏 -->
    <div v-else class="inline-cropper__stage">
      <Cropper
        ref="cropperRef"
        class="inline-cropper__cropper"
        :src="imgSrc"
        :stencil-props="stencilProps"
        :stencil-component="stencilType === 'circle' ? CircleStencil : RectangleStencil"
        image-restriction="stencil"
        :transforms="transforms"
        @change="onChange"
      />

      <!-- 实时预览 -->
      <div class="inline-cropper__preview-wrap">
        <div class="inline-cropper__preview-label">预览</div>
        <div
          class="inline-cropper__preview"
          :style="{
            width: previewWidth + 'px',
            height: previewHeight + 'px',
            borderRadius: stencilType === 'circle' ? '50%' : '6px',
          }"
        >
          <img v-if="previewUrl" :src="previewUrl" alt="预览" />
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="inline-cropper__toolbar">
        <button type="button" class="tool-btn" title="向左旋转 90°" @click="rotate(-90)">
          <el-icon><RefreshLeft /></el-icon>
        </button>
        <button type="button" class="tool-btn" title="向右旋转 90°" @click="rotate(90)">
          <el-icon><RefreshRight /></el-icon>
        </button>
        <span class="tool-sep" />
        <button type="button" class="tool-btn" title="水平翻转" @click="flip(true, false)">
          <el-icon><Sort /></el-icon>
        </button>
        <button type="button" class="tool-btn" title="垂直翻转" @click="flip(false, true)">
          <el-icon class="is-vflip"><Sort /></el-icon>
        </button>
        <span class="tool-sep" />
        <button type="button" class="tool-btn" title="放大" @click="zoom(1.2)">
          <el-icon><ZoomIn /></el-icon>
        </button>
        <button type="button" class="tool-btn" title="缩小" @click="zoom(0.8)">
          <el-icon><ZoomOut /></el-icon>
        </button>
        <span class="tool-sep" />
        <button type="button" class="tool-btn" title="重置" @click="resetTransform">
          <el-icon><Refresh /></el-icon>
        </button>
        <button type="button" class="tool-btn tool-btn--text" title="重新选择" @click="reset">
          <el-icon><Picture /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Plus,
  RefreshLeft,
  RefreshRight,
  Sort,
  ZoomIn,
  ZoomOut,
  Refresh,
  Picture,
} from '@element-plus/icons-vue';
import { Cropper, CircleStencil, RectangleStencil } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';
import type { UploadFile } from 'element-plus';

const props = withDefaults(
  defineProps<{
    /** 已保存的服务器 URL（外部初始值） */
    modelValue?: string | null;
    /** 宽高比（width / height）：favicon=1, logo=2 */
    aspectRatio?: number;
    /** 蒙版形状 */
    stencilType?: 'rect' | 'circle';
    /** 接受的文件 MIME */
    accept?: string;
    /** 占位文案 */
    placeholderText?: string;
    /** 占位尺寸（px）：宽度；高度按 aspectRatio 自动计算 */
    placeholderWidth?: number;
    /** 预览尺寸（px）：宽度；高度按 aspectRatio 自动计算 */
    previewWidth?: number;
    /** 输出文件名前缀（如 'logo'、'favicon'） */
    outputName?: string;
    /** 输出图片格式 */
    outputMime?: string;
  }>(),
  {
    modelValue: null,
    aspectRatio: 1,
    stencilType: 'rect',
    accept: 'image/jpeg,image/png,image/webp',
    placeholderText: '上传图片',
    placeholderWidth: 200,
    previewWidth: 80,
    outputName: 'image',
    outputMime: 'image/png',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', v: string | null): void;
  /** 用户重新选图时触发，外部可据此清除已保存的 pendingFile */
  (e: 'pick'): void;
}>();

const cropperRef = ref<InstanceType<typeof Cropper>>();
const imgSrc = ref<string>('');
const previewUrl = ref<string>('');

/* transforms 透传给 Cropper，控制旋转/翻转的视觉态 */
const transforms = reactive({
  rotate: 0,
  flip: { horizontal: false, vertical: false },
});

const MAX_SIZE = 10 * 1024 * 1024;

/** 是否为自由比例（aspectRatio <= 0 时不约束宽高比） */
const isFreeRatio = computed(() => !props.aspectRatio || props.aspectRatio <= 0);

/** Cropper stencil-props：自由比例时不传 aspectRatio，约束比例时透传 */
const stencilProps = computed(() =>
  isFreeRatio.value
    ? { lines: false }
    : { aspectRatio: props.aspectRatio, lines: false },
);

/** 占位区域尺寸：自由比例时使用固定高度 120px；约束比例时按 aspectRatio 计算 */
const placeholderStyle = computed(() => ({
  width: props.placeholderWidth + 'px',
  height: isFreeRatio.value
    ? '120px'
    : Math.round(props.placeholderWidth / props.aspectRatio) + 'px',
}));

/** 裁剪结果的实际宽高比（width / height），由 onChange 实时更新 */
const croppedRatio = ref<number>(0);

/** 预览高度：自由比例下跟随裁剪结果实际比例；约束比例时按 aspectRatio 计算 */
const previewHeight = computed(() => {
  // 有裁剪结果时，按实际宽高比计算，确保预览框完整包裹裁剪结果
  if (croppedRatio.value > 0) {
    return Math.round(props.previewWidth / croppedRatio.value);
  }
  // 自由比例未裁剪时使用默认高度
  if (isFreeRatio.value) return 60;
  // 约束比例时按 aspectRatio 计算
  return Math.round(props.previewWidth / props.aspectRatio);
});

/**
 * 当外部传入已保存的 URL（非 blob）时，同步给 imgSrc 作为裁剪源。
 * 仅在初始加载或外部主动重置时触发。
 */
watch(
  () => props.modelValue,
  (val) => {
    // 外部 URL（服务器路径）且当前无裁剪源 → 同步显示
    if (val && !val.startsWith('blob:') && !imgSrc.value) {
      imgSrc.value = val;
    }
  },
  { immediate: true },
);

function onPick(file: UploadFile) {
  const raw = file.raw;
  if (!raw) return;
  if (raw.size > MAX_SIZE) {
    const mb = (raw.size / 1024 / 1024).toFixed(1);
    ElMessage.warning(`图片大小 ${mb}MB，超过 10MB 限制，请压缩后重新选择`);
    return;
  }
  // 撤销旧的 blob URL
  if (imgSrc.value && imgSrc.value.startsWith('blob:')) {
    URL.revokeObjectURL(imgSrc.value);
  }
  imgSrc.value = URL.createObjectURL(raw);
  // 重置变换状态
  transforms.rotate = 0;
  transforms.flip.horizontal = false;
  transforms.flip.vertical = false;
  // 通知父组件：用户已选新图（用于"移除"按钮显示）；blob URL 仅作占位，
  // 保存时 onSave 会用上传后的服务器 URL 覆盖，不会写入数据库
  emit('update:modelValue', imgSrc.value);
  emit('pick');
}

/** 旋转：累加角度到 transforms，Cropper 实例同步 */
function rotate(angle: number) {
  transforms.rotate = (transforms.rotate + angle) % 360;
  cropperRef.value?.rotate(angle);
}
/** 翻转：切换 h/v 标志并调用实例方法 */
function flip(horizontal: boolean, vertical: boolean) {
  if (horizontal) transforms.flip.horizontal = !transforms.flip.horizontal;
  if (vertical) transforms.flip.vertical = !transforms.flip.vertical;
  cropperRef.value?.flip(horizontal, vertical);
}
/** 缩放：factor>1 放大，<1 缩小 */
function zoom(factor: number) {
  cropperRef.value?.zoom(factor);
}
/** 重置变换状态（不更换图片） */
function resetTransform() {
  transforms.rotate = 0;
  transforms.flip.horizontal = false;
  transforms.flip.vertical = false;
  cropperRef.value?.reset();
}

/** Cropper 实时 change 回调：仅更新组件内部预览图（canvas → blob URL）。
 *  不向父组件 emit，避免频繁产生的临时 blob URL 污染父表单数据被误存入数据库。 */
function onChange() {
  const inst = cropperRef.value as any;
  const result = inst?.getResult?.();
  const canvas: HTMLCanvasElement | undefined = result?.canvas;
  if (!canvas) {
    previewUrl.value = '';
    croppedRatio.value = 0;
    return;
  }
  // 记录裁剪结果实际宽高比，预览框高度据此动态计算
  if (canvas.height > 0) {
    croppedRatio.value = canvas.width / canvas.height;
  }
  // 撤销旧预览
  if (previewUrl.value && previewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value);
  }
  canvas.toBlob((blob) => {
    if (blob) {
      previewUrl.value = URL.createObjectURL(blob);
    }
  }, props.outputMime, 0.92);
}

/** 清空裁剪源与预览 */
function reset() {
  if (imgSrc.value && imgSrc.value.startsWith('blob:')) {
    URL.revokeObjectURL(imgSrc.value);
  }
  if (previewUrl.value && previewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value);
  }
  imgSrc.value = '';
  previewUrl.value = '';
  croppedRatio.value = 0;
  transforms.rotate = 0;
  transforms.flip.horizontal = false;
  transforms.flip.vertical = false;
  emit('update:modelValue', null);
}

/**
 * 获取裁剪后的 File 对象。
 * - 若用户未选新图（仅展示已保存的 URL）→ 返回 null
 * - 若用户选了新图并裁剪 → 返回裁剪后的 File
 * 父组件在保存表单时调用此方法，若返回非 null 则调用 uploadFile 上传。
 */
async function getCroppedFile(): Promise<File | null> {
  if (!imgSrc.value || !imgSrc.value.startsWith('blob:')) {
    // 用户未选新图
    return null;
  }
  const inst = cropperRef.value as any;
  const result = inst?.getResult?.();
  const canvas: HTMLCanvasElement | undefined = result?.canvas;
  if (!canvas) {
    ElMessage.error('裁剪失败，请重试');
    return null;
  }
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), props.outputMime, 0.92),
  );
  const ext = props.outputMime === 'image/png' ? 'png' : 'jpg';
  return new File([blob], `${props.outputName}-${Date.now()}.${ext}`, {
    type: props.outputMime,
  });
}

defineExpose({ getCroppedFile, reset });
</script>

<style scoped lang="scss">
.inline-cropper {
  width: 100%;
}

.inline-cropper__picker {
  :deep(.el-upload) {
    display: block;
  }
}

.inline-cropper__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  cursor: pointer;
  color: #909399;
  font-size: 12px;
  transition: border-color 0.2s, color 0.2s;
  background: #fafbfc;

  .el-icon {
    font-size: 22px;
  }
  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
  }
}

.inline-cropper__stage {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}

.inline-cropper__cropper {
  width: 320px;
  height: 240px;
  background: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;

  /* vue-advanced-cropper 的 __background 默认 background: black；
   * PNG 缩小露出裁剪框外区域时会显示黑色。
   * 改为透明 + 棋盘格图案，清晰表示 PNG 透明区域，整体视觉与父容器 #f5f7fa 协调 */
  :deep(.vue-advanced-cropper__background) {
    background-color: #f5f7fa;
    background-image:
      linear-gradient(45deg, #e0e3e9 25%, transparent 25%, transparent 75%, #e0e3e9 75%),
      linear-gradient(45deg, #e0e3e9 25%, transparent 25%, transparent 75%, #e0e3e9 75%);
    background-size: 16px 16px;
    background-position: 0 0, 8px 8px;
  }
}

.inline-cropper__preview-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.inline-cropper__preview-label {
  font-size: 12px;
  color: #909399;
}

.inline-cropper__preview {
  border: 1px solid #ebeef5;
  background: #f5f7fa url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="5" height="5" fill="%23e5e7eb"/><rect x="5" y="5" width="5" height="5" fill="%23e5e7eb"/></svg>') repeat;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.inline-cropper__toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 22px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  align-self: flex-start;

  .tool-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: #606266;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, transform 0.2s;

    .el-icon {
      font-size: 16px;
    }
    &:hover {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
    }
    &:active {
      transform: scale(0.92);
    }
    &--text {
      color: #909399;
      &:hover {
        background: #f4f5f7;
        color: #606266;
      }
    }

    /* 垂直翻转：纵向镜像图标 */
    .is-vflip {
      transform: rotate(90deg);
    }
  }
  .tool-sep {
    width: 1px;
    height: 16px;
    background: #ebeef5;
    margin: 0 2px;
  }
}
</style>
