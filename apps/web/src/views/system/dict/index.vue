<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent>
        <el-form-item label="字典类型">
          <el-select v-model="curType" clearable placeholder="全部" style="width:200px" @change="load">
            <el-option v-for="t in types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'dict:create'" type="primary" :icon="Plus" @click="openCreate">新增字典项</el-button>
        <el-button v-permission="'dict:export'" type="primary" plain size="small" :icon="Download" :loading="exporting" @click="onExport">导出到Excel</el-button>
        <el-button v-permission="'dict:import'" type="primary" plain size="small" :icon="Upload" @click="openImport">批量导入</el-button>
      </div>
      <app-table :data="paged" v-loading="loading" border stripe :page="page" :page-size="size" @selection-change="onSelectionChange">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column label="字典类型" prop="dictType" width="180">
          <template #default="{ row }">
            <color-tag v-if="row.dictType" :seed="row.dictType">{{ row.dictType }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="标签" width="160">
          <template #default="{ row }">
            {{ row.dictLabel }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="键值" prop="dictValue" width="180" />
        <el-table-column label="排序" prop="sort" width="80" class-name="col-num" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="上级键值" prop="parentValue" width="140" />
        <el-table-column label="备注" prop="remark" min-width="80" class-name="col-left" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'dict:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'dict:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination
        class="pager"
        :total="total"
        v-model:page="page"
        v-model:size="size"
      />
    </el-card>

    <el-dialog v-model="formVisible" :title="editId ? '编辑字典项' : '新增字典项'" width="440px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="字典类型" prop="dictType">
          <el-input v-model="form.dictType" :disabled="!!editId" placeholder="如 work_team" name="dictType" autocomplete="off" :spellcheck="false" />
        </el-form-item>
        <el-form-item label="标签" prop="dictLabel">
          <el-input v-model="form.dictLabel" name="dictLabel" autocomplete="off" />
        </el-form-item>
        <el-form-item label="键值" prop="dictValue">
          <el-input v-model="form.dictValue" name="dictValue" autocomplete="off" :spellcheck="false" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" />
        </el-form-item>
        <el-form-item label="上级键值">
          <el-input
            v-model="form.parentValue"
            clearable
            placeholder="级联用，选填。如产线填所属车间键值（如 stamping）"
            name="parentValue"
            autocomplete="off"
            :spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" name="remark" autocomplete="off" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible=false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入：拖拽上传 -->
    <el-dialog v-model="importVisible" title="批量导入字典" width="520px" :close-on-click-modal="false" :close-on-press-escape="!importing" :show-close="!importing">
      <div v-loading="importing" element-loading-text="正在解析、校验并导入，请稍候…" aria-live="polite">
        <el-upload
          drag
          :show-file-list="false"
          :auto-upload="false"
          :disabled="importing"
          accept=".xlsx"
          :on-change="onFileChange"
        >
          <el-icon class="el-icon--upload" aria-hidden="true"><upload-filled /></el-icon>
          <div class="el-upload__text">将 Excel 文件拖到此处，或<em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">
              仅支持 .xlsx 格式；请先下载模板并按格式填写后再上传。
              <el-button size="small" type="primary" plain :disabled="importing" v-permission="'dict:import'" :icon="Download" @click="onDownloadTemplate">下载导入模板</el-button>
            </div>
          </template>
        </el-upload>
      </div>
      <template #footer>
        <el-button size="small" :disabled="importing" @click="importVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入结果 -->
    <el-dialog v-model="resultVisible" :title="importResult?.aborted ? '导入已终止（未写入任何数据）' : '批量导入结果'" width="640px">
      <el-alert
        v-if="importResult"
        :type="importResult.aborted ? 'error' : (importResult.failed ? 'warning' : 'success')"
        :closable="false"
        show-icon
        :title="importResult.aborted
          ? `预校验未通过，已终止导入。共发现 ${importResult.failed} 处错误，请修正源表后重新上传`
          : `共处理 ${importResult.total} 行：成功导入 ${importResult.success} 行，失败 ${importResult.failed} 行`"
      />
      <el-table
        v-if="importResult && importResult.errors.length"
        :data="importResult.errors"
        border
        size="small"
        max-height="360"
        style="margin-top: 12px"
      >
        <el-table-column label="行号" prop="row" width="80" class-name="col-num" />
        <el-table-column label="原因" prop="message" min-width="220" />
      </el-table>
      <template #footer>
        <el-button size="small" type="primary" @click="resultVisible = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// keep-alive 缓存键取组件 name；本项目多数页面文件同名 index.vue，
// 不显式命名会导致缓存互相顶替、onActivated 打在错误实例上（刷新失效）。
defineOptions({ name: 'SystemDictList' });

import { ref, reactive, onMounted, onActivated } from 'vue';
import { Plus, Delete, Edit, Download, Upload, UploadFilled } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import type { UploadFile } from 'element-plus';
import {
  getDictList,
  getDictTypes,
  createDict,
  updateDict,
  deleteDict,
  downloadDictTemplate,
  importDict,
  exportDictList,
  type DictImportResult,
} from '@/api/system';
import { useClientPager } from '@/composables/useClientPager';
import { refreshDict } from '@/composables/useDict';
import { useExcelExport } from '@/composables/useExcelExport';
import ColorTag from '@/components/ColorTag.vue';

const loading = ref(false);
const list = ref<any[]>([]);
const { page, size, total, paged } = useClientPager(list);
const types = ref<string[]>([]);
const curType = ref<string | undefined>(undefined);
const selectedRows = ref<any[]>([]);
function onSelectionChange(rows: any[]) {
  selectedRows.value = rows;
}

const formVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const saving = ref(false);
const deletingId = ref<number | null>(null);
const form = reactive<any>({ dictType: '', dictLabel: '', dictValue: '', sort: 0, remark: '', parentValue: '' });
const rules: FormRules = {
  dictType: [{ required: true, message: '请输入字典类型', trigger: 'blur' }],
  dictLabel: [{ required: true, message: '请输入标签', trigger: 'blur' }],
  dictValue: [{ required: true, message: '请输入键值', trigger: 'blur' }],
};

async function load() {
  loading.value = true;
  try { list.value = await getDictList(curType.value); }
  finally { loading.value = false; }
}
async function loadTypes() { types.value = await getDictTypes(); }

function openCreate() {
  editId.value = null;
  Object.assign(form, { dictType: curType.value || '', dictLabel: '', dictValue: '', sort: 0, remark: '', parentValue: '' });
  formVisible.value = true;
}
function openEdit(row: any) {
  editId.value = row.id;
  Object.assign(form, { dictType: row.dictType, dictLabel: row.dictLabel, dictValue: row.dictValue, sort: row.sort, remark: row.remark, parentValue: row.parentValue ?? '' });
  formVisible.value = true;
}
async function onSave() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      if (editId.value) await updateDict(editId.value, form);
      else await createDict(form);
      ElMessage.success('保存成功');
      formVisible.value = false;
      load(); loadTypes();
      // 刷新全局字典缓存，使其他引用页面自动更新
      refreshDict(form.dictType);
    } finally { saving.value = false; }
  });
}
async function onDelete(row: any) {
  await ElMessageBox.confirm(`确认删除「${row.dictLabel}」？`, '提示', { type: 'warning' });
  // 记录当前行 id 用于按钮 loading
  deletingId.value = row.id;
  try {
    await deleteDict(row.id);
    ElMessage.success('已删除');
    load();
    // 刷新全局字典缓存，使其他引用页面自动更新
    refreshDict(row.dictType);
  } catch {
    // 错误提示由全局响应拦截器处理（含引用完整性校验失败的具体原因）
  } finally {
    deletingId.value = null;
  }
}

