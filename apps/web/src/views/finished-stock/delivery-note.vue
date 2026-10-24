<template>
  <main class="print-preview-page">
    <header class="preview-toolbar no-print">
      <el-button size="small" :icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <div class="preview-toolbar__title">
        <strong>送货单</strong>
        <el-select v-model="templateCode" size="small" style="width: 130px" :disabled="loading || !note">
          <el-option v-for="t in DELIVERY_TEMPLATE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-select v-model="profileId" size="small" style="width: 190px" :disabled="loading" @change="loadProfile">
          <el-option v-for="p in runtime?.options || []" :key="p.id" :label="`${p.name} · v${p.version}`" :value="p.id" />
        </el-select>
        <el-tag v-if="runtime" size="small" type="info">v{{ runtime.version }}</el-tag>
        <span>本次临时切换，不改全局默认</span>
      </div>
      <div>
        <el-button size="small" :icon="Printer" :disabled="loading || !note || !runtime" @click="onPrint">打印</el-button>
        <el-button size="small" type="primary" :icon="Download" v-permission.disable="'finished-stock:print'"
          :loading="downloading" :disabled="loading || !note || !runtime" @click="onDownloadPdf">导出PDF</el-button>
      </div>
    </header>

    <div v-if="runtime" class="driver-tip no-print">
      {{ driverPrintTip }}
    </div>
    <section class="sheet-stage" v-loading="loading">
      <template v-if="note && runtime">
        <div class="sheet-pages">
          <template v-for="(rows, index) in pages" :key="index">
            <preprinted-note-sheet v-if="runtime.config.mode === 'preprinted'" class="sheet-shadow"
              :config="runtime.config" :note="note as any" :rows="rows as any" />
            <delivery-note-sheet v-else class="sheet-shadow" :note="pageNote(rows)" :template-code="templateCode"
              :profile-config="runtime.config" :show-total="index === pages.length - 1" />
          </template>
        </div>
        <div v-if="runtime.config.mode === 'blank' && runtime.config.pagination.strategy === 'auto'"
          ref="measureHost" class="pagination-measure no-print" aria-hidden="true">
          <delivery-note-sheet :note="note" :template-code="templateCode" :profile-config="runtime.config" measurement />
        </div>
      </template>
      <el-empty v-if="!loading && (!note || !runtime)" :description="errorMsg || '未能加载送货单'" />
    </section>
    <span v-if="printReady" data-print-ready="true" hidden></span>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Printer, Download } from '@element-plus/icons-vue';
import { getDeliveryNote, downloadDeliveryNotePdf, type DeliveryNote, type DeliveryNoteRow } from '@/api/finished-stock';
import { getRuntimePrintProfile, type RuntimePrintProfile } from '@/api/print-config';
import { measurePrintRows, paginateRows, type PrintRowMeasurement } from '@/utils/print-pagination';
import { readBlobError } from '@/utils/download';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useFeatureStore } from '@/stores/feature';
import { DELIVERY_TEMPLATE_OPTIONS } from '@/constants/delivery-note';
import { printWithDriverOrientation } from '@/utils/browser-print';
import { printDriverOrientationOf, printDriverTipOf } from '@/utils/print-paper';
import DeliveryNoteSheet from '@/components/print/DeliveryNoteSheet.vue';
import PreprintedNoteSheet from '@/components/print/PreprintedNoteSheet.vue';

const { deliveryTemplateDefault } = useFeatureFlags();
const featureStore = useFeatureStore();
const route = useRoute();
const router = useRouter();
const id = Number(route.query.id);
const requestedProfileId = Number(route.query.profileId) || undefined;
const requestedVersion = Number(route.query.version) || undefined;
const loading = ref(true);
const note = ref<DeliveryNote | null>(null);
const runtime = ref<RuntimePrintProfile | null>(null);
const profileId = ref<number>();
const templateCode = ref(String(route.query.templateCode || ''));
const errorMsg = ref('');
const originalTitle = document.title;
const measureHost = ref<HTMLElement | null>(null);
const rowMeasurement = ref<PrintRowMeasurement>();
const printReady = computed(() => !!note.value && !!runtime.value
  && (runtime.value.config.mode === 'preprinted'
    || runtime.value.config.pagination.strategy === 'fixed'
    || !!rowMeasurement.value));
const driverPrintTip = computed(() => runtime.value ? printDriverTipOf(runtime.value.config.paper) : '');

const pages = computed(() => note.value && runtime.value
  ? paginateRows(
    note.value.rows as unknown as Record<string, unknown>[],
    runtime.value.config,
    rowMeasurement.value,
    { footerOnLastPageOnly: true },
  ) as unknown as DeliveryNoteRow[][]
  : []);
