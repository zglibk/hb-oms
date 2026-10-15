<template>
  <div class="page print-config-page">
    <el-card shadow="never">
      <el-tabs v-model="tab">
        <el-tab-pane label="送货单模板" name="delivery-template">
          <div class="template-layout">
            <div class="template-list">
              <div v-for="t in DELIVERY_TEMPLATES" :key="t.code" class="template-item" :class="{ active: currentTemplate === t.code }" @click="currentTemplate = t.code">
                <div><strong>{{ t.name }}</strong><el-tag v-if="t.code === defaultTemplate" size="small" type="success">默认</el-tag></div>
                <span>{{ t.description }}</span>
              </div>
              <el-button type="primary" v-permission.disable="'config:update'" :disabled="currentTemplate === defaultTemplate" :loading="templateSaving" @click="setDefaultTemplate">设为默认模板</el-button>
            </div>
            <div class="template-preview-pane" v-loading="templatePreviewLoading">
              <div class="toolbar template-preview-toolbar">
                <span>预览纸型</span>
                <el-select v-model="templatePreviewProfileId" size="small" style="width: 220px" @change="loadTemplatePreviewProfile">
                  <el-option v-for="p in selectable('delivery_note')" :key="p.id" :label="`${p.name} · v${p.version}`" :value="p.id" />
                </el-select>
                <span v-if="templatePreviewPaperTip" class="tip">{{ templatePreviewPaperTip }}</span>
              </div>
              <delivery-note-sheet-preview v-if="templatePreviewRuntime" :note="SAMPLE_DELIVERY_NOTE as any"
                :template-code="currentTemplate" :profile-config="templatePreviewRuntime.config" />
              <el-empty v-else description="未能加载送货单预览纸型" />
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="纸型档案" name="profiles">
          <div class="toolbar">
            <el-radio-group v-model="documentType" size="small" @change="loadProfiles">
              <el-radio-button value="delivery_note">送货单</el-radio-button><el-radio-button value="inbound_note">入库单</el-radio-button>
            </el-radio-group>
            <el-button type="primary" size="small" v-permission.disable="'config:update'" @click="openCreate">新增纸型</el-button>
            <span class="tip">草稿保存后不会影响正式打印，必须发布才生效。</span>
          </div>
          <el-table :data="filteredProfiles" border v-loading="loading">
            <el-table-column prop="name" label="纸型名称" min-width="170" />
            <el-table-column label="单据" width="90"><template #default="{ row }">{{ docLabel(row.documentType) }}</template></el-table-column>
            <el-table-column label="状态" width="80"><template #default="{ row }"><el-tag :type="row.status ? 'success' : 'info'">{{ row.status ? '启用' : '停用' }}</el-tag></template></el-table-column>
            <el-table-column label="来源" width="90"><template #default="{ row }">{{ row.isBuiltin ? '内置回退' : '自定义' }}</template></el-table-column>
            <el-table-column label="已发布" width="90"><template #default="{ row }">{{ row.publishedVersionNo ? `v${row.publishedVersionNo}` : '未发布' }}</template></el-table-column>
            <el-table-column label="操作" width="330" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" v-permission.disable="'config:update'" @click="editProfile(row.id)">编辑草稿</el-button>
                <el-button link type="success" v-permission.disable="'config:update'" @click="publish(row.id)">发布</el-button>
                <el-button link @click="showVersions(row.id)">版本/回退</el-button>
                <el-button link v-permission.disable="'config:update'" :disabled="!!row.isBuiltin && !!row.status" @click="toggleStatus(row)">{{ row.status ? '停用' : '启用' }}</el-button>
                <el-button link type="danger" v-permission.disable="'config:update'" :disabled="!!row.isBuiltin" @click="removeProfile(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="套打设计器" name="designer">
          <div class="toolbar">
            <el-select v-model="designerProfileId" filterable placeholder="选择一个纸型" style="width: 260px" @change="loadDesigner">
              <el-option v-for="p in profiles" :key="p.id" :label="`${docLabel(p.documentType)} · ${p.name}`" :value="p.id" />
            </el-select>
            <span class="tip">底图只用于定位预览，正式套打不会输出。试打请选择同尺寸驱动纸型、按纸型要求设置方向、缩放 100%、边距“无”并关闭页眉页脚；保存后仍需发布。</span>
          </div>
          <div class="designer-host" v-loading="designerLoading">
            <print-profile-designer v-if="designerDetail" :key="designerDetail.id" :config="designerDetail.draftConfig" :document-type="designerDetail.documentType" @save="saveDesigner" />
            <el-empty v-else description="请选择纸型进入设计器" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="默认纸型设置" name="defaults">
          <el-alert type="info" :closable="false" title="这里只设置每类单据的全局默认纸型；打印页仍可临时切换，不增加客户级纸型绑定。" />
          <el-form label-width="120px" class="defaults-form">
            <el-form-item label="送货单默认纸型"><el-select v-model="defaultMap.delivery_note" :disabled="!canUpdate" style="width: 280px"><el-option v-for="p in selectable('delivery_note')" :key="p.id" :label="`${p.name} · v${p.version}`" :value="p.id" /></el-select><el-button type="primary" v-permission.disable="'config:update'" @click="saveDefault('delivery_note')">保存</el-button></el-form-item>
            <el-form-item label="入库单默认纸型"><el-select v-model="defaultMap.inbound_note" :disabled="!canUpdate" style="width: 280px"><el-option v-for="p in selectable('inbound_note')" :key="p.id" :label="`${p.name} · v${p.version}`" :value="p.id" /></el-select><el-button type="primary" v-permission.disable="'config:update'" @click="saveDefault('inbound_note')">保存</el-button></el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="校准测试页" name="calibration">
          <div class="toolbar"><el-select v-model="calibrationId" style="width: 260px" @change="loadCalibration"><el-option v-for="p in profiles" :key="p.id" :label="`${docLabel(p.documentType)} · ${p.name}`" :value="p.id" /></el-select><el-button type="primary" @click="printCalibration">打印校准页</el-button></div>
          <el-alert type="warning" :closable="false" :title="calibrationAlert" />
          <div v-if="calibrationConfig" class="calibration-paper" :style="calibrationStyle">
            <div class="cross tl">＋</div><div class="cross tr">＋</div><div class="cross bl">＋</div><div class="cross br">＋</div>
            <div class="calibration-reading">← 文字阅读方向 →</div>
            <div class="calibration-feeding">↕ 走纸方向</div>
            <div class="calibration-center">{{ calibrationName }}<br />成品纸面 {{ calibrationBody?.widthMm }} × {{ calibrationBody?.heightMm }} mm<br />驱动进纸 {{ calibrationConfig.paper.widthMm }} × {{ calibrationConfig.paper.heightMm }} mm<br />驱动方向 {{ calibrationOrientationLabel }}<br />横竖线间距 10mm</div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-drawer v-model="editorOpen" :title="editingId ? '编辑纸型草稿' : '新增纸型'" size="520px" destroy-on-close>
      <el-form label-width="120px">
        <el-form-item label="纸型名称"><el-input v-model="editorName" maxlength="100" /></el-form-item>
        <el-form-item label="单据类型"><el-select v-model="editorType" :disabled="!!editingId"><el-option label="送货单" value="delivery_note" /><el-option label="入库单" value="inbound_note" /></el-select></el-form-item>
        <el-form-item label="打印模式"><el-radio-group v-model="editorConfig.mode"><el-radio value="blank">空白纸</el-radio><el-radio value="preprinted">预印套打</el-radio></el-radio-group></el-form-item>
        <el-form-item label="驱动进纸宽 × 高"><el-input-number v-model="editorConfig.paper.widthMm" :min="50" :max="500" :precision="1" /> × <el-input-number v-model="editorConfig.paper.heightMm" :min="50" :max="500" :precision="1" /> mm</el-form-item>
        <el-form-item label="成品纸面宽 × 高"><el-input-number v-model="editorConfig.paper.bodyWidthMm" :min="50" :max="editorConfig.paper.widthMm" :precision="1" /> × <el-input-number v-model="editorConfig.paper.bodyHeightMm" :min="50" :max="editorConfig.paper.heightMm" :precision="1" /> mm<small>撕除左右打孔边后的纸面尺寸</small></el-form-item>
        <el-form-item label="驱动纸型名称"><el-input v-model="editorConfig.paper.driverFormName" placeholder="如 OMS 9.5x5.5" /></el-form-item>
        <el-form-item label="驱动打印方向"><el-radio-group v-model="editorConfig.paper.driverOrientation"><el-radio value="portrait">纵向</el-radio><el-radio value="landscape">横向</el-radio></el-radio-group><small>须与 Windows 打印首选项一致；设反会整页旋转 90°</small></el-form-item>
        <el-collapse>
          <el-collapse-item title="高级配置" name="advanced">
            <el-form-item label="四边距"><div class="quad"><el-input-number v-model="editorConfig.margins.top" :min="0" :max="50" /><el-input-number v-model="editorConfig.margins.right" :min="0" :max="50" /><el-input-number v-model="editorConfig.margins.bottom" :min="0" :max="50" /><el-input-number v-model="editorConfig.margins.left" :min="0" :max="50" /></div><small>上 / 右 / 下 / 左（mm）</small></el-form-item>
            <el-form-item label="X / Y 偏移"><el-input-number v-model="editorConfig.offset.x" :min="-20" :max="20" :step="0.1" /> / <el-input-number v-model="editorConfig.offset.y" :min="-20" :max="20" :step="0.1" /> mm</el-form-item>
            <el-form-item label="字体缩放"><el-slider v-model="editorConfig.style.fontScale" :min="80" :max="120" show-input /></el-form-item>
            <el-form-item label="线条粗细"><el-input-number v-model="editorConfig.style.borderWidthPt" :min="0.1" :max="3" :step="0.05" /> pt</el-form-item>
            <el-form-item label="分页"><el-radio-group v-model="editorConfig.pagination.strategy"><el-radio value="auto">自动</el-radio><el-radio value="fixed">固定行数</el-radio></el-radio-group></el-form-item>
            <el-form-item label="每页明细"><el-input-number v-model="editorConfig.pagination.rowsPerPage" :min="1" :max="50" /> 行</el-form-item>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer><el-button @click="editorOpen = false">取消</el-button><el-button type="primary" v-permission.disable="'config:update'" :loading="saving" @click="saveEditor">保存草稿</el-button></template>
    </el-drawer>

    <el-dialog v-model="versionsOpen" title="发布历史与回退" width="620px">
      <el-table :data="versions" border><el-table-column prop="versionNo" label="版本" width="80"><template #default="{ row }">v{{ row.versionNo }}</template></el-table-column><el-table-column prop="publisherName" label="发布人" /><el-table-column prop="publishedAt" label="发布时间" /><el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="primary" v-permission.disable="'config:update'" @click="rollback(row.versionNo)">回退发布</el-button></template></el-table-column></el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { DELIVERY_TEMPLATES, SAMPLE_DELIVERY_NOTE, DEFAULT_DELIVERY_TEMPLATE, deliveryTemplateOf } from '@/constants/delivery-note';