/* 导出 Excel：有勾选则仅导出勾选记录，否则导出全部（与分页无关） */
const { exporting, exportWithConfirm } = useExcelExport();
const onExport = () => exportWithConfirm({
  name: '字典',
  // 字典是客户端分页，list 已是当前类型的全量，不存在「筛选变了但没查询」的口径差
  getCount: async () => (selectedRows.value.length || list.value.length),
  scopeText: (n) => (selectedRows.value.length
    ? `导出<b>选中的 ${n}</b> 条字典项`
    : `导出当前类型的全部 <b>${n}</b> 条字典项`),
  run: async () => {
    const ids = selectedRows.value.length
      ? selectedRows.value.map((r) => r.id)
      : undefined;
    await exportDictList(curType.value, ids);
  },
});

/* 批量导入 */
const importVisible = ref(false);
const importing = ref(false);
const resultVisible = ref(false);
const importResult = ref<DictImportResult | null>(null);

function openImport() {
  importResult.value = null;
  importVisible.value = true;
}

async function onDownloadTemplate() {
  try {
    await downloadDictTemplate();
    ElMessage.success('模板下载成功');
  } catch {
    ElMessage.error('模板下载失败，请重试');
  }
}

async function onFileChange(file: UploadFile) {
  if (!file.raw) return;
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    ElMessage.error('仅支持 .xlsx 格式文件');
    return;
  }
  importing.value = true;
  try {
    const result = await importDict(file.raw);
    importResult.value = result;
    importVisible.value = false;
    resultVisible.value = true;
    if (result.aborted) {
      ElMessage.error(`预校验未通过，已终止导入（${result.failed} 处错误）`);
    } else if (result.success > 0) {
      ElMessage.success(`成功导入 ${result.success} 条字典`);
      load(); loadTypes();
    } else {
      ElMessage.warning('导入失败，请查看错误明细');
    }
  } catch {
    ElMessage.error('导入失败，请重试');
  } finally {
    importing.value = false;
  }
}

// loadTypes（字典分类选项）只需初始化一次
onMounted(loadTypes);
// 每次激活页面时重新拉取字典列表，保证数据始终最新
onActivated(load);
</script>

<style scoped lang="scss">
/* 工具栏 flex 子元素允许收缩，避免长文本撑破布局 */
.toolbar > * {
  min-width: 0;
}

/* 数字列使用等宽数字，便于对齐 */
:deep(.col-num) {
  font-variant-numeric: tabular-nums;
}
</style>
