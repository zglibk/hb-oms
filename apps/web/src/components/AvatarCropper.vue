<template>
  <el-dialog
    :model-value="modelValue"
    :title="imgSrc ? '裁剪头像' : '选择头像'"
    width="440px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="reset"
  >
    <div class="avatar-cropper">
      <!-- 未选图：上传选择区 -->
      <el-upload
        v-if="!imgSrc"
        class="avatar-cropper__picker"
        drag
        :auto-upload="false"
        :show-file-list="false"
        accept="image/jpeg,image/png,image/webp"
        :on-change="onPick"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          点击或拖拽图片到此处<br />
          <span class="avatar-cropper__tip">支持 JPG / PNG / WEBP，≤10MB</span>
        </div>
      </el-upload>

      <!-- 已选图：裁剪舞台 + 工具栏 -->
      <div v-else class="avatar-cropper__stage">
        <Cropper
          ref="cropperRef"
          class="avatar-cropper__cropper"
          :src="imgSrc"
          :stencil-props="{ aspectRatio: 1 }"
          :stencil-component="CircleStencil"
          image-restriction="stencil"
          :transforms="transforms"
        />

        <!-- 工具栏：旋转 / 翻转 / 缩放 / 重置 / 重选 -->
        <div class="avatar-cropper__toolbar">
          <button
            type="button"
            class="tool-btn"
            title="向左旋转 90°"
            @click="rotate(-90)"
          >
            <el-icon><RefreshLeft /></el-icon>
          </button>
          <button
            type="button"
            class="tool-btn"
            title="向右旋转 90°"
            @click="rotate(90)"
          >
            <el-icon><RefreshRight /></el-icon>
          </button>
          <span class="tool-sep" />
          <button
            type="button"
            class="tool-btn"
            title="水平翻转"
            @click="flip(true, false)"
          >
            <el-icon><Sort /></el-icon>
          </button>
          <button
            type="button"
            class="tool-btn"
            title="垂直翻转"
            @click="flip(false, true)"
          >
            <el-icon class="is-vflip"><Sort /></el-icon>
          </button>
          <span class="tool-sep" />
          <button
            type="button"
            class="tool-btn"
            title="放大"
            @click="zoom(1.2)"
          >
            <el-icon><ZoomIn /></el-icon>
          </button>
          <button
            type="button"
            class="tool-btn"
            title="缩小"
            @click="zoom(0.8)"
          >
            <el-icon><ZoomOut /></el-icon>
          </button>
          <span class="tool-sep" />
          <button
            type="button"
            class="tool-btn"
            title="重置"
            @click="resetTransform"
          >
            <el-icon><Refresh /></el-icon>
          </button>
          <button
            type="button"
            class="tool-btn tool-btn--text"
            title="重新选择"
            @click="reset"
          >
            <el-icon><Picture /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button size="small"
        type="primary"
        :disabled="!imgSrc"
        @click="onConfirm"
      >
        确认
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import {
  UploadFilled,
  RefreshLeft,
  RefreshRight,
  Sort,
  ZoomIn,
  ZoomOut,
  Refresh,
  Picture,
} from '@element-plus/icons-vue';
import { Cropper, CircleStencil } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';
import type { UploadFile } from 'element-plus';

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'confirm', file: File, previewUrl: string): void;
}>();

const cropperRef = ref<InstanceType<typeof Cropper>>();
const imgSrc = ref<string>('');

/* transforms 透传给 Cropper，控制旋转/翻转的视觉态 */
const transforms = reactive({ rotate: 0, flip: { horizontal: false, vertical: false } });

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

function onPick(file: UploadFile) {
  const raw = file.raw;
  if (!raw) return;
  if (!ALLOWED.includes(raw.type)) {
    ElMessage.error('仅支持 JPG / PNG / WEBP 格式');
    return;
  }
  if (raw.size > MAX_SIZE) {
    ElMessage.error('图片大小不能超过 10MB');
    return;
  }
  if (imgSrc.value) URL.revokeObjectURL(imgSrc.value);
  imgSrc.value = URL.createObjectURL(raw);
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

function reset() {
  if (imgSrc.value) {
    URL.revokeObjectURL(imgSrc.value);
    imgSrc.value = '';
  }
  transforms.rotate = 0;
  transforms.flip.horizontal = false;
  transforms.flip.vertical = false;
}

async function onConfirm() {
  const inst = cropperRef.value as any;
  const result = inst?.getResult?.();
  const canvas: HTMLCanvasElement | undefined = result?.canvas;
  if (!canvas) {
    ElMessage.error('裁剪失败，请重试');
    return;
  }
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.92),
  );
  const file = new File([blob], `avatar-${Date.now()}.jpg`, {
    type: 'image/jpeg',
  });
  const previewUrl = URL.createObjectURL(blob);
  emit('confirm', file, previewUrl);
  emit('update:modelValue', false);
}
</script>

<style scoped lang="scss">
.avatar-cropper {
  &__picker {
    width: 100%;
    :deep(.el-upload-dragger) {
      padding: 24px 16px;
    }
  }
  &__tip {
    font-size: 12px;
    color: #909399;
  }
  &__stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  &__cropper {
    width: 100%;
    height: 280px;
    background: #f5f7fa;
    border-radius: 8px;
    overflow: hidden;
  }

  /* 工具栏：圆角药丸容器 + 图标按钮分组 */
  &__toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 22px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);

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
      transition:
        background 0.2s,
        color 0.2s,
        transform 0.2s;

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
}
</style>
