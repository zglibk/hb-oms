<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="load">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="生产图号/客户/产品名称"
            style="width: 240px"
            @clear="load"
            @keyup.enter="load"
          />
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="load">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'process-info:create'" type="primary" :icon="Plus" @click="openCreate">新增工艺</el-button>
        <el-button size="small" v-permission="'process-info:import'" type="primary" plain :icon="Upload" @click="openImport">批量导入</el-button>
        <el-button size="small" v-permission="'process-info:export'" plain :icon="Download" :loading="exporting" @click="onExport">导出</el-button>
        <el-button
          size="small"
          v-permission="'process-info:delete'"
          type="danger"
          plain
          :icon="Delete"
          :disabled="!selection.length"
          :loading="batchDeleting"
          @click="onBatchDelete"
        >批量删除{{ selection.length ? `（${selection.length}）` : '' }}</el-button>
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" @selection-change="onSelectionChange">
        <el-table-column type="selection" width="42" fixed="left" />
        <el-table-column label="生产图号" prop="drawingNo" width="150" fixed="left" />
        <el-table-column label="版本号" prop="drawingVersion" width="80" />
        <el-table-column label="客户名称" prop="customerName" min-width="140" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="产品名称" prop="productName" min-width="140" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="生产机台" width="110">
          <template #default="{ row }">{{ machinesDisplay(row) }}</template>
        </el-table-column>
        <el-table-column label="长度要求(外/中/内)" min-width="170" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ triple(row.lengthReqOuter, row.lengthReqMiddle, row.lengthReqInner) }}</template>
        </el-table-column>
        <el-table-column label="模具编号(外/中/内)" min-width="150" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ triple(row.moldNoOuter, row.moldNoMiddle, row.moldNoInner) }}</template>
        </el-table-column>
        <el-table-column label="工艺附图" width="90">
          <template #default="{ row }">
            <el-image
              v-if="imageList(row).length"
              :src="imageList(row)[0]"
              :preview-src-list="imageList(row)"
              :preview-teleported="true"
              fit="cover"
              style="width: 36px; height: 36px; border-radius: 4px"
            />
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="更新人" prop="updaterName" width="90" />
        <el-table-column label="更新日期" width="110">
          <template #default="{ row }">{{ (row.updatedAt || '').slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'process-info:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'process-info:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <!-- 新增/编辑 -->
    <el-dialog v-model="formVisible" :title="editId ? '编辑工艺' : '新增工艺'" width="760px" top="4vh">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="生产图号" prop="drawingNo">
              <el-input v-model="form.drawingNo" placeholder="唯一；订单录入按此图号自动带入" :spellcheck="false" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="版本号">
              <el-input v-model="form.drawingVersion" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户名称">
              <el-select
                v-model="form.customerName"
                filterable
                clearable
                allow-create
                default-first-option
                placeholder="选择或输入客户"
                style="width: 100%"
                @change="onCustomerChange"
              >
                <el-option v-for="c in customers" :key="c.id" :label="c.customerName" :value="c.customerName" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品名称">
              <el-input v-model="form.productName" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="机台(薄料)">
              <el-select
                v-model="machineTags"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="输入机台号回车；无厚薄之分时填此栏（如 362、363、364）"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="机台(厚料)">
              <el-select
                v-model="machineThickTags"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="厚料生产机台（如 82、80、81），无则留空"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">分部件要求（对照手工工艺表格式）</el-divider>
        <table class="part-grid">
          <thead>
            <tr>
              <th class="pg-part">部件</th>
              <th>长度要求</th>
              <th>特殊要求</th>
              <th class="pg-mold">模具编号</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="pg-part">外轨</td>
              <td><el-input v-model="form.lengthReqOuter" placeholder="如 正常长度（不变）" /></td>
              <td><el-input v-model="form.specialReqOuter" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" /></td>
              <td><el-input v-model="form.moldNoOuter" /></td>
            </tr>
            <tr>
              <td class="pg-part">中轨</td>
              <td><el-input v-model="form.lengthReqMiddle" placeholder="如 外轨正常长度-17MM；二节轨产品此行留空" /></td>
              <td><el-input v-model="form.specialReqMiddle" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" /></td>
              <td><el-input v-model="form.moldNoMiddle" /></td>
            </tr>
            <tr>
              <td class="pg-part">内轨</td>
              <td><el-input v-model="form.lengthReqInner" placeholder="如 外轨正常长度-2MM" /></td>
              <td><el-input v-model="form.specialReqInner" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" /></td>
              <td><el-input v-model="form.moldNoInner" /></td>
            </tr>
          </tbody>
        </table>

        <el-divider content-position="left">工艺更新</el-divider>
        <el-form-item label="更新说明">
          <el-input v-model="form.processUpdateNote" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="附图（多图）">
          <div class="img-list">
            <div v-for="(url, i) in images" :key="url" class="img-item">
              <el-image :src="url" :preview-src-list="images" :preview-teleported="true" fit="cover" />
              <el-icon class="img-remove" @click="images.splice(i, 1)"><CircleCloseFilled /></el-icon>
            </div>
            <el-upload
              :show-file-list="false"
              :auto-upload="false"
              accept="image/jpeg,image/png,image/webp"
              :on-change="onImagePick"
            >
              <div class="img-add" v-loading="uploading">
                <el-icon><Plus /></el-icon>
              </div>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入 -->
    <el-dialog v-model="importVisible" title="批量导入工艺信息" width="480px" @closed="resetImport">
      <div class="import-tip">
        <p>1. 模板为<b>手工工艺表格式</b>：一个图号一组、外/中/内轨各一行；图号/版本/客户等组级列可合并单元格，或仅在首行填写（下方留空自动归组）；</p>
        <p>2. <b>图号、部件</b>为必填列；生产机台多个用 / 或逗号分隔（如 16/15/5）；工艺附图请在编辑页单独上传；</p>
        <p>3. 整批校验：任一行出错则本次全部不导入，并逐行提示错误；</p>
        <p>4. 开启「覆盖更新」后，已存在的图号将按导入内容更新非空列；导出的表格可修改后直接回导。</p>
        <el-button size="small" link type="primary" :icon="Download" @click="onDownloadTemplate">下载导入模板</el-button>
      </div>
      <el-upload
        drag
        :auto-upload="false"
        :limit="1"
        accept=".xlsx"
        :on-change="onImportFileChange"
        :on-remove="() => (importFile = null)"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽 .xlsx 文件到此处，或<em>点击选择</em></div>
      </el-upload>
      <div class="import-overwrite">
        <el-switch v-model="importOverwrite" />
        <span>覆盖更新（按生产图号 upsert 非空列）</span>
      </div>
      <el-alert v-if="importErrors.length" type="error" :closable="false" class="import-errors">
        <p v-for="(e, i) in importErrors" :key="i">{{ e }}</p>
      </el-alert>
      <template #footer>
        <el-button size="small" @click="importVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="importing" :disabled="!importFile" @click="onImport">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type UploadFile } from 'element-plus';