import DeliveryNoteSheetPreview from '@/components/print/DeliveryNoteSheetPreview.vue';
import PrintProfileDesigner from '@/components/print/PrintProfileDesigner.vue';
import { updateSystemConfig } from '@/api/system';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { useFeatureStore } from '@/stores/feature';
import { useUserStore } from '@/stores/user';
import { printWithPageSize } from '@/utils/browser-print';
import {
  oppositePrintDriverOrientationLabelOf,
  printDriverOrientationLabelOf,
  printDriverOrientationOf,
  printPaperBodyOf,
} from '@/utils/print-paper';
import {
  createPrintProfile, defaultPrintConfig, deletePrintProfile, getPrintDefaults, getPrintProfile, getPrintProfiles,
  getPrintProfileVersions, getRuntimePrintProfile, publishPrintProfile, rollbackPrintProfile, setPrintDefault, updatePrintProfile,
  type PrintDocumentType, type PrintProfileConfig, type PrintProfileDetail, type PrintProfileSummary, type RuntimePrintProfile,
} from '@/api/print-config';

const tab = ref('delivery-template');
const { deliveryTemplateDefault } = useFeatureFlags();
const featureStore = useFeatureStore();
const userStore = useUserStore();
const canUpdate = computed(() => userStore.hasPermission('config:update'));
const currentTemplate = ref(DEFAULT_DELIVERY_TEMPLATE);
const defaultTemplate = computed(() => deliveryTemplateDefault.value || DEFAULT_DELIVERY_TEMPLATE);
const templateSaving = ref(false);
const templatePreviewLoading = ref(false);
const templatePreviewRuntime = ref<RuntimePrintProfile | null>(null);
const templatePreviewProfileId = ref<number>();
const templatePreviewBody = computed(() => templatePreviewRuntime.value
  ? printPaperBodyOf(templatePreviewRuntime.value.config.paper)
  : null);
