<template>
  <div class="designer" :style="designerStyle">
    <div class="designer-toolbar">
      <el-button size="small" v-permission.disable="'config:update'" :disabled="!canUpdate" @click="addText">添加固定文字</el-button>
      <el-button size="small" v-permission.disable="'config:update'" :disabled="!canUpdate" @click="addTable">添加明细表</el-button>
      <el-upload :show-file-list="false" accept="image/png,image/jpeg" :disabled="!canUpdate" :before-upload="uploadBackground">
        <el-button size="small" v-permission.disable="'config:update'" :loading="uploading" :disabled="!canUpdate">上传定位底图</el-button>
      </el-upload>
      <el-button size="small" v-permission.disable="'config:update'" :disabled="!canUpdate || !draft.backgroundImageUrl" @click="draft.backgroundImageUrl = ''">清除底图</el-button>
      <el-checkbox v-model="showGrid">毫米网格</el-checkbox>
      <span>缩放</span><el-slider v-model="zoom" :min="50" :max="150" :step="10" style="width: 120px" />
      <span>吸附</span><el-input-number v-model="snapMm" :disabled="!canUpdate" :min="0.1" :max="5" :step="0.1" size="small" /> mm
      <el-button size="small" type="primary" v-permission.disable="'config:update'" :disabled="!canUpdate" @click="saveDraft">保存草稿</el-button>
      <el-button size="small" @click="testPrint">试打当前画布</el-button>
    </div>

    <div class="designer-main">
      <div class="palette">
        <strong>可用字段</strong>
        <button v-for="f in fields" :key="f.value" v-permission.disable="'config:update'" :draggable="canUpdate" :disabled="!canUpdate" class="palette-field"
          :class="{ dragging: draggingField === f.value }" :title="`拖到纸面添加${f.label}`"
          @dragstart="startPaletteDrag($event, f)" @dragend="finishPaletteDrag">
          <span class="drag-grip" aria-hidden="true">⋮⋮</span>{{ f.label }}
        </button>
        <p>将字段拖到纸面添加；滚轮以指针位置为中心缩放。方向键微调 0.1mm，Shift + 方向键移动 1mm，拖动右下角方块可调整大小。</p>
      </div>
      <div ref="canvasScrollRef" class="canvas-scroll" @wheel.prevent="zoomAtPointer">
        <div class="canvas-stage">
          <div class="canvas-frame">
            <div class="ruler ruler-x">
              <i v-for="tick in rulerXTicks" :key="tick.value" class="ruler-mark" :class="{ major: tick.major }"
                :style="{ left: tick.position }">
                <span v-if="tick.label" class="ruler-label">{{ tick.label }}</span>
              </i>
            </div>
            <div class="ruler ruler-y">
              <i v-for="tick in rulerYTicks" :key="tick.value" class="ruler-mark" :class="{ major: tick.major }"
                :style="{ top: tick.position }">
                <span v-if="tick.label" class="ruler-label">{{ tick.label }}</span>
              </i>
            </div>
            <div ref="canvasRef" class="paper-canvas" :class="{ grid: showGrid, 'drop-ready': draggingField }"
              :style="canvasStyle" @dragover.prevent @drop.prevent="dropField">
              <img v-if="draft.backgroundImageUrl" class="calibration-bg" :src="draft.backgroundImageUrl" alt="定位底图" />
              <div v-for="item in elements" :key="item.id" :tabindex="canUpdate ? 0 : -1" class="design-item"
                :class="{ active: selectedId === item.id, table: item.type === 'table', readonly: !canUpdate }"
                :style="itemStyle(item)" @pointerdown="startDrag($event, item)" @keydown="nudge($event, item)" @click.stop="selectedId = item.id">
                <table v-if="item.type === 'table'" class="sample-table">
                  <colgroup><col v-for="column in item.columns" :key="column.field" :style="{ width: `${column.widthPct}%` }" /></colgroup>
                  <thead v-if="item.showHeader"><tr><th v-for="column in item.columns" :key="column.field">{{ column.label }}</th></tr></thead>
                  <tbody><tr v-for="row in sampleRows" :key="row.seq"><td v-for="column in item.columns" :key="column.field" :style="{ textAlign: column.align, height: `${item.rowHeightMm * pxPerMm}px` }">{{ sampleRowValue(row, column.field) }}</td></tr></tbody>
                </table>
                <template v-else>{{ item.type === 'staticText' ? item.text : sampleField(item.field) }}</template>
                <i class="resize-handle" @pointerdown.stop="startResize($event, item)"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="properties">
        <strong>元素属性</strong>
        <template v-if="selected">
          <el-form label-width="62px" size="small">
            <el-form-item label="X / Y"><el-input-number v-model="selected.xMm" :disabled="!canUpdate" :step="0.1" /> / <el-input-number v-model="selected.yMm" :disabled="!canUpdate" :step="0.1" /></el-form-item>
            <el-form-item label="宽 / 高"><el-input-number v-model="selected.widthMm" :disabled="!canUpdate" :min="1" :step="0.5" /> / <el-input-number v-model="selected.heightMm" :disabled="!canUpdate" :min="1" :step="0.5" /></el-form-item>
            <template v-if="selected.type !== 'table'">
              <el-form-item v-if="selected.type === 'field'" label="字段"><el-select v-model="selected.field" :disabled="!canUpdate"><el-option v-for="f in fields" :key="f.value" :label="f.label" :value="f.value" /></el-select></el-form-item>
              <el-form-item v-else label="文字"><el-input v-model="selected.text" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="字号"><el-input-number v-model="selected.fontSizePt" :disabled="!canUpdate" :min="6" :max="36" /></el-form-item>
              <el-form-item label="粗体"><el-switch v-model="selected.fontWeight" :disabled="!canUpdate" active-value="bold" inactive-value="normal" /></el-form-item>
              <el-form-item label="对齐"><el-select v-model="selected.align" :disabled="!canUpdate"><el-option label="左" value="left" /><el-option label="中" value="center" /><el-option label="右" value="right" /></el-select></el-form-item>
            </template>
            <template v-else>
              <el-form-item label="行高"><el-input-number v-model="selected.rowHeightMm" :disabled="!canUpdate" :min="2" :max="50" :step="0.5" /></el-form-item>
              <el-form-item label="表头"><el-switch v-model="selected.showHeader" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="列宽">
                <div class="column-widths">
                  <label v-for="column in selected.columns" :key="column.field">
                    <span>{{ column.label }}</span><el-input-number v-model="column.widthPct" :disabled="!canUpdate" :min="1" :max="100" :step="0.5" />%
                  </label>
                  <el-button size="small" v-permission.disable="'config:update'" :disabled="!canUpdate" @click="normalizeColumns">平均分配为 100%</el-button>
                </div>
              </el-form-item>
            </template>
          </el-form>
          <el-button size="small" type="danger" plain v-permission.disable="'config:update'" :disabled="!canUpdate" @click="removeSelected">删除元素</el-button>
        </template>
        <el-empty v-else description="点选画布元素" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, toRaw, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { uploadFile } from '@/api/file';
