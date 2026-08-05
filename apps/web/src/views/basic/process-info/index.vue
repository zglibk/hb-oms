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
        <el-table-column type="expand" width="36" fixed="left">
          <template #default="{ row }">
            <div class="expand-wrap">
              <table class="expand-grid">
                <thead>
                  <tr>
                    <th class="eg-part">部件</th>
                    <th>长度要求</th>
                    <th>特殊要求</th>
                    <th>开单注明</th>
                    <th class="eg-mold">模具编号</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in partRows(row)" :key="p.label">
                    <td class="eg-part">{{ p.label }}</td>
                    <td>{{ p.length || '—' }}</td>
                    <td class="eg-pre">{{ p.special || '—' }}</td>
                    <td class="eg-pre">{{ p.billing || '—' }}</td>
                    <td>{{ p.mold || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </el-table-column>
        <el-table-column type="selection" width="42" fixed="left" />
        <el-table-column label="生产图号" prop="drawingNo" width="120" fixed="left" />
        <el-table-column label="版本号" prop="drawingVersion" width="80" />
        <el-table-column label="客户名称" prop="customerName" min-width="93" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="产品名称" prop="productName" min-width="93" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="生产机台" width="110">
          <template #default="{ row }">{{ machinesDisplay(row) }}</template>
        </el-table-column>
        <el-table-column label="长度要求(外/中/内)" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ triple(row.lengthReqOuter, row.lengthReqMiddle, row.lengthReqInner) }}</template>
        </el-table-column>
        <el-table-column label="审核人" prop="reviewer" width="80">
          <template #default="{ row }">{{ row.reviewer || '—' }}</template>
        </el-table-column>
        <el-table-column label="审核日期" width="100">
          <template #default="{ row }">{{ row.reviewDate ? String(row.reviewDate).slice(0, 10) : '—' }}</template>
        </el-table-column>
        <el-table-column label="更新人" prop="updaterName" width="90" />
        <el-table-column label="更新日期" width="110">
          <template #default="{ row }">{{ (row.updatedAt || '').slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" link type="primary" :icon="Clock" @click="openHistory(row)">履历</el-button>
              <el-button size="small" v-permission.disable="'process-info:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'process-info:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

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
import { onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus';
import { Plus, Edit, Delete, Search, Upload, Download, UploadFilled, Clock } from '@element-plus/icons-vue';
import {
  getProcessInfoList,
  deleteProcessInfo,
  batchDeleteProcessInfos,
  importProcessInfos,
  downloadProcessInfoTemplate,
  exportProcessInfos,
  type ProcessInfoItem,
} from '@/api/process-info';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

const router = useRouter();
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
// 从表单子页面返回时（keep-alive 缓存场景）刷新列表
onActivated(load);

/* ===== 新增/编辑：跳转子页面式录入 ===== */
function openCreate() {
  router.push({ name: 'ProcessInfoForm' });
}
function openEdit(row: ProcessInfoItem) {
  router.push({ name: 'ProcessInfoForm', query: { id: row.id } });
}

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

/** 折叠行：部件级信息（外/中/内轨 × 长度要求/特殊要求/开单注明/模具编号） */
function partRows(row: ProcessInfoItem) {
  return [
    { label: '外轨', length: row.lengthReqOuter, special: row.specialReqOuter, billing: row.billingNoteOuter, mold: row.moldNoOuter },
    { label: '中轨', length: row.lengthReqMiddle, special: row.specialReqMiddle, billing: row.billingNoteMiddle, mold: row.moldNoMiddle },
    { label: '内轨', length: row.lengthReqInner, special: row.specialReqInner, billing: row.billingNoteInner, mold: row.moldNoInner },
  ];
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

/* ===== 修改履历：跳转子页面时间线展示 ===== */
function openHistory(row: ProcessInfoItem) {
  router.push({ name: 'ProcessInfoHistory', query: { id: row.id } });
}

/* ===== 导出 ===== */
const exporting = ref(false);
async function onExport() {
  if (!total.value) {
    ElMessage.warning('当前筛选无记录，无需导出');
    return;
  }
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
/* 折叠行：部件级信息网格（对照手工工艺表） */
.expand-wrap { padding: 8px 16px 8px 56px; }
.expand-grid {
  width: 100%; max-width: 1100px; border-collapse: collapse; font-size: 13px;
  th, td { border: 1px solid var(--el-border-color); padding: 5px 10px; text-align: left; }
  th { background: var(--el-fill-color-light); font-weight: 600; text-align: center; white-space: nowrap; }
  .eg-part { width: 56px; text-align: center; color: var(--el-text-color-regular); background: var(--el-fill-color-lighter); }
  .eg-mold { width: 130px; }
  .eg-pre { white-space: pre-wrap; word-break: break-all; }
}
</style>
