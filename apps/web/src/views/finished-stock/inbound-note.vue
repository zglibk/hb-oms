<template>
  <main class="print-preview-page">
    <header class="preview-toolbar no-print">
      <el-button size="small" :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <div class="preview-toolbar__title">
        <strong>入库单</strong>
        <el-tag v-if="note && note.status === FINISHED_DOC_STATUS_VALUE.DRAFT" size="small" type="info">
          单据尚未确认（草稿）
        </el-tag>
        <span>A5 横向，交仓库收货签字</span>
      </div>
      <div>
        <el-button size="small" :icon="Printer" :disabled="loading || !note" @click="onPrint">打印</el-button>
        <!-- 与列表入口同权限：直接输 URL 进来的无权用户不该看到可点的按钮
             （后端另有 finished-stock:print 守卫，这里只是别让人点了才 403） -->
        <el-button
          size="small" type="primary" :icon="Download" v-permission.disable="'finished-stock:print'"
          :loading="downloading" :disabled="loading || !note" @click="onDownloadPdf"
        >导出PDF</el-button>
      </div>
    </header>

    <section class="sheet-stage" v-loading="loading">
      <inbound-note-sheet v-if="note" :note="note" class="sheet-shadow" />
      <el-empty v-if="!loading && !note" :description="errorMsg || '未能加载入库单'" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Printer, Download } from '@element-plus/icons-vue';
import { getInboundNote, downloadInboundNotePdf, type InboundNote } from '@/api/finished-stock';
import { readBlobError } from '@/utils/download';
import { useFeatureStore } from '@/stores/feature';
import { FINISHED_DOC_STATUS_VALUE } from '@/constants/dict';
import InboundNoteSheet from '@/components/print/InboundNoteSheet.vue';

/**
 * 《成品入库单》打印页（CLAUDE.md §5.6「入库单打印」）。
 *
 * 数据来自 GET /finished-stock/:id/inbound-note（一张**生产入库单**出一张入库单）；
 * 纸面交给 `InboundNoteSheet` 渲染，本页只管取数、工具栏与打印动作。
 * 「导出PDF」由服务端渲染本页出 PDF（同《送货单》做法）。
 *
 * ⚠️ 本页是**顶层路由、不在 Layout 下**（原因见 router/index.ts 注释），因此
 * §5.7 那条「业务字段开关由布局层统一拉取」在这里**不适用**：新标签页打开、
 * 以及服务端 PDF 渲染都是全新页面上下文，不自己拉一次，管理员停用的「颜色」列
 * 会退回默认值「启用」照印出来。
 */

const featureStore = useFeatureStore();

const route = useRoute();
const router = useRouter();
const id = Number(route.query.id);

const loading = ref(true);
const note = ref<InboundNote | null>(null);
const errorMsg = ref('');
const originalTitle = document.title;

async function init() {
  if (!id) {
    goBack();
    return;
  }
  loading.value = true;
  try {
    const [res] = await Promise.all([
      getInboundNote(id),
      // 顶层路由没有 Layout 兜底，业务字段开关必须自己确保加载（见文件头注释）；
      // 已加载过则跳过，不重复请求
      featureStore.loaded ? Promise.resolve() : featureStore.load(),
    ]);
    note.value = res;
    // 打印/另存 PDF 的默认文件名取自 document.title
    document.title = `入库单-${res.docNo}`;
  } catch (err: any) {
    // 非生产入库 / 已作废 / 无明细等守卫的中文原因要显示出来，别只留一张空白页
    errorMsg.value = err?.response?.data?.message || err?.message || '未能加载入库单';
    ElMessage.error(errorMsg.value);
  } finally {
    loading.value = false;
  }
}
init();

function onPrint() {
  window.print();
}

const downloading = ref(false);
async function onDownloadPdf() {
  downloading.value = true;
  try {
    await downloadInboundNotePdf(id, `入库单-${note.value?.docNo}.pdf`);
  } catch (err) {
    ElMessage.error(await readBlobError(err));
  } finally {
    downloading.value = false;
  }
}

function goBack() {
  router.push('/finished-stock');
}

onBeforeUnmount(() => {
  document.title = originalTitle;
});
</script>

<script lang="ts">
export default { name: 'InboundNotePrint' };
</script>

<style scoped>
.print-preview-page {
  min-width: 100%;
  min-height: 100vh;
  background: #eef0f3;
  color: #111;
}

.preview-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  min-height: 56px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #dcdfe6;
}
.preview-toolbar > :last-child { justify-self: end; }
.preview-toolbar > :first-child { justify-self: start; }
.preview-toolbar__title { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
.preview-toolbar__title strong { font-size: 16px; }
.preview-toolbar__title span { color: #909399; font-size: 12px; }

.sheet-stage {
  box-sizing: border-box;
  min-height: calc(100vh - 57px);
  padding: 24px;
  overflow: auto;
}

/* 屏幕上给纸面加投影（打印时由组件自身的 @media print 归零） */
.sheet-shadow { box-shadow: 0 3px 18px rgb(0 0 0 / 14%); }

/* ===== 打印 ===== */
@media print {
  :global(html),
  :global(body),
  :global(#app) {
    width: 210mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  /*
   * A5 横向，页边距对齐纸质模板（上下 ~10.4mm、左右 ~5mm）。
   * 服务端出 PDF 时 PdfService 用 preferCSSPageSize，纸张与页边距都以这里为准
   * ——所以别在服务端再定义一份，两边必然漂移。
   */
  @page { size: A5 landscape; margin: 10mm 5mm; }

  .print-preview-page,
  .sheet-stage {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    background: #fff;
  }

  .no-print { display: none !important; }
}
</style>
