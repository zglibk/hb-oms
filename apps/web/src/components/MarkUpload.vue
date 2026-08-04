<template>
  <div class="mark-upload">
    <el-upload
      :show-file-list="false"
      :auto-upload="false"
      accept="image/jpeg,image/png,image/webp,application/pdf"
      :before-upload="beforeUpload"
      :on-change="onChange"
    >
      <div v-if="previewUrl" class="preview">
        <el-image
          :src="previewUrl"
          fit="cover"
          :preview-src-list="[previewUrl]"
          :preview-teleported="true"
          @click.stop
        />
        <div class="mask">点击替换</div>
      </div>
      <div v-else class="placeholder">
        <el-icon><Plus /></el-icon>
        <span>上传图片</span>
      </div>
    </el-upload>
    <el-button
      v-if="previewUrl"
      link
      type="danger"
      size="small"
      @click="onRemove"
    >
      移除
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { UploadFile } from 'element-plus';
import { uploadFile } from '@/api/file';

const props = defineProps<{ modelValue?: string; bizType: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

/** 当前用于预览的 URL（blob: 或真实路径） */
const previewUrl = ref(props.modelValue || '');
/** 待上传的文件（选图后存入，上传完成后清空） */
const pendingFile = ref<File | null>(null);

// 外部 v-model 变化时同步（如编辑回显）
watch(
  () => props.modelValue,
  (v) => {
    if (v !== previewUrl.value) {
      previewUrl.value = v || '';
      pendingFile.value = null; // 外部传入视为已上传，清空待上传
    }
  },
);

function beforeUpload(file: File) {
  const isImg = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  const isPdf = file.type === 'application/pdf';
  if (!isImg && !isPdf) {
    ElMessage.error('仅支持 JPG/PNG/WEBP/PDF');
    return false;
  }
  const maxMB = isPdf ? 20 : 10;
  if (file.size > maxMB * 1024 * 1024) {
    ElMessage.error(`文件不能超过 ${maxMB}MB`);
    return false;
  }
  return true;
}

function onChange(uploadFileObj: UploadFile) {
  const file = uploadFileObj.raw;
  if (!file) return;
  // 释放上一个 blob URL（如有）
  if (previewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value);
  }
  const blobUrl = URL.createObjectURL(file);
  pendingFile.value = file;
  previewUrl.value = blobUrl;
  // 通知父组件当前预览 URL（保存前仍是 blob，保存时由 upload() 替换为真实 URL）
  emit('update:modelValue', blobUrl);
}

function onRemove() {
  if (previewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value);
  }
  pendingFile.value = null;
  previewUrl.value = '';
  emit('update:modelValue', '');
}

/**
 * 将待上传文件发送至后端，并用真实 URL 替换 blob URL。
 * 父组件在表单保存前调用，无待上传文件时为空操作。
 */
async function upload(): Promise<void> {
  if (!pendingFile.value) return;
  const realUrl = await uploadFile(pendingFile.value, props.bizType);
  URL.revokeObjectURL(previewUrl.value);
  pendingFile.value = null;
  previewUrl.value = realUrl;
  emit('update:modelValue', realUrl);
}

defineExpose({ upload });
</script>

<style scoped lang="scss">
.mark-upload {
  display: flex;
  align-items: center;
  gap: 10px;
}
.preview,
.placeholder {
  width: 120px;
  height: 120px;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  position: relative;

  &:hover {
    border-color: #41a881;
  }
}
.preview {
  .el-image {
    width: 100%;
    height: 100%;
  }
  .mask {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 12px;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    padding: 2px 0;
  }
}
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 12px;
  gap: 6px;

  .el-icon {
    font-size: 22px;
  }
}
</style>