import { Plus, Edit, Delete, Search, CircleCloseFilled, Upload, Download, UploadFilled } from '@element-plus/icons-vue';
import {
  getProcessInfoList,
  createProcessInfo,
  updateProcessInfo,
  deleteProcessInfo,
  batchDeleteProcessInfos,
  importProcessInfos,
  downloadProcessInfoTemplate,
  exportProcessInfos,
  type ProcessInfoItem,
} from '@/api/process-info';
import { getAllCustomers, type CustomerItem } from '@/api/customer';
import { uploadFile } from '@/api/file';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

const loading = ref(false);
const list = ref<ProcessInfoItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 20, keyword: '' });

async function load() {
  loading.value = true;
  try {
    const res = await getProcessInfoList(query);
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}
load();

/** 客户下拉（选择后带 customerId；也允许手输） */
const customers = ref<CustomerItem[]>([]);
getAllCustomers().then((res) => (customers.value = res));

/* ===== 展示辅助 ===== */
function machinesDisplay(row: ProcessInfoItem): string {
  const thin = (row.machines || '').split(',').filter(Boolean).join('/');
  const thick = (row.machinesThick || '').split(',').filter(Boolean).join('/');
  if (thick) return thin ? `薄:${thin} 厚:${thick}` : `厚:${thick}`;
  return thin || '—';
}
function triple(a: string | null, b: string | null, c: string | null): string {
  if (!a && !b && !c) return '—';
  return `${a || '—'} / ${b || '—'} / ${c || '—'}`;
}
function imageList(row: ProcessInfoItem): string[] {
  try {
    const arr = JSON.parse(row.processUpdateImages || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/* ===== 新增/编辑 ===== */
const formVisible = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const machineTags = ref<string[]>([]);
const machineThickTags = ref<string[]>([]);
const images = ref<string[]>([]);
const uploading = ref(false);

const emptyForm = () => ({
  drawingNo: '',
  drawingVersion: '',
  customerId: undefined as number | undefined,
  customerName: '',
  productName: '',
  lengthReqOuter: '', lengthReqMiddle: '', lengthReqInner: '',
  specialReqOuter: '', specialReqMiddle: '', specialReqInner: '',
  moldNoOuter: '', moldNoMiddle: '', moldNoInner: '',
  processUpdateNote: '',
  remark: '',
});
const form = reactive(emptyForm());
const rules = {
  drawingNo: [{ required: true, message: '请输入生产图号', trigger: 'blur' }],
};

function onCustomerChange(name: string) {
  form.customerId = customers.value.find((c) => c.customerName === name)?.id;
}

function openCreate() {
  editId.value = null;
  Object.assign(form, emptyForm());
  machineTags.value = [];
  machineThickTags.value = [];
  images.value = [];
  formVisible.value = true;
}
function openEdit(row: ProcessInfoItem) {
  editId.value = row.id;
  Object.assign(form, emptyForm(), {
    drawingNo: row.drawingNo,
    drawingVersion: row.drawingVersion ?? '',
    customerId: row.customerId ?? undefined,
    customerName: row.customerName ?? '',
    productName: row.productName ?? '',
    lengthReqOuter: row.lengthReqOuter ?? '', lengthReqMiddle: row.lengthReqMiddle ?? '', lengthReqInner: row.lengthReqInner ?? '',
    specialReqOuter: row.specialReqOuter ?? '', specialReqMiddle: row.specialReqMiddle ?? '', specialReqInner: row.specialReqInner ?? '',
    moldNoOuter: row.moldNoOuter ?? '', moldNoMiddle: row.moldNoMiddle ?? '', moldNoInner: row.moldNoInner ?? '',
    processUpdateNote: row.processUpdateNote ?? '',
    remark: row.remark ?? '',
  });
  machineTags.value = (row.machines || '').split(',').filter(Boolean);
  machineThickTags.value = (row.machinesThick || '').split(',').filter(Boolean);
  images.value = imageList(row);
  formVisible.value = true;
}

async function onImagePick(file: UploadFile) {
  const raw = file.raw as File | undefined;
  if (!raw) return;
  if (raw.size > 10 * 1024 * 1024) {
    ElMessage.warning('图片不能超过 10MB');
    return;
  }
  uploading.value = true;
  try {
    const url = await uploadFile(raw, 'process_update_image');
    images.value.push(url);
  } finally {
    uploading.value = false;
  }
}

async function onSave() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = {
      ...form,
      machines: machineTags.value.map((s) => s.trim()).filter(Boolean).join(','),
      machinesThick: machineThickTags.value.map((s) => s.trim()).filter(Boolean).join(','),
      processUpdateImages: JSON.stringify(images.value),
    };
    if (editId.value) await updateProcessInfo(editId.value, payload);
    else await createProcessInfo(payload);
    ElMessage.success('保存成功');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

/* ===== 删除 ===== */
const deletingId = ref<number | null>(null);
async function onDelete(row: ProcessInfoItem) {
  await ElMessageBox.confirm(`确定删除生产图号「${row.drawingNo}」的工艺记录吗？历史订单保留快照不受影响。`, '提示', { type: 'warning' });
  deletingId.value = row.id;
  try {
    await deleteProcessInfo(row.id);
    ElMessage.success('已删除');
    load();
  } finally {
    deletingId.value = null;
  }
}

/* ===== 批量删除 ===== */
const selection = ref<ProcessInfoItem[]>([]);
const batchDeleting = ref(false);
function onSelectionChange(rows: ProcessInfoItem[]) {
  selection.value = rows;
}
async function onBatchDelete() {
  if (!selection.value.length) return;
  await ElMessageBox.confirm(
    `确定删除选中的 ${selection.value.length} 条工艺记录吗？任一图号被订单引用则整批不删除；历史订单保留快照不受影响。`,
    '批量删除',
    { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  );
  batchDeleting.value = true;
  try {
    const res = await batchDeleteProcessInfos(selection.value.map((r) => r.id));
    ElMessage.success(`已删除 ${res.deleted} 条工艺${res.skipped ? `（${res.skipped} 条已不存在，自动跳过）` : ''}`);
    selection.value = [];
    load();
  } catch (e: any) {
    // 整批被拒：后端 400 返回 { message, errors: [...] }（request.ts 已弹 message，这里补逐条原因）
    const errs = e?.response?.data?.errors ?? e?.errors;
    if (Array.isArray(errs) && errs.length) {
      ElMessageBox.alert(
        errs.slice(0, 10).join('<br>') + (errs.length > 10 ? `<br>…共 ${errs.length} 条` : ''),
        '未删除原因',
        { dangerouslyUseHTMLString: true, type: 'warning' },
      );
    }
  } finally {
    batchDeleting.value = false;
  }
}

/* ===== 导出 ===== */
const exporting = ref(false);
async function onExport() {
  exporting.value = true;
  try {
    const blob = await exportProcessInfos({ keyword: query.keyword || undefined });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `工艺信息_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

/* ===== 批量导入 ===== */
const importVisible = ref(false);
const importing = ref(false);
const importOverwrite = ref(false);
const importFile = ref<File | null>(null);
const importErrors = ref<string[]>([]);

function openImport() {
  importVisible.value = true;
}
function resetImport() {
  importFile.value = null;
  importErrors.value = [];
  importOverwrite.value = false;
}
function onImportFileChange(file: UploadFile) {
  importFile.value = (file.raw as File) ?? null;
  importErrors.value = [];
}
async function onDownloadTemplate() {
  const blob = await downloadProcessInfoTemplate();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '工艺信息导入模板.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
async function onImport() {
  if (!importFile.value) return;
  importing.value = true;
  importErrors.value = [];
  try {
    const res = await importProcessInfos(importFile.value, importOverwrite.value);
    ElMessage.success(`导入成功：新增 ${res.created} 条，更新 ${res.updated} 条`);
    importVisible.value = false;
    load();
  } catch (e: any) {
    // 后端 400 返回 { message, errors: [...] }（request.ts 已弹出 message，这里补充逐行明细）
    const errs = e?.response?.data?.errors ?? e?.errors;
    if (Array.isArray(errs)) importErrors.value = errs;
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped lang="scss">
.toolbar { margin-bottom: 12px; }
.pager { margin-top: 12px; }
.text-muted { color: var(--el-text-color-placeholder); }
.img-list {
  display: flex; flex-wrap: wrap; gap: 10px;
  .img-item {
    position: relative; width: 72px; height: 72px;
    .el-image { width: 100%; height: 100%; border-radius: 6px; }
    .img-remove {
      position: absolute; top: -6px; right: -6px; cursor: pointer;
      color: var(--el-color-danger); background: #fff; border-radius: 50%;
    }
  }
  .img-add {
    width: 72px; height: 72px; border: 1px dashed var(--el-border-color);
    border-radius: 6px; display: flex; align-items: center; justify-content: center;
    color: var(--el-text-color-secondary); cursor: pointer;
    &:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
  }
}
.part-grid {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 6px;
  th, td { border: 1px solid var(--el-border-color); padding: 6px 8px; }
  th { background: var(--el-fill-color-light); font-weight: 600; font-size: 13px; text-align: center; }
  .pg-part { width: 64px; text-align: center; font-size: 13px; color: var(--el-text-color-regular); background: var(--el-fill-color-lighter); }
  .pg-mold { width: 140px; }
  :deep(.el-input__wrapper), :deep(.el-textarea__inner) { box-shadow: none; background: transparent; }
}
.import-tip {
  margin-bottom: 12px;
  p { margin: 2px 0; color: var(--el-text-color-secondary); font-size: 13px; }
}
.import-overwrite {
  display: flex; align-items: center; gap: 8px; margin-top: 10px;
  font-size: 13px; color: var(--el-text-color-secondary);
}
.import-errors {
  margin-top: 10px; max-height: 180px; overflow-y: auto;
  p { margin: 2px 0; }
}
</style>