const templatePreviewPaperTip = computed(() => {
  const runtime = templatePreviewRuntime.value;
  const body = templatePreviewBody.value;
  if (!runtime || !body) return '';
  const feed = runtime.config.paper;
  const orientation = printDriverOrientationLabelOf(feed);
  const hasTractorEdge = Math.abs(feed.widthMm - body.widthMm) > 0.01
    || Math.abs(feed.heightMm - body.heightMm) > 0.01;
  if (!hasTractorEdge) return `纸面 ${body.widthMm} × ${body.heightMm}mm；驱动方向 ${orientation}`;
  return `成品纸面 ${body.widthMm} × ${body.heightMm}mm（不含左右打孔边；驱动进纸 ${feed.widthMm} × ${feed.heightMm}mm）；驱动方向 ${orientation}`;
});
async function loadTemplatePreviewProfile(profileId?: number) {
  templatePreviewLoading.value = true;
  try {
    templatePreviewRuntime.value = await getRuntimePrintProfile('delivery_note', profileId);
    rememberRuntime(templatePreviewRuntime.value);
    templatePreviewProfileId.value = templatePreviewRuntime.value.profileId;
  } catch (err: any) {
    templatePreviewRuntime.value = null;
    ElMessage.error(err?.message || '送货单预览纸型加载失败');
  } finally { templatePreviewLoading.value = false; }
}
async function setDefaultTemplate() {
  templateSaving.value = true;
  try { await updateSystemConfig({ deliveryTemplateDefault: currentTemplate.value }); await featureStore.load(); ElMessage.success(`已设为「${deliveryTemplateOf(currentTemplate.value).name}」`); }
  finally { templateSaving.value = false; }
}

