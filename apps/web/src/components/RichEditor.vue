<template>
  <div class="rich-editor" style="border: 1px solid #ccc">
    <Toolbar
      :editor="editorRef"
      :default-config="toolbarConfig"
      mode="default"
      style="border-bottom: 1px solid #ccc"
    />
    <Editor
      v-model="valueHtml"
      :default-config="editorConfig"
      mode="default"
      style="min-height: 180px; overflow-y: hidden"
      @on-created="handleCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onBeforeUnmount } from 'vue';
import '@wangeditor/editor/dist/css/style.css';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import type { IDomEditor } from '@wangeditor/editor';
import { uploadFile } from '@/api/file';

const props = defineProps<{
  modelValue?: string;
  /** 插入图片时的默认宽度，默认 400px；传 '' 则不设置宽度限制 */
  imageWidth?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const editorRef = shallowRef<IDomEditor>();
const valueHtml = ref(props.modelValue || '');

watch(
  () => props.modelValue,
  (v) => {
    if (v !== valueHtml.value) valueHtml.value = v || '';
  },
);
watch(valueHtml, (v) => emit('update:modelValue', v));

const toolbarConfig = {
  excludeKeys: ['fullScreen', 'group-video'],
};

/**
 * blob URL → File 映射表。
 * customUpload 插入图片时只存入此 Map，不发起网络请求。
 * 表单保存前由父组件调用 flushUploads() 统一上传并替换 HTML 中的 blob URL。
 */
const pendingUploads = new Map<string, File>();

const editorConfig = {
  placeholder: '可输入文字并插入图片（工艺示意图、包装要求图等）...',
  MENU_CONF: {
    uploadImage: {
      // 拦截上传，仅本地预览；同时注入默认宽度避免高分辨率图像撑破版面
      customUpload(file: File, insertFn: (url: string, alt: string, href: string) => void) {
        const blobUrl = URL.createObjectURL(file);
        pendingUploads.set(blobUrl, file);

        const width = props.imageWidth !== undefined ? props.imageWidth : '400px';
        const editor = editorRef.value;
        if (editor && width) {
          // 直接插入带 style.width 的图片节点，确保尺寸写入 HTML 输出
          editor.insertNode({
            type: 'image',
            src: blobUrl,
            alt: file.name,
            href: '',
            style: { width },
            children: [{ text: '' }],
          } as any);
        } else {
          insertFn(blobUrl, file.name, blobUrl);
        }
      },
    },
  },
};

function handleCreated(editor: IDomEditor) {
  editorRef.value = editor;
}

onBeforeUnmount(() => {
  // 释放所有未上传的 blob URL
  pendingUploads.forEach((_, blobUrl) => URL.revokeObjectURL(blobUrl));
  pendingUploads.clear();
  editorRef.value?.destroy();
});

/**
 * 将编辑器内容中所有待上传的 blob 图片上传至后端，
 * 并用真实 URL 替换 HTML 中对应的 blob URL，同步更新 v-model。
 * 父组件在表单保存前 await 此方法。
 */
async function flushUploads(): Promise<void> {
  if (pendingUploads.size === 0) return;

  let html = valueHtml.value;
  const entries = [...pendingUploads.entries()];

  await Promise.all(
    entries.map(async ([blobUrl, file]) => {
      try {
        const realUrl = await uploadFile(file, 'editor_image');
        html = html.split(blobUrl).join(realUrl);
        URL.revokeObjectURL(blobUrl);
        pendingUploads.delete(blobUrl);
      } catch {
        // 单张失败不阻断整体，保留 blob URL 待重试
      }
    }),
  );

  valueHtml.value = html;
  emit('update:modelValue', html);
}

defineExpose({ flushUploads });
</script>