function pageNote(rows: DeliveryNoteRow[]): DeliveryNote { return { ...note.value!, rows }; }

async function init() {
  if (!id) return goBack();
  try {
    const [res, profile] = await Promise.all([
      getDeliveryNote(id), getRuntimePrintProfile('delivery_note', requestedProfileId, requestedVersion),
      featureStore.loaded ? Promise.resolve() : featureStore.load(),
    ]);
    note.value = res;
    runtime.value = profile;
    profileId.value = profile.profileId;
    templateCode.value ||= res.templateCode || deliveryTemplateDefault.value;
    document.title = `送货单-${res.deliveryNo || res.docNo}`;
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.message || err?.message || '未能加载送货单';
    ElMessage.error(errorMsg.value);
  } finally { loading.value = false; }
}
void init();

watch(deliveryTemplateDefault, (v) => {
  if (note.value && !note.value.templateCode && !templateCode.value) templateCode.value = v;
});

async function measurePagination() {
  rowMeasurement.value = undefined;
  if (!note.value || !runtime.value || runtime.value.config.mode !== 'blank'
    || runtime.value.config.pagination.strategy !== 'auto') return;
  await nextTick();
  await document.fonts?.ready;
  await nextTick();
  const host = measureHost.value;
  if (!host) return;
  rowMeasurement.value = measurePrintRows(host, note.value.rows.length);
}

watch(
  [() => note.value?.rows, () => runtime.value?.config, templateCode],
  () => { void measurePagination(); },
  { deep: true, flush: 'post' },
);

async function loadProfile(value: number) {
  try { runtime.value = await getRuntimePrintProfile('delivery_note', value); }
  catch (err: any) { ElMessage.error(err?.message || '纸型加载失败'); }
}

let pageStyle: HTMLStyleElement | null = null;
watch(() => runtime.value?.config.paper, (paper) => {
  pageStyle?.remove();
  if (!paper) return;
  pageStyle = document.createElement('style');
  pageStyle.textContent = `@page{size:${paper.widthMm}mm ${paper.heightMm}mm;margin:0}`;
  document.head.appendChild(pageStyle);
}, { immediate: true, deep: true });

function onPrint() {
  if (!runtime.value) return;
  printWithDriverOrientation(printDriverOrientationOf(runtime.value.config.paper));
}
const downloading = ref(false);
async function onDownloadPdf() {
  if (!runtime.value) return;
  downloading.value = true;
  try {
    await downloadDeliveryNotePdf(id, `送货单-${note.value?.deliveryNo || note.value?.docNo}.pdf`, {
      profileId: runtime.value.profileId, version: runtime.value.version, templateCode: templateCode.value,
    });
  } catch (err) { ElMessage.error(await readBlobError(err)); }
  finally { downloading.value = false; }
}
function goBack() { router.push('/finished-stock'); }
onBeforeUnmount(() => { document.title = originalTitle; pageStyle?.remove(); });
</script>

<script lang="ts">export default { name: 'DeliveryNotePrint' };</script>

<style scoped>
.print-preview-page { min-width: 100%; min-height: 100vh; background: #eef0f3; color: #111; }
.preview-toolbar { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: auto 1fr auto; gap: 20px; align-items: center; min-height: 56px; padding: 0 24px; background: #fff; border-bottom: 1px solid #dcdfe6; }
.preview-toolbar__title { display: flex; align-items: center; justify-content: center; gap: 10px; white-space: nowrap; }
.preview-toolbar__title span { color: #909399; font-size: 12px; }
.driver-tip { padding: 8px 24px; background: #fffbe6; color: #8a6500; font-size: 12px; text-align: center; }
.sheet-stage { box-sizing: border-box; min-height: calc(100vh - 57px); padding: 24px; overflow: auto; }
.sheet-shadow { box-shadow: 0 3px 18px rgb(0 0 0 / 14%); }
.pagination-measure { position: fixed; top: 0; left: -10000px; visibility: hidden; pointer-events: none; }
@media print {
  :global(html), :global(body), :global(#app) { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .print-preview-page, .sheet-stage { width: auto; min-height: 0; margin: 0; padding: 0; background: #fff; }
  .sheet-stage { overflow: visible; }
  .no-print { display: none !important; }
  /* 纸面单独包一层：分页测量节点排在纸面之后，不包的话最后一张纸面不是 last-child，会多走一张空白纸 */
  .sheet-pages > :deep(.print-sheet:last-child) { break-after: auto; }
}
</style>
