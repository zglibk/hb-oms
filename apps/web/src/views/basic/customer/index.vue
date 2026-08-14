<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="客户代码/名称/联系人"
            style="width: 220px"
            @input="scheduleKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 120px" @change="runKeywordSearch">
            <el-option v-for="s in ENABLE_STATUS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'customer:create'" type="primary" :icon="Plus" @click="openCreate">新增客户</el-button>
        <el-button size="small" v-permission="'customer:import'" type="primary" plain :icon="Upload" @click="openImport">批量导入</el-button>
        <el-button
          size="small"
          v-permission="'customer:delete'"
          type="danger"
          plain
          :icon="Delete"
          :disabled="!selection.length"
          :loading="batchDeleting"
          @click="onBatchDelete"
        >批量删除{{ selection.length ? `（${selection.length}）` : '' }}</el-button>
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" @selection-change="onSelectionChange">
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column label="客户代码" width="87">
          <template #default="{ row }">
            {{ row.customerCode }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="客户名称" prop="customerName" min-width="90" class-name="col-left" />
        <el-table-column label="联系人" prop="contactPerson" width="100" />
        <el-table-column label="联系电话" prop="contactPhone" width="130" />
        <el-table-column label="默认业务员" prop="salesman" width="110" />
        <el-table-column label="默认跟单员" prop="merchandiser" width="110" />
        <el-table-column label="默认交货地址" prop="deliveryAddress" min-width="160" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="送货单模板" width="110">
          <template #default="{ row }">{{ deliveryTemplateName(row.deliveryTemplate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="tagTypeOf(ENABLE_STATUS, row.status)" size="small">
              {{ labelOf(ENABLE_STATUS, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="120" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'customer:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'customer:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <!-- 新增/编辑 -->
    <el-dialog v-model="formVisible" :title="editId ? '编辑客户' : '新增客户'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="客户代码" prop="customerCode">
          <el-input v-model="form.customerCode" placeholder="唯一，如 KH001" :spellcheck="false" />
        </el-form-item>
        <el-form-item label="客户名称" prop="customerName">
          <el-input v-model="form.customerName" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contactPerson" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.contactPhone" />
        </el-form-item>
        <el-form-item label="默认业务员">
          <el-input v-model="form.salesman" placeholder="订单选客户后自动带出，可改" />
        </el-form-item>
        <el-form-item label="默认跟单员">
          <el-input v-model="form.merchandiser" />
        </el-form-item>
        <el-form-item label="默认交货地址">
          <el-input v-model="form.deliveryAddress" />
        </el-form-item>
        <!-- 送货单模板：决定给这个客户打印送货单时用哪套版式（列集合/联系电话/签名项都不同）。
             留空 = 用「系统配置 → 业务字段」里的全局默认模板 -->
        <el-form-item label="送货单模板">
          <el-select v-model="form.deliveryTemplate" clearable placeholder="留空 = 用系统默认模板">
            <el-option
              v-for="t in DELIVERY_TEMPLATE_OPTIONS" :key="t.value" :label="t.label" :value="t.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio v-for="s in ENABLE_STATUS" :key="s.value" :value="s.value">{{ s.label }}</el-radio>
          </el-radio-group>
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
    <el-dialog v-model="importVisible" title="批量导入客户" width="480px" @closed="resetImport">
      <div class="import-tip">
        <p>1. 下载模板，按模板填写（<b>客户代码、客户名称必填</b>）；</p>
        <p>2. 整批校验：任一行出错则本次全部不导入，并逐行提示错误；</p>
        <p>3. 开启「覆盖更新」后，已存在的客户代码将按导入内容更新非空列。</p>
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
        <span>覆盖更新（按客户代码 upsert 非空列）</span>
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
import { Plus, Edit, Delete, Search, Upload, Download, UploadFilled } from '@element-plus/icons-vue';
import {
  getCustomerList,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  batchDeleteCustomers,
  importCustomers,
  downloadCustomerTemplate,
  type CustomerItem,
} from '@/api/customer';
import { ENABLE_STATUS, labelOf, tagTypeOf } from '@/constants/dict';
import { DELIVERY_TEMPLATE_OPTIONS } from '@/constants/delivery-note';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

const loading = ref(false);
const list = ref<CustomerItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: undefined as number | undefined });

async function load() {
  loading.value = true;
  try {
    const res = await getCustomerList(query);
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}
function reload() {
  query.page = 1;
  load();
}
const { schedule: scheduleKeywordSearch, flush: runKeywordSearch } = useDebouncedSearch(reload);
load();

/**
 * 送货单模板名。未绑定时显示「系统默认」而不是留空——
 * 空格会让人以为"这个客户不能打送货单"，实际是跟着全局默认模板走。
 */
function deliveryTemplateName(code: string | null): string {
  if (!code) return '系统默认';
  return labelOf(DELIVERY_TEMPLATE_OPTIONS, code) || code;
}

/* ===== 新增/编辑 ===== */
const formVisible = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const emptyForm = () => ({
  customerCode: '',
  customerName: '',
  contactPerson: '',
  contactPhone: '',
  salesman: '',
  merchandiser: '',
  deliveryAddress: '',
  /** 送货单模板编码；空串 = 用系统配置的全局默认模板 */
  deliveryTemplate: '',
  status: 1,
  remark: '',
});
const form = reactive(emptyForm());
const rules = {
  customerCode: [{ required: true, message: '请输入客户代码', trigger: 'blur' }],
  customerName: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
};

function openCreate() {
  editId.value = null;
  Object.assign(form, emptyForm());
  formVisible.value = true;
}
function openEdit(row: CustomerItem) {
  editId.value = row.id;
  Object.assign(form, emptyForm(), {
    customerCode: row.customerCode,
    customerName: row.customerName,
    contactPerson: row.contactPerson ?? '',
    contactPhone: row.contactPhone ?? '',
    salesman: row.salesman ?? '',
    merchandiser: row.merchandiser ?? '',
    deliveryAddress: row.deliveryAddress ?? '',
    deliveryTemplate: row.deliveryTemplate ?? '',
    status: row.status,
    remark: row.remark ?? '',
  });
  formVisible.value = true;
}
async function onSave() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    if (editId.value) await updateCustomer(editId.value, form);
    else await createCustomer(form);
    ElMessage.success('保存成功');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

/* ===== 删除 ===== */
const deletingId = ref<number | null>(null);
async function onDelete(row: CustomerItem) {
  await ElMessageBox.confirm(`确定删除客户「${row.customerName}」吗？被订单引用的客户请改为停用。`, '提示', { type: 'warning' });
  deletingId.value = row.id;
  try {
    await deleteCustomer(row.id);
    ElMessage.success('已删除');
    load();
  } finally {
    deletingId.value = null;
  }
}

/* ===== 批量删除 ===== */
const selection = ref<CustomerItem[]>([]);
const batchDeleting = ref(false);
function onSelectionChange(rows: CustomerItem[]) {
  selection.value = rows;
}
async function onBatchDelete() {
  if (!selection.value.length) return;
  await ElMessageBox.confirm(
    `确定删除选中的 ${selection.value.length} 个客户吗？任一客户被订单引用则整批不删除。`,
    '批量删除',
    { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  );
  batchDeleting.value = true;
  try {
    const res = await batchDeleteCustomers(selection.value.map((r) => r.id));
    ElMessage.success(`已删除 ${res.deleted} 个客户${res.skipped ? `（${res.skipped} 个已不存在，自动跳过）` : ''}`);
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
  const blob = await downloadCustomerTemplate();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '客户导入模板.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
async function onImport() {
  if (!importFile.value) return;
  importing.value = true;
  importErrors.value = [];
  try {
    const res = await importCustomers(importFile.value, importOverwrite.value);
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
/* 筛选卡片：内联表单项横向排列、底部不留间距，避免卡片出现垂直滚动条 */
.filter-card :deep(.el-form--inline .el-form-item) {
  display: inline-flex;
  margin-bottom: 0;
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