import { printWithDriverOrientation } from '@/utils/browser-print';
import { printDriverOrientationOf, printPaperBodyOf } from '@/utils/print-paper';
import { useUserStore } from '@/stores/user';
import type { PrintDocumentType, PrintLayoutField, PrintLayoutTable, PrintProfileConfig } from '@/api/print-config';

const props = defineProps<{ config: PrintProfileConfig; documentType: PrintDocumentType }>();
const emit = defineEmits<{ save: [config: PrintProfileConfig] }>();
const userStore = useUserStore();
const canUpdate = computed(() => userStore.hasPermission('config:update'));
function cloneConfig(config: PrintProfileConfig): PrintProfileConfig {
  return structuredClone(toRaw(config));
}
const draft = reactive<PrintProfileConfig>(cloneConfig(props.config));
if (!draft.layout) draft.layout = { snapMm: 0.5, elements: [] };
watch(() => props.config, (v) => {
  Object.assign(draft, cloneConfig(v));
  if (!draft.layout) draft.layout = { snapMm: 0.5, elements: [] };
}, { deep: true });
const elements = computed(() => draft.layout!.elements);
const selectedId = ref('');
const selected = computed<any>(() => elements.value.find((x) => x.id === selectedId.value));
const zoom = ref(100);
const showGrid = ref(true);
const snapMm = computed({ get: () => draft.layout?.snapMm ?? .5, set: (v) => { if (draft.layout) draft.layout.snapMm = v; } });
const canvasRef = ref<HTMLElement>();
const canvasScrollRef = ref<HTMLElement>();
const draggingField = ref('');
const pxPerMm = computed(() => 2 * zoom.value / 100);
const paperBody = computed(() => printPaperBodyOf(draft.paper));
const designerStyle = computed(() => ({
  '--paper-width': `${paperBody.value.widthMm}mm`,
  '--paper-height': `${paperBody.value.heightMm}mm`,
  '--page-offset-x': `${paperBody.value.offsetXmm}mm`,
  '--page-offset-y': `${paperBody.value.offsetYmm}mm`,
  '--offset-x': `${draft.offset.x}mm`,
  '--offset-y': `${draft.offset.y}mm`,
  '--font-scale': String(draft.style.fontScale / 100),
}));
const canvasStyle = computed(() => ({ width: `${paperBody.value.widthMm * pxPerMm.value}px`, height: `${paperBody.value.heightMm * pxPerMm.value}px`, '--mm': `${pxPerMm.value}px`, backgroundImage: draft.backgroundImageUrl ? undefined : undefined }));
const rulerLabelStep = computed(() => zoom.value <= 70 ? 20 : 10);
function buildRulerTicks(lengthMm: number) {
  const values = Array.from({ length: Math.floor(lengthMm / 5) + 1 }, (_, index) => index * 5);
  if (lengthMm - values[values.length - 1] > 0.01) values.push(lengthMm);
  return values.map((value) => ({
    value,
    position: `${value / lengthMm * 100}%`,
    major: value % 10 === 0,
    label: value % rulerLabelStep.value === 0 ? String(value) : '',
  }));
}
const rulerXTicks = computed(() => buildRulerTicks(paperBody.value.widthMm));
const rulerYTicks = computed(() => buildRulerTicks(paperBody.value.heightMm));