const loading = ref(false);
const profiles = ref<PrintProfileSummary[]>([]);
const documentType = ref<PrintDocumentType>('delivery_note');
const filteredProfiles = computed(() => profiles.value.filter((x) => x.documentType === documentType.value));
const defaultMap = reactive<Record<PrintDocumentType, number | undefined>>({ delivery_note: undefined, inbound_note: undefined });
type RuntimePrintOption = RuntimePrintProfile['options'][number];
const runtimeOptions = reactive<Record<PrintDocumentType, RuntimePrintOption[]>>({ delivery_note: [], inbound_note: [] });
function docLabel(v: PrintDocumentType) { return v === 'delivery_note' ? '送货单' : '入库单'; }
async function loadProfiles() { loading.value = true; try { profiles.value = await getPrintProfiles(); } finally { loading.value = false; } }
async function loadDefaults() { for (const x of await getPrintDefaults()) defaultMap[x.documentType] = x.defaultProfileId; }
function rememberRuntime(runtime: RuntimePrintProfile) {
  runtimeOptions[runtime.documentType] = runtime.options;
  if (runtime.defaultProfileId) defaultMap[runtime.documentType] = runtime.defaultProfileId;
}
async function loadRuntimeOptions(type: PrintDocumentType, profileId?: number) {
  const runtime = await getRuntimePrintProfile(type, profileId);
  rememberRuntime(runtime);
  return runtime;
}
function selectable(type: PrintDocumentType) { return runtimeOptions[type]; }
async function refreshPublishedOptions(type: PrintDocumentType) {
  const runtime = await loadRuntimeOptions(type);
  if (type === 'delivery_note') {
    templatePreviewRuntime.value = runtime;
    templatePreviewProfileId.value = runtime.profileId;
  }
}
async function saveDefault(type: PrintDocumentType) {
  const id = defaultMap[type];
  if (!id) return;
  await setPrintDefault(type, id);
  if (type === 'delivery_note') await loadTemplatePreviewProfile(id);
  else await loadRuntimeOptions(type, id);
  ElMessage.success(`${docLabel(type)}默认纸型已保存`);
}

