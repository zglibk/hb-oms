<template>
  <main class="print-preview-page">
    <header class="preview-toolbar no-print">
      <el-button size="small" :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <div class="preview-toolbar__title">
        <strong>送货单</strong>
        <el-select v-model="templateCode" size="small" style="width: 140px" :disabled="loading || !note">
          <el-option v-for="t in DELIVERY_TEMPLATE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-tag v-if="note && note.status === FINISHED_DOC_STATUS_VALUE.DRAFT" size="small" type="info">
          单据尚未确认（草稿）
        </el-tag>
        <span>切换模板只影响本次打印，不改客户资料</span>
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
      <!-- 纸面由共用组件渲染，与「系统管理 → 打印模板」预览页同一套（见组件头注释） -->
      <delivery-note-sheet v-if="note" :note="note" :template-code="templateCode" class="sheet-shadow" />
      <el-empty v-if="!loading && !note" :description="errorMsg || '未能加载送货单'" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Printer, Download } from '@element-plus/icons-vue';
import { getDeliveryNote, downloadDeliveryNotePdf, type DeliveryNote } from '@/api/finished-stock';
import { readBlobError } from '@/utils/download';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useFeatureStore } from '@/stores/feature';
import { FINISHED_DOC_STATUS_VALUE } from '@/constants/dict';
import { DELIVERY_TEMPLATE_OPTIONS } from '@/constants/delivery-note';
import DeliveryNoteSheet from '@/components/print/DeliveryNoteSheet.vue';

/**
 * 《送货单》打印页（CLAUDE.md §5.6「送货单打印」）。
 *
 * 数据来自 GET /finished-stock/:id/delivery-note（一张**销售出库单**出一张送货单）；
 * 纸面交给 `DeliveryNoteSheet` 渲染，本页只管取数、工具栏与打印动作。
 * 「导出PDF」由服务端渲染本页出 PDF（同《生产任务单》做法）。
 *
 * ⚠️ 本页是**顶层路由、不在 Layout 下**（原因见 router/index.ts 注释），因此
 * §5.7 那条「业务字段开关由布局层统一拉取」在这里**不适用**：新标签页打开、
 * 以及服务端 PDF 渲染都是全新页面上下文，不自己拉一次就读不到「全局默认模板」。
 */

/** 全局默认模板（客户未单独绑定时用）；加载见 init() */
const { deliveryTemplateDefault } = useFeatureFlags();
const featureStore = useFeatureStore();

const route = useRoute();
const router = useRouter();
const id = Number(route.query.id);

const loading = ref(true);
const note = ref<DeliveryNote | null>(null);
const errorMsg = ref('');
const originalTitle = document.title;

/**
 * 当前模板编码。优先级：客户资料绑定 → 系统配置的全局默认 → 通用模板。
 * 页面上可临时切换，**不回写客户资料**（切换只影响这一次打印）。
 */
const templateCode = ref('');

async function init() {
  if (!id) {
    goBack();
    return;
  }
  loading.value = true;
  try {
    const [res] = await Promise.all([
      getDeliveryNote(id),
      // 顶层路由没有 Layout 兜底，全局默认模板必须自己确保加载（见文件头注释）；
      // 已加载过则跳过，不重复请求
      featureStore.loaded ? Promise.resolve() : featureStore.load(),
    ]);
    note.value = res;
    templateCode.value = res.templateCode || deliveryTemplateDefault.value;
    // 打印/另存 PDF 的默认文件名取自 document.title
    document.title = `送货单-${res.deliveryNo || res.docNo}`;
  } catch (err: any) {
    // 非销售出库 / 已作废 / 跨客户等守卫的中文原因要显示出来，别只留一张空白页
    errorMsg.value = err?.response?.data?.message || err?.message || '未能加载送货单';
    ElMessage.error(errorMsg.value);
  } finally {
    loading.value = false;
  }
}
init();

// 开关是异步到达的：接口先回来时先用客户绑定值渲染，默认值到位后再补上（仅当客户没绑定）
watch(deliveryTemplateDefault, (v) => {
  if (note.value && !note.value.templateCode && !templateCode.value) templateCode.value = v;
});

function onPrint() {
  window.print();
}

const downloading = ref(false);
async function onDownloadPdf() {
  downloading.value = true;
  try {
    await downloadDeliveryNotePdf(id, `送货单-${note.value?.deliveryNo || note.value?.docNo}.pdf`);
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
export default { name: 'DeliveryNotePrint' };
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

  /* 页边距与纸面的 padding 保持一致（见组件注释），
     打印机不可打印区通常 ≥5mm，再小会被截 */
  @page { size: A4 portrait; margin: 7mm 5mm; }

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