const fieldSets = {
  delivery_note: [
    ['deliveryNo', '送货单号'], ['docDate', '日期'], ['customerName', '客户'], ['customerPhone', '客户电话'],
    ['customerAddress', '收货地址'], ['salesman', '业务员'], ['merchandiser', '跟单员'], ['creatorName', '制单人'], ['remark', '备注'],
  ],
  inbound_note: [['docNo', '入库单号'], ['docDate', '入库日期'], ['workshopLabel', '车间'], ['creatorName', '制单人'], ['remark', '备注']],
} as const;
const fields = computed(() => fieldSets[props.documentType].map(([value, label]) => ({ value, label })));
const rowFields = props.documentType === 'delivery_note'
  ? [['seq', '序号'], ['productionNo', '生产单号'], ['itemNo', '产品代码'], ['productName', '产品名称'], ['specText', '规格'], ['qty', '数量'], ['unitLabel', '单位']]
  : [['seq', '序号'], ['productionNo', '生产单号'], ['itemNo', '产品代码'], ['productName', '产品名称'], ['specText', '规格'], ['qty', '数量'], ['unitLabel', '单位']];
const sampleRows = [
  { seq: 1, productionNo: 'HYS0921', itemNo: '7851407', productName: '45#普通滑轨', specText: '450mm', qty: 1000, unitLabel: '支' },
  { seq: 2, productionNo: 'GRA7809', itemNo: 'P004305', productName: '35#缓冲滑轨', specText: '375mm', qty: 800, unitLabel: '套' },
];
const sampleFields: Record<string, string> = props.documentType === 'delivery_note'
  ? { deliveryNo: '20261013-0001', docDate: '2026-10-13', customerName: '样例客户', customerPhone: '0760-88888888', customerAddress: '中山市样例路 1 号', salesman: '张三', merchandiser: '李四', creatorName: '制单员', remark: '样例备注' }
  : { docNo: 'FGI261013-0001', docDate: '2026-10-13', workshopLabel: '装一车间', creatorName: '制单员', remark: '样例备注' };