const editorOpen = ref(false); const editingId = ref<number>(); const editorName = ref(''); const editorType = ref<PrintDocumentType>('delivery_note');
const editorConfig = reactive<PrintProfileConfig>(defaultPrintConfig('delivery_note')); const saving = ref(false);
function cloneConfig(config: PrintProfileConfig): PrintProfileConfig { return structuredClone(toRaw(config)); }
function fillEditor(config: PrintProfileConfig) {
  const copy = cloneConfig(config);
  const body = printPaperBodyOf(copy.paper);
  copy.paper.bodyWidthMm = body.widthMm;
  copy.paper.bodyHeightMm = body.heightMm;
  copy.paper.driverOrientation = printDriverOrientationOf(copy.paper);
  Object.assign(editorConfig, copy);
}
function openCreate() { editingId.value = undefined; editorName.value = ''; editorType.value = documentType.value; fillEditor(defaultPrintConfig(documentType.value)); editorOpen.value = true; }
async function editProfile(id: number) { const p = await getPrintProfile(id); editingId.value = id; editorName.value = p.name; editorType.value = p.documentType; fillEditor(p.draftConfig); editorOpen.value = true; }
async function saveEditor() {
  if (!editorName.value.trim()) return ElMessage.warning('请输入纸型名称'); saving.value = true;
  try {
    if (editingId.value) await updatePrintProfile(editingId.value, { name: editorName.value, config: cloneConfig(editorConfig) });
    else await createPrintProfile({ name: editorName.value, documentType: editorType.value, config: cloneConfig(editorConfig) });
    editorOpen.value = false; await loadProfiles(); ElMessage.success('草稿已保存，发布后才影响正式打印');
  } finally { saving.value = false; }
}
async function publish(id: number) {
  const type = profiles.value.find((x) => x.id === id)?.documentType;
  await publishPrintProfile(id); await loadProfiles();
  if (type) await refreshPublishedOptions(type);
  ElMessage.success('发布成功');
}
async function toggleStatus(row: PrintProfileSummary) {
  await updatePrintProfile(row.id, { status: row.status ? 0 : 1 }); await loadProfiles();
  await refreshPublishedOptions(row.documentType);
}
async function removeProfile(row: PrintProfileSummary) {
  await ElMessageBox.confirm(`确认删除「${row.name}」？`, '删除纸型', { type: 'warning' });
  await deletePrintProfile(row.id); await loadProfiles(); await refreshPublishedOptions(row.documentType);
}

const versionsOpen = ref(false); const versions = ref<any[]>([]); const versionProfileId = ref(0);
async function showVersions(id: number) { versionProfileId.value = id; versions.value = await getPrintProfileVersions(id); versionsOpen.value = true; }
async function rollback(version: number) {
  await ElMessageBox.confirm(`将该历史配置复制为新版本并立即发布，确认回退到 v${version}？`, '回退发布', { type: 'warning' });
  const type = profiles.value.find((x) => x.id === versionProfileId.value)?.documentType;
  await rollbackPrintProfile(versionProfileId.value, version);
  versions.value = await getPrintProfileVersions(versionProfileId.value); await loadProfiles();
  if (type) await refreshPublishedOptions(type);
  ElMessage.success('已生成并发布新的回退版本');
}

const designerProfileId = ref<number>(); const designerDetail = ref<PrintProfileDetail | null>(null); const designerLoading = ref(false);
async function loadDesigner(id: number) {
  designerLoading.value = true;
  try { designerDetail.value = await getPrintProfile(id); }
  catch (err: any) { designerDetail.value = null; ElMessage.error(err?.message || '纸型详情加载失败'); }
  finally { designerLoading.value = false; }
}
async function saveDesigner(config: PrintProfileConfig) {
  if (!designerDetail.value) return; config.mode = 'preprinted';
  await updatePrintProfile(designerDetail.value.id, { config: cloneConfig(config) }); designerDetail.value = await getPrintProfile(designerDetail.value.id); ElMessage.success('套打草稿已保存，请确认后发布');
}

const calibrationId = ref<number>();
const calibrationProfile = computed(() => profiles.value.find((x) => x.id === calibrationId.value));
const calibrationDetail = ref<PrintProfileDetail | null>(null);
const calibrationConfig = computed(() => calibrationDetail.value?.publishedConfig || calibrationDetail.value?.draftConfig);
const calibrationBody = computed(() => calibrationConfig.value ? printPaperBodyOf(calibrationConfig.value.paper) : null);
const calibrationName = computed(() => calibrationProfile.value?.name || '校准测试页');
const calibrationOrientationLabel = computed(() => calibrationConfig.value
  ? printDriverOrientationLabelOf(calibrationConfig.value.paper)
  : '');
