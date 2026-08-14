<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :model="query" class="filter-bar" label-position="left" label-width="auto" size="small" @submit.prevent>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="货号">
              <el-select v-model="query.itemNo" clearable placeholder="全部" @change="runKeywordSearch">
                <el-option v-for="itemNo in itemNumbers" :key="itemNo" :label="itemNo" :value="itemNo" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="状态">
              <el-select v-model="query.status" clearable placeholder="全部" @change="runKeywordSearch">
                <el-option label="启用" :value="1" />
                <el-option label="停用" :value="0" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item label="关键字">
              <el-input v-model="query.keyword" placeholder="部件代码/产品名称/货号" clearable name="keyword" autocomplete="off" @input="scheduleKeywordSearch" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="4">
            <el-form-item>
              <el-button size="small" type="primary" @click="runKeywordSearch">查询</el-button>
              <el-button size="small" @click="resetQuery">重置</el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" link v-permission="'material:create'" type="primary" :icon="Plus" @click="openCreate">新增部件</el-button>
        <el-button type="primary" plain size="small" v-permission="'material:export'" :icon="Download" :loading="exporting" @click="onExport">导出到Excel</el-button>
        <el-button type="primary" plain size="small" v-permission="'material:import'" :icon="Upload" @click="openImport">批量导入</el-button>
      </div>
      <el-table v-loading="loading" :data="list" border stripe @selection-change="onSelectionChange">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column type="index" label="序号" width="60" align="center" :index="indexMethod" class-name="col-num" />
        <el-table-column label="部件代码" width="150">
          <template #default="{ row }">
            {{ row.materialCode }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="货号" prop="itemNo" width="130" />
        <el-table-column label="产品名称" prop="productName" min-width="90" />
        <el-table-column label="规格" prop="spec" width="90" />
        <el-table-column label="产品类型" width="100">
          <template #default="{ row }">
            <color-tag v-if="row.productType" :seed="row.productType">
              {{ labelFromDict(productTypes, row.productType) }}
            </color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="默认产品类别" width="100">
          <template #default="{ row }">
            <color-tag v-if="row.railSection" :seed="row.railSection">
              {{ labelFromDict(railSections, row.railSection) }}
            </color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="部件" width="100">
          <template #default="{ row }">
            <color-tag v-if="row.partType" :seed="row.partType">
              {{ labelFromDict(partTypes, row.partType) }}
            </color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="图号" prop="drawingNo" width="180" />
        <el-table-column label="材质" width="90">
          <template #default="{ row }">{{ row.sheetMaterial || '—' }}</template>
        </el-table-column>
        <el-table-column label="料厚" width="100">
          <template #default="{ row }">{{ row.materialThickness || '—' }}</template>
        </el-table-column>
        <el-table-column label="单重(kg)" width="90">
          <template #default="{ row }">{{ row.unitWeight || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small"
                link
                type="primary"
                class="btn-view"
                :icon="View"
                v-permission="'basic:material'"
                @click="openDetail(row)"
              >详情</el-button>
              <el-button size="small" v-permission.disable="'material:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'material:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </el-table>
      <app-pagination class="pager" :total="total" v-model:page="page" v-model:size="pageSize" @change="load" />
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="formVisible" :title="editId ? '编辑部件' : '新增部件'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="部件代码" prop="materialCode">
          <el-input v-model="form.materialCode" :disabled="!!editId" placeholder="如 WG03000019" name="materialCode" autocomplete="off" :spellcheck="false" />
        </el-form-item>
        <el-form-item label="货号" prop="itemNo">
          <el-input v-model="form.itemNo" placeholder="如 35#" name="itemNo" autocomplete="off" />
        </el-form-item>
        <el-form-item label="产品名称">
          <el-input v-model="form.productName" name="productName" autocomplete="off" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="规格">
              <el-input v-model="form.spec" placeholder="如 8寸/200mm" name="spec" autocomplete="off" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="材质">
              <el-input v-model="form.sheetMaterial" placeholder="如 Q235" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="料厚">
              <el-input v-model="form.materialThickness" placeholder="如 1.2 / 1.2×1.0×1.2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单重(kg)">
              <el-input v-model="form.unitWeight" placeholder="如 0.35" inputmode="decimal" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="产品类型">
              <el-select v-model="form.productType" clearable style="width:100%">
                <el-option v-for="d in productTypes" :key="d.value" :label="d.label" :value="d.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="默认产品类别">
              <el-select v-model="form.railSection" clearable placeholder="二节轨/三节轨，订单可改" style="width:100%">
                <el-option v-for="d in railSections" :key="d.value" :label="d.label" :value="d.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="部件">
              <el-select v-model="form.partType" clearable style="width:100%">
                <el-option v-for="d in partTypes" :key="d.value" :label="d.label" :value="d.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="图号">
          <el-input v-model="form.drawingNo" name="drawingNo" autocomplete="off" :spellcheck="false" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" name="remark" autocomplete="off" />
        </el-form-item>
        <el-form-item v-if="editId" label="状态">
          <el-switch
            :model-value="form.status === 1"
            @update:model-value="(v: any) => (form.status = v ? 1 : 0)"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="部件详情" width="560px">
      <el-descriptions v-if="detailRow" :column="2" border size="small">
        <el-descriptions-item label="部件代码">{{ detailRow.materialCode || '—' }}</el-descriptions-item>
        <el-descriptions-item label="货号">{{ detailRow.itemNo || '—' }}</el-descriptions-item>
        <el-descriptions-item label="产品名称" :span="2">{{ detailRow.productName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="规格">{{ detailRow.spec || '—' }}</el-descriptions-item>
        <el-descriptions-item label="材质">{{ detailRow.sheetMaterial || '—' }}</el-descriptions-item>
        <el-descriptions-item label="料厚">{{ detailRow.materialThickness || '—' }}</el-descriptions-item>
        <el-descriptions-item label="单重(kg)">{{ detailRow.unitWeight || '—' }}</el-descriptions-item>
        <el-descriptions-item label="产品类型">{{ labelFromDict(productTypes, detailRow.productType) || '—' }}</el-descriptions-item>
        <el-descriptions-item label="默认产品类别">{{ labelFromDict(railSections, detailRow.railSection) || '—' }}</el-descriptions-item>
        <el-descriptions-item label="部件">{{ labelFromDict(partTypes, detailRow.partType) || '—' }}</el-descriptions-item>
        <el-descriptions-item label="图号" :span="2">{{ detailRow.drawingNo || '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="detailRow.status === 1 ? 'success' : 'info'" size="small">
            {{ detailRow.status === 1 ? '启用' : '停用' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detailRow.createdAt ? formatDateTime(detailRow.createdAt) : '—' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detailRow.remark || '—' }}</el-descriptions-item>
      </el-descriptions>
      <audit-info v-if="detailRow" :row="detailRow" :column="2" />
      <template #footer>
        <el-button size="small" @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入：拖拽上传 -->
    <el-dialog v-model="importVisible" title="批量导入部件" width="520px" :close-on-click-modal="false" :close-on-press-escape="!importing" :show-close="!importing">
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
              <el-button size="small" type="primary" plain :disabled="importing" v-permission="'material:import'" :icon="Download" @click="onDownloadTemplate">下载导入模板</el-button>
            </div>
          </template>
        </el-upload>
      </div>
      <template #footer>
        <el-button size="small" :disabled="importing" @click="importVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入结果 -->
    <el-dialog v-model="resultVisible" title="批量导入结果" width="640px">
      <el-alert
        v-if="importResult"
        :type="importResult.failed ? 'warning' : 'success'"
        :closable="false"
        show-icon
        :title="`共处理 ${importResult.total} 行：成功导入 ${importResult.success} 行，失败/跳过 ${importResult.failed} 行`"
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
        <el-table-column label="部件代码" prop="materialCode" width="170" />
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
defineOptions({ name: 'SystemMaterialList' });

import { ref, reactive, onActivated, onMounted } from 'vue';
import { Plus, Edit, Delete, View, Download, Upload, UploadFilled } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { formatDateTime } from '@/utils/date';
import {
  getMaterialList,
  getMaterialItemNumbers,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  downloadMaterialTemplate,
  importMaterial,
  exportMaterialList,
  type MaterialImportResult,
} from '@/api/system';
import { loadDict } from '@/composables/useDict';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import ColorTag from '@/components/ColorTag.vue';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const query = reactive<any>({ keyword: '', itemNo: undefined, status: undefined });

/** 序号跨页连续计算 */
const indexMethod = (i: number) => (page.value - 1) * pageSize.value + i + 1;
const itemNumbers = ref<string[]>([]);
const selectedRows = ref<any[]>([]);
function onSelectionChange(rows: any[]) {
  selectedRows.value = rows;
}

/* 动态字典 */
const productTypes = ref<{ label: string; value: string }[]>([]);
const railSections = ref<{ label: string; value: string }[]>([]);
const partTypes    = ref<{ label: string; value: string }[]>([]);
const orderUnits   = ref<{ label: string; value: string }[]>([]);

function labelFromDict(dict: { label: string; value: any }[], val: any): string {
  if (!val) return '';
  return dict.find((d) => d.value === val)?.label ?? String(val);
}

/* 表单 */
const formVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const saving = ref(false);
const deletingId = ref<number | null>(null);
const form = reactive<any>({
  materialCode: '', itemNo: '', productName: '', spec: '',
  productType: '', railSection: '', partType: '', drawingNo: '', unit: '', sheetMaterial: '', materialThickness: '', unitWeight: '', remark: '', status: 1,
});
const rules: FormRules = {
  materialCode: [{ required: true, message: '部件代码必填', trigger: 'blur' }],
  itemNo:       [{ required: true, message: '货号必填', trigger: 'blur' }],
};

async function load() {
  loading.value = true;
  try {
    const res = await getMaterialList({
      ...query,
      page: page.value,
      pageSize: pageSize.value,
    });
    list.value  = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}
function reload() {
  page.value = 1;
  load();
}
const { schedule: scheduleKeywordSearch, flush: runKeywordSearch } = useDebouncedSearch(reload);
/** 重置筛选条件并重新查询 */
function resetQuery() {
  query.keyword = '';
  query.itemNo = undefined;
  query.status = undefined;
  runKeywordSearch();
}

async function loadCategories() {
  itemNumbers.value = await getMaterialItemNumbers();
}

function openCreate() {
  editId.value = null;
  Object.assign(form, {
    materialCode: '', itemNo: '', productName: '', spec: '',
    productType: '', railSection: '', partType: '', drawingNo: '', unit: '', sheetMaterial: '', materialThickness: '', unitWeight: '', remark: '', status: 1,
  });
  formVisible.value = true;
}

function openEdit(row: any) {
  editId.value = row.id;
  Object.assign(form, { ...row });
  formVisible.value = true;
}

/* 详情弹窗：只读展示，无需权限控制 */
const detailVisible = ref(false);
const detailRow = ref<any | null>(null);
function openDetail(row: any) {
  detailRow.value = row;
  detailVisible.value = true;
}

/* 导出 Excel：有勾选则仅导出勾选记录，否则导出全部（与分页无关） */
const exporting = ref(false);
async function onExport() {
  const selectedCount = selectedRows.value.length;
  if (selectedCount > 0) {
    try {
      await ElMessageBox.confirm(
        `确认导出选中的 <strong style="color:var(--el-color-danger);">${selectedCount}</strong> 条记录到 Excel？`,
        '导出确认',
        {
          type: 'info',
          confirmButtonText: '确认导出',
          cancelButtonText: '取消',
          dangerouslyUseHTMLString: true,
        },
      );
    } catch {
      return; // 用户取消
    }
  } else {
    if (total.value === 0) {
      ElMessage.warning('暂无数据可导出');
      return;
    }
    try {
      await ElMessageBox.confirm(
        `确认按当前筛选条件导出全部部件清单到 Excel？<br/>共 <strong style="color:var(--el-color-danger);">${total.value}</strong> 条记录。`,
        '导出确认',
        {
          type: 'info',
          confirmButtonText: '确认导出',
          cancelButtonText: '取消',
          dangerouslyUseHTMLString: true,
        },
      );
    } catch {
      return; // 用户取消
    }
  }
  exporting.value = true;
  try {
    await exportMaterialList({
      keyword: query.keyword,
      itemNo: query.itemNo,
      status: query.status,
      ids: selectedCount > 0 ? selectedRows.value.map((r) => r.id) : undefined,
    });
    ElMessage.success('导出成功');
  } catch {
    ElMessage.error('导出失败，请重试');
  } finally {
    exporting.value = false;
  }
}

/* 批量导入 */
const importing = ref(false);
const importVisible = ref(false);
const resultVisible = ref(false);
const importResult = ref<MaterialImportResult | null>(null);

function openImport() {
  importVisible.value = true;
}

async function onDownloadTemplate() {
  try {
    await downloadMaterialTemplate();
  } catch {
    ElMessage.error('模板下载失败，请重试');
  }
}

async function onFileChange(uploadFile: any) {
  const raw: File | undefined = uploadFile?.raw;
  if (!raw) return;
  if (!raw.name.toLowerCase().endsWith('.xlsx')) {
    ElMessage.error('仅支持 .xlsx 格式文件');
    return;
  }
  importing.value = true;
  try {
    const res = await importMaterial(raw);
    importResult.value = res;
    importVisible.value = false;
    resultVisible.value = true;
    if (res.success > 0) {
      ElMessage.success(`成功导入 ${res.success} 条部件`);
      await Promise.all([load(), loadCategories()]);
    }
  } catch {
    /* 错误信息已由请求拦截器统一提示 */
  } finally {
    importing.value = false;
  }
}

async function onSave() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      if (editId.value) await updateMaterial(editId.value, form);
      else               await createMaterial(form);
      ElMessage.success('保存成功');
      formVisible.value = false;
      load();
      loadCategories();
    } finally {
      saving.value = false;
    }
  });
}

async function onDelete(row: any) {
  await ElMessageBox.confirm(
    `确认删除部件「${row.materialCode}」？`, '提示', { type: 'warning' },
  );
  // 记录当前行 id 用于按钮 loading
  deletingId.value = row.id;
  try {
    await deleteMaterial(row.id);
    ElMessage.success('已删除');
    load();
  } catch {
    // 错误提示由全局响应拦截器处理（含引用完整性校验失败的具体原因）
  } finally {
    deletingId.value = null;
  }
}

onMounted(async () => {
  const [ptRows, rsRows, paRows, unitRows] = await Promise.all([
    loadDict('product_type'),
    loadDict('rail_section'),
    loadDict('part_type'),
    loadDict('order_unit'),
  ]);
  productTypes.value = ptRows.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
  railSections.value = rsRows.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
  partTypes.value    = paRows.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
  orderUnits.value   = unitRows.map((r: any) => ({ label: r.dictLabel, value: r.dictValue }));
  await Promise.all([load(), loadCategories()]);
});

// keep-alive 缓存页：切回时刷新部件列表（他处可能已新增/导入部件）
let materialActivated = false;
onActivated(() => {
  if (!materialActivated) { materialActivated = true; return; }
  void Promise.all([load(), loadCategories()]);
});
</script>

<style scoped lang="scss">
.pager { margin-top: 12px; }

/* PC 端筛选区为单行网格布局：清除全部表单项底部间距，
 * 避免前两个 col 残留的 margin-bottom 把 el-row 撑高，
 * 造成卡片底部留白大于顶部（平板/手机端换行时仍由全局媒体查询保留行间距） */
@media (min-width: 992px) {
  .filter-card :deep(.el-form-item) {
    margin-bottom: 0;
  }
}

/* 工具栏按钮同排对齐 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  /* flex 子元素允许收缩，避免长文本撑破布局 */
  > * { min-width: 0; }
}

/* 数字列使用等宽数字，便于对齐 */
:deep(.col-num) {
  font-variant-numeric: tabular-nums;
}

/* 导入对话框内的拖拽上传区占满宽度 */
:deep(.el-upload-dragger) { width: 100%; }

/* 对话框底部水平滚动条修复：
 * el-row 的负 margin（gutter 补偿）超出 dialog body 边界，
 * 触发全局 overflow-y: auto 时的水平滚动，此处隐藏水平溢出 */
:deep(.el-dialog__body) {
  overflow-x: hidden;
}
</style>
