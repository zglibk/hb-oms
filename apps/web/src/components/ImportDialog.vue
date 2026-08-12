<!--
  通用「批量导入」对话框。

  各模块导入的差异只有三处：标题 / 模板下载函数 / 上传函数，其余（模板下载入口、
  拖拽上传、导入前二次确认、逐行错误清单、失败计数、回滚提示）完全一致，
  故收敛到这里，页面里不要再各写一份（§一 前端架构：禁止在页面内重复造轮子）。

  服务端约定：导入失败抛 BadRequestException({ message, errors, failedCount, totalCount })，
  由 AllExceptionsFilter 透传，这里按 errors 逐行展示。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="640px"
    :close-on-click-modal="!importing"
    :close-on-press-escape="!importing"
    :show-close="!importing"
    @update:model-value="onVisible"
    @closed="reset"
  >
    <el-alert type="info" :closable="false" show-icon class="mb12" :title="tip" />

    <div class="import-body">
      <el-button size="small" :icon="Download" :loading="downloading" @click="onDownloadTemplate">
        下载导入模板
      </el-button>

      <el-upload
        class="import-upload" drag :auto-upload="false" :show-file-list="true"
        :limit="1" accept=".xlsx" :on-change="onPickFile" :on-exceed="onExceed" :file-list="fileList"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">把 .xlsx 拖到此处，或<em>点击选择</em></div>
      </el-upload>

      <!-- 各模块的额外选项（如「覆盖更新」开关）从这里插入 -->
      <slot name="options" />

      <div v-if="failed.length" class="import-errors">
        <div class="import-errors__title">
          导入未执行：<b>{{ failedCount }}</b> 条记录有问题<span v-if="totalCount">（共 {{ totalCount }} 条）</span>，
          数据已<b>整批回滚</b>，未写入任何一条。请按下面的行号修正后重新上传：
        </div>
        <div v-for="(e, i) in failed" :key="i" class="import-errors__row">{{ e }}</div>
      </div>
    </div>

    <template #footer>
      <el-button size="small" :disabled="importing" @click="onVisible(false)">取消</el-button>
      <el-button
        size="small" type="primary" :loading="importing" :disabled="!pendingFile"
        @click="onImport"
      >开始导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus';
import { Download, UploadFilled } from '@element-plus/icons-vue';

const props = defineProps<{
  modelValue: boolean;
  title: string;
  /** 顶部提示条文案（各模块讲清自己的导入语义，如「会重复建档」） */
  tip: string;
  /** 二次确认的正文；`{n}` 会被替换成文件名 */
  confirmText: string;
  downloadTemplate: () => Promise<void>;
  doImport: (file: File) => Promise<any>;
  /** 成功提示文案，由调用方按各自的返回结构拼 */
  summarize: (res: any) => string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  /** 导入成功；页面据此刷新列表 */
  (e: 'done'): void;
}>();

const downloading = ref(false);
const importing = ref(false);
const pendingFile = ref<File | null>(null);
const fileList = ref<UploadFile[]>([]);
const failed = ref<string[]>([]);
const failedCount = ref(0);
const totalCount = ref(0);

function reset() {
  pendingFile.value = null;
  fileList.value = [];
  failed.value = [];
  failedCount.value = 0;
  totalCount.value = 0;
}

function onVisible(v: boolean) {
  if (importing.value) return; // 导入进行中不允许关闭，避免用户以为已取消
  emit('update:modelValue', v);
}

function onPickFile(file: UploadFile) {
  pendingFile.value = (file.raw as File) ?? null;
  fileList.value = [file];
  // 换了文件就把上一次的错误清单收起来，否则会让人以为新文件也有同样的错
  failed.value = [];
}

function onExceed(files: File[]) {
  const f = files[0];
  if (!f) return;
  fileList.value = [{ name: f.name, uid: Date.now() } as UploadFile];
  pendingFile.value = f;
  failed.value = [];
}

async function onDownloadTemplate() {
  downloading.value = true;
  try {
    await props.downloadTemplate();
  } catch {
    ElMessage.error('模板下载失败，请重试');
  } finally {
    downloading.value = false;
  }
}

async function onImport() {
  const file = pendingFile.value;
  if (!file) return;

  // 导入会写数据，先让用户确认一次（文件选错是最常见的误操作）
  try {
    await ElMessageBox.confirm(
      props.confirmText.replace('{n}', file.name),
      '确认导入',
      { type: 'warning', confirmButtonText: '确认导入', cancelButtonText: '再想想' },
    );
  } catch {
    return; // 用户取消
  }

  importing.value = true;
  failed.value = [];
  try {
    const res = await props.doImport(file);
    ElMessage.success(props.summarize(res));
    emit('done');
    emit('update:modelValue', false);
  } catch (err: any) {
    // HTTP 400 时拦截器 reject 的是原始 axios 错误，逐行明细在 response.data 里；
    // 兼容两种形状（与 customer / process-info 的导入同一写法），只读 err.errors 会拿到 undefined
    const body = err?.response?.data ?? err;
    const list: string[] = Array.isArray(body?.errors) ? body.errors : [];
    failed.value = list.length ? list : [body?.message || err?.message || '导入失败'];
    failedCount.value = Number(body?.failedCount ?? failed.value.length);
    totalCount.value = Number(body?.totalCount ?? 0);
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped lang="scss">
.mb12 { margin-bottom: 12px; }
.import-body { display: flex; flex-direction: column; gap: 12px; }
.import-upload { width: 100%; }
.import-errors {
  max-height: 260px; overflow: auto; padding: 10px 12px;
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-7); border-radius: 4px;
  &__title {
    margin-bottom: 6px; font-size: 13px; line-height: 1.6;
    color: var(--el-color-danger);
    b { font-weight: 700; }
  }
  &__row {
    font-size: 12px; line-height: 1.8;
    color: var(--el-text-color-regular);
    font-variant-numeric: tabular-nums;
  }
}
</style>