const calibrationAlert = computed(() => {
  const config = calibrationConfig.value;
  if (!config) return '请选择纸型后打印校准页。';
  const orientation = printDriverOrientationLabelOf(config.paper);
  const opposite = oppositePrintDriverOrientationLabelOf(config.paper);
  return `打印对话框请选择同名纸型，并把驱动方向设为“${orientation}”；若显示“${opposite}”，整页会旋转 90°。同时设置 100% 缩放、无边距、关闭页眉页脚。用十字线实测后，把误差填回纸型的 X/Y 偏移。`;
});
const calibrationStyle = computed(() => {
  if (!calibrationConfig.value) return {};
  const body = printPaperBodyOf(calibrationConfig.value.paper);
  return {
    width: `${body.widthMm}mm`, height: `${body.heightMm}mm`,
    '--page-offset-x': `${body.offsetXmm}mm`, '--page-offset-y': `${body.offsetYmm}mm`,
  };
});
async function loadCalibration(id: number) { calibrationDetail.value = await getPrintProfile(id); }
async function printCalibration() {
  if (!calibrationId.value) return ElMessage.warning('请选择纸型');
  await loadCalibration(calibrationId.value);
  const paper = calibrationConfig.value?.paper;
  if (!paper) return;
  printWithPageSize({
    widthMm: paper.widthMm,
    heightMm: paper.heightMm,
    bodyClass: 'printing-calibration',
  });
}

onMounted(async () => {
  currentTemplate.value = defaultTemplate.value;
  await Promise.all([loadProfiles(), loadDefaults()]);
  await Promise.all([loadTemplatePreviewProfile(), loadRuntimeOptions('inbound_note')]);
  designerProfileId.value = profiles.value[0]?.id;
  if (designerProfileId.value) await loadDesigner(designerProfileId.value);
  calibrationId.value = profiles.value[0]?.id;
  if (calibrationId.value) calibrationDetail.value = await getPrintProfile(calibrationId.value);
});
</script>

<script lang="ts">export default { name: 'PrintTemplate' };</script>
<style scoped>
.page { padding: 12px; }.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }.tip { color: #909399; font-size: 12px; }
.template-layout { display: grid; grid-template-columns: 280px minmax(0,1fr); gap: 14px; align-items: start; }.template-list { display: flex; flex-direction: column; gap: 8px; }.template-preview-pane { min-width: 0; }.template-preview-toolbar { margin-bottom: 8px; }
.template-item { padding: 9px 11px; border: 1px solid #e4e7ed; border-radius: 5px; cursor: pointer; }.template-item.active { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }.template-item div { display: flex; justify-content: space-between; }.template-item span { display: block; margin-top: 4px; color: #909399; font-size: 12px; }
.defaults-form { margin-top: 24px; max-width: 620px; }.defaults-form .el-button { margin-left: 10px; }.quad { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.quad :deep(.el-input-number) { width: 140px; }
.designer-host { min-height: 560px; }
.calibration-paper { position: relative; box-sizing: border-box; margin: 20px auto; background-color: #fff; background-image: linear-gradient(to right,#d8dee8 1px,transparent 1px),linear-gradient(to bottom,#d8dee8 1px,transparent 1px); background-size: 10mm 10mm; box-shadow: 0 2px 14px #0003; overflow: hidden; }.cross { position: absolute; font-size: 20px; }.tl{left:5mm;top:3mm}.tr{right:5mm;top:3mm}.bl{left:5mm;bottom:3mm}.br{right:5mm;bottom:3mm}.calibration-center { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; line-height: 1.8; }.calibration-reading { position: absolute; top: 4mm; left: 50%; transform: translateX(-50%); font-weight: 700; white-space: nowrap; }.calibration-feeding { position: absolute; top: 50%; right: 2mm; transform: translateY(-50%); writing-mode: vertical-rl; font-weight: 700; white-space: nowrap; }
@media print {
  :global(body.printing-designer *) { visibility: hidden !important; }
  :global(body.printing-designer .designer), :global(body.printing-designer .designer *) { visibility: visible !important; }
  :global(body.printing-designer .designer) { position: fixed; left: 0; top: 0; }
  :global(body.printing-calibration *) { visibility: hidden !important; }
  :global(body.printing-calibration) .calibration-paper, :global(body.printing-calibration) .calibration-paper * { visibility: visible !important; }
  :global(body.printing-calibration) .calibration-paper { position: fixed; left: var(--page-offset-x, 0); top: var(--page-offset-y, 0); margin: 0; box-shadow: none; }
}
</style>