function id() { return `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function addField(field: string, label: string, xMm: number, yMm: number) {
  const widthMm = 45;
  const heightMm = 7;
  const item: PrintLayoutField = {
    id: id(), type: 'field', field,
    xMm: Math.max(0, Math.min(paperBody.value.widthMm - widthMm, snap(xMm - widthMm / 2))),
    yMm: Math.max(0, Math.min(paperBody.value.heightMm - heightMm, snap(yMm - heightMm / 2))),
    widthMm, heightMm, fontSizePt: 10, fontWeight: 'normal', align: 'left',
  };
  elements.value.push(item); selectedId.value = item.id; ElMessage.success(`已添加「${label}」`);
}
function startPaletteDrag(e: DragEvent, field: { value: string; label: string }) {
  if (!canUpdate.value) return;
  draggingField.value = field.value;
  e.dataTransfer?.setData('application/x-hb-oms-print-field', JSON.stringify(field));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}
function finishPaletteDrag() { draggingField.value = ''; }
function dropField(e: DragEvent) {
  if (!canUpdate.value) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  let field: { value: string; label: string } | undefined = fields.value.find((item) => item.value === draggingField.value);
  const payload = e.dataTransfer?.getData('application/x-hb-oms-print-field');
  if (payload) {
    try { field = JSON.parse(payload) as { value: string; label: string }; }
    catch { /* 保留同页拖拽状态作为回退 */ }
  }
  draggingField.value = '';
  if (!field || !fields.value.some((item) => item.value === field?.value)) return;
  const rect = canvas.getBoundingClientRect();
  addField(field.value, field.label, (e.clientX - rect.left) / pxPerMm.value, (e.clientY - rect.top) / pxPerMm.value);
}
async function zoomAtPointer(e: WheelEvent) {
  const canvas = canvasRef.value;
  const scroller = canvasScrollRef.value;
  if (!canvas || !scroller || e.deltaY === 0) return;
  const nextZoom = Math.max(50, Math.min(150, zoom.value + (e.deltaY < 0 ? 10 : -10)));
  if (nextZoom === zoom.value) return;
  const before = canvas.getBoundingClientRect();
  const pointerXMm = (e.clientX - before.left) / pxPerMm.value;
  const pointerYMm = (e.clientY - before.top) / pxPerMm.value;
  zoom.value = nextZoom;
  await nextTick();
  const after = canvas.getBoundingClientRect();
  scroller.scrollLeft += after.left + pointerXMm * pxPerMm.value - e.clientX;
  scroller.scrollTop += after.top + pointerYMm * pxPerMm.value - e.clientY;
}
function addText() {
  if (!canUpdate.value) return;
  const item: PrintLayoutField = { id: id(), type: 'staticText', text: '固定文字', xMm: 10, yMm: 20, widthMm: 45, heightMm: 7, fontSizePt: 10, fontWeight: 'normal', align: 'left' };
  elements.value.push(item); selectedId.value = item.id;
}
function addTable() {
  if (!canUpdate.value) return;
  const width = Math.min(200, paperBody.value.widthMm - 20);
  const item: PrintLayoutTable = { id: id(), type: 'table', xMm: 10, yMm: 40, widthMm: width, heightMm: 60, rowHeightMm: 8, showHeader: false,
    columns: rowFields.map(([field, label]) => ({ field, label, widthPct: 100 / rowFields.length, align: 'center' as const })) };
  elements.value.push(item); selectedId.value = item.id;
}
function labelOf(field?: string) { return fields.value.find((x) => x.value === field)?.label || field || '字段'; }
function sampleField(field?: string) { return sampleFields[field || ''] || labelOf(field); }
function sampleRowValue(row: Record<string, string | number>, field: string) { return row[field] ?? ''; }
function saveDraft() { if (canUpdate.value) emit('save', cloneConfig(draft)); }
function itemStyle(item: any) {
  return {
    left: `${item.xMm * pxPerMm.value}px`, top: `${item.yMm * pxPerMm.value}px`,
    width: `${item.widthMm * pxPerMm.value}px`, height: `${item.heightMm * pxPerMm.value}px`,
    fontSize: `${Math.max(9, (item.fontSizePt || 10) * zoom.value / 100)}px`,
    fontWeight: item.fontWeight, textAlign: item.align,
    '--print-x': `${item.xMm}mm`, '--print-y': `${item.yMm}mm`,
    '--print-width': `${item.widthMm}mm`, '--print-height': `${item.heightMm}mm`,
    '--print-font-size': `${item.fontSizePt || 10}pt`,
    '--print-row-height': `${item.rowHeightMm || 0}mm`,
  };
}
function snap(v: number) { const s = snapMm.value || .1; return Math.round(v / s) * s; }
function pointerMove(e: PointerEvent, item: any, mode: 'move' | 'resize', origin: any) {
  const dx = (e.clientX - origin.x) / pxPerMm.value; const dy = (e.clientY - origin.y) / pxPerMm.value;
  if (mode === 'move') { item.xMm = snap(origin.a + dx); item.yMm = snap(origin.b + dy); }
  else { item.widthMm = Math.max(1, snap(origin.a + dx)); item.heightMm = Math.max(1, snap(origin.b + dy)); }
}
function startPointer(e: PointerEvent, item: any, mode: 'move' | 'resize') {
  if (!canUpdate.value) return;
  selectedId.value = item.id; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const origin = { x: e.clientX, y: e.clientY, a: mode === 'move' ? item.xMm : item.widthMm, b: mode === 'move' ? item.yMm : item.heightMm };
  const target = e.currentTarget as HTMLElement;
  const move = (ev: PointerEvent) => pointerMove(ev, item, mode, origin);
  const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); };
  target.addEventListener('pointermove', move); target.addEventListener('pointerup', up);
}
function startDrag(e: PointerEvent, item: any) { startPointer(e, item, 'move'); }
function startResize(e: PointerEvent, item: any) { startPointer(e, item, 'resize'); }
function nudge(e: KeyboardEvent, item: any) {
  if (!canUpdate.value) return;
  const step = e.shiftKey ? 1 : .1;
  if (e.key === 'ArrowLeft') item.xMm -= step; else if (e.key === 'ArrowRight') item.xMm += step;
  else if (e.key === 'ArrowUp') item.yMm -= step; else if (e.key === 'ArrowDown') item.yMm += step; else return;
  e.preventDefault();
}
function removeSelected() { if (!canUpdate.value) return; const i = elements.value.findIndex((x) => x.id === selectedId.value); if (i >= 0) elements.value.splice(i, 1); selectedId.value = ''; }
function normalizeColumns() {
  if (!canUpdate.value) return;
  if (!selected.value?.columns?.length) return;
  const count = selected.value.columns.length;
  const width = Number((100 / count).toFixed(2));
  selected.value.columns.forEach((column: any, index: number) => {
    column.widthPct = index === count - 1 ? Number((100 - width * (count - 1)).toFixed(2)) : width;
  });
}
const uploading = ref(false);
async function uploadBackground(file: File) {
  if (!canUpdate.value) return false;
  if (!['image/png', 'image/jpeg'].includes(file.type)) { ElMessage.error('仅支持 PNG/JPG 定位底图'); return false; }
  if (file.size > 10 * 1024 * 1024) { ElMessage.error('定位底图不能超过 10MB'); return false; }
  uploading.value = true;
  try { draft.backgroundImageUrl = await uploadFile(file, 'print_form_background'); }
  finally { uploading.value = false; }
  return false;
}
function testPrint() {
  printWithDriverOrientation(printDriverOrientationOf(draft.paper), 'printing-designer');
}
</script>

<style scoped>
.designer { min-width: 980px; }
.designer-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.designer-main { display: grid; grid-template-columns: 150px minmax(520px, 1fr) 280px; gap: 12px; min-height: 560px; }
.palette, .properties { padding: 12px; border: 1px solid #e4e7ed; border-radius: 6px; background: #fafafa; }
.palette-field { display: flex; align-items: center; gap: 5px; width: 100%; margin-top: 7px; padding: 5px; border: 1px solid #dcdfe6; background: #fff; cursor: grab; text-align: left; transition: border-color .15s, background-color .15s, opacity .15s; }
.palette-field:hover { border-color: #409eff; background: #ecf5ff; }
.palette-field:active { cursor: grabbing; }
.palette-field.dragging { opacity: .45; }
.drag-grip { color: #a8abb2; font-weight: bold; letter-spacing: -3px; }
.palette p { color: #909399; font-size: 12px; line-height: 1.6; }
.canvas-scroll { position: relative; overflow: auto; background: #e7e9ed; }
.canvas-stage { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: max-content; min-width: 100%; height: max-content; min-height: 100%; padding: 20px; }
.canvas-frame { position: relative; flex: 0 0 auto; }
.ruler { position: absolute; color: #606266; font-size: 10px; font-style: normal; pointer-events: none; }
.ruler-x { left: 0; right: 0; top: -20px; height: 20px; border-bottom: 1px solid #a8abb2; }
.ruler-y { top: 0; bottom: 0; left: -20px; width: 20px; border-right: 1px solid #a8abb2; }
.ruler-mark { position: absolute; display: block; box-sizing: border-box; font-style: normal; }
.ruler-x .ruler-mark { bottom: 0; width: 0; height: 4px; border-left: 1px solid #a8abb2; }
.ruler-x .ruler-mark.major { height: 7px; border-left-color: #606266; }
.ruler-y .ruler-mark { right: 0; width: 4px; height: 0; border-top: 1px solid #a8abb2; }
.ruler-y .ruler-mark.major { width: 7px; border-top-color: #606266; }
.ruler-label { position: absolute; line-height: 1; white-space: nowrap; }
.ruler-x .ruler-label { left: 0; bottom: 8px; transform: translateX(-50%); }
.ruler-y .ruler-label { top: 0; right: 8px; transform: translateY(-50%); }
.paper-canvas { position: relative; box-sizing: content-box; background-color: #fff; box-shadow: 0 2px 10px #0003; overflow: hidden; }
.paper-canvas.drop-ready { outline: 2px dashed #409eff; outline-offset: 3px; }
.paper-canvas.grid { background-image: linear-gradient(to right,#dbe3ef 1px,transparent 1px),linear-gradient(to bottom,#dbe3ef 1px,transparent 1px); background-size: calc(var(--mm) * 5) calc(var(--mm) * 5); }
.calibration-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; opacity: .55; pointer-events: none; }
.design-item { position: absolute; box-sizing: border-box; padding: 2px; border: 1px dashed #409eff; background: #ecf5ffb8; overflow: hidden; cursor: move; user-select: none; }
.design-item.readonly { cursor: default; }
.design-item.table { overflow: visible; background: repeating-linear-gradient(#f4f9ff,#f4f9ff 15px,#d9ecff 16px); }
.sample-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: inherit; }
.sample-table th,
.sample-table td {
  padding: 0 2px;
  border: 0;
  overflow: visible;
  white-space: pre-wrap;
  word-break: normal;
  overflow-wrap: anywhere;
}
.design-item.active { outline: 2px solid #f56c6c; }
.resize-handle { position: absolute; right: -1px; bottom: -1px; width: 8px; height: 8px; background: #f56c6c; cursor: nwse-resize; }
.design-item.readonly .resize-handle { display: none; }
.properties :deep(.el-input-number) { width: 90px; }
.column-widths { display: flex; flex-direction: column; gap: 5px; }
.column-widths label { display: grid; grid-template-columns: 72px 90px 12px; align-items: center; gap: 4px; font-size: 12px; }
@media print {
  .designer-toolbar, .palette, .properties, .ruler { display: none !important; }
  .designer {
    width: var(--paper-width); height: var(--paper-height); min-width: 0;
    margin: var(--page-offset-y, 0) 0 0 var(--page-offset-x, 0);
  }
  .designer-main, .canvas-scroll, .canvas-stage, .canvas-frame {
    display: block; width: var(--paper-width); height: var(--paper-height); min-width: 0; min-height: 0;
    margin: 0; padding: 0; background: #fff; overflow: visible;
  }
  .paper-canvas {
    width: var(--paper-width) !important; height: var(--paper-height) !important;
    box-shadow: none; background-image: none !important;
    font-family: SimSun, 'Songti SC', 'Noto Serif CJK SC', 'Noto Sans CJK SC', 'Microsoft YaHei', serif;
  }
  .calibration-bg { display: none !important; }
  .design-item {
    left: calc(var(--print-x) + var(--offset-x)) !important;
    top: calc(var(--print-y) + var(--offset-y)) !important;
    width: var(--print-width) !important; height: var(--print-height) !important;
    padding: 0; border: 0; outline: 0 !important; background: transparent !important;
    font-size: var(--print-font-size) !important;
  }
  .design-item:not(.table) { white-space: pre-wrap; line-height: 1.2; }
  .design-item.table { font-size: calc(12px * var(--font-scale, 1)) !important; }
  .sample-table th, .sample-table td { padding: 0 .8mm; vertical-align: middle; }
  .sample-table td { height: var(--print-row-height) !important; }
  .resize-handle { display: none; }
}
</style>
