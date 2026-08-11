<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="reload">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="供应商编码/名称/联系人"
            style="width: 220px"
            @clear="reload"
            @keyup.enter="reload"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 120px" @change="reload">
            <el-option v-for="s in ENABLE_STATUS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="reload">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'supplier:create'" type="primary" :icon="Plus" @click="openCreate">新增供应商</el-button>
        <span class="tip">
          <el-icon><InfoFilled /></el-icon>
          维护在这里的供应商会出现在<b>「登记外发件回厂」的加工商下拉</b>里；停用只是不再进下拉，<b>历史记录不受影响</b>。
        </span>
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="id">
        <el-table-column label="供应商编码" width="130">
          <template #default="{ row }">
            {{ row.supplierCode }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="供应商名称" prop="supplierName" min-width="160" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="联系人" prop="contactPerson" width="100">
          <template #default="{ row }">{{ row.contactPerson || '—' }}</template>
        </el-table-column>
        <el-table-column label="联系电话" prop="contactPhone" width="140">
          <template #default="{ row }">{{ row.contactPhone || '—' }}</template>
        </el-table-column>
        <el-table-column label="地址" prop="address" min-width="180" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.address || '—' }}</template>
        </el-table-column>
        <el-table-column label="排序" prop="sort" width="70" align="center" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="tagTypeOf(ENABLE_STATUS, row.status)" size="small">
              {{ labelOf(ENABLE_STATUS, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="120" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'supplier:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'supplier:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <!-- 新增/编辑 -->
    <el-dialog v-model="formVisible" :title="editId ? '编辑供应商' : '新增供应商'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" size="small">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="供应商编码" prop="supplierCode">
              <el-input v-model="form.supplierCode" placeholder="唯一，如 SUP-001" :spellcheck="false" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="供应商名称" prop="supplierName">
              <el-input v-model="form.supplierName" placeholder="如 松汉电镀" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系人">
              <el-input v-model="form.contactPerson" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话">
              <el-input v-model="form.contactPhone" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="地址">
              <el-input v-model="form.address" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序">
              <el-input-number v-model="form.sort" :min="0" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'BasicSupplier' });

import { reactive, ref, onActivated } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Search, Plus, Edit, Delete, InfoFilled } from '@element-plus/icons-vue';
import {
  getSupplierList,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  type SupplierRow,
} from '@/api/supplier';
import { ENABLE_STATUS, labelOf, tagTypeOf } from '@/constants/dict';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

const loading = ref(false);
const list = ref<SupplierRow[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: undefined as number | undefined,
});

async function load() {
  loading.value = true;
  try {
    const res = await getSupplierList({ ...query });
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
load();
onActivated(load);

/* ===== 新增/编辑 ===== */
const formVisible = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const emptyForm = () => ({
  supplierCode: '',
  supplierName: '',
  contactPerson: '',
  contactPhone: '',
  address: '',
  sort: 0,
  status: 1,
  remark: '',
});
const form = reactive(emptyForm());

const rules: FormRules = {
  supplierCode: [{ required: true, message: '请输入供应商编码', trigger: 'blur' }],
  supplierName: [{ required: true, message: '请输入供应商名称', trigger: 'blur' }],
};

function openCreate() {
  editId.value = null;
  Object.assign(form, emptyForm());
  formVisible.value = true;
}
function openEdit(row: SupplierRow) {
  editId.value = row.id;
  Object.assign(form, {
    supplierCode: row.supplierCode,
    supplierName: row.supplierName,
    contactPerson: row.contactPerson ?? '',
    contactPhone: row.contactPhone ?? '',
    address: row.address ?? '',
    sort: row.sort,
    status: row.status,
    remark: row.remark ?? '',
  });
  formVisible.value = true;
}

async function onSave() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    if (editId.value) {
      await updateSupplier(editId.value, { ...form });
      ElMessage.success('已保存');
    } else {
      await createSupplier({ ...form });
      ElMessage.success('已新增');
    }
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

/* ===== 删除 ===== */
const deletingId = ref<number | null>(null);
async function onDelete(row: SupplierRow) {
  // 外发记录存的是名称快照，不持有 supplier_id，删除不影响历史（见后端 service 注释）
  await ElMessageBox.confirm(
    `确定删除供应商「${row.supplierName}」吗？已登记的外发回厂记录保存的是名称快照，<b>不受影响</b>；` +
      '若只是暂时不用，改成「停用」即可。',
    '删除供应商',
    { type: 'warning', dangerouslyUseHTMLString: true, confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  );
  deletingId.value = row.id;
  try {
    await deleteSupplier(row.id);
    ElMessage.success('已删除');
    load();
  } finally {
    deletingId.value = null;
  }
}
</script>

<style scoped lang="scss">
.toolbar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  .tip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    b { color: var(--el-text-color-primary); }
  }
}
.pager { margin-top: 12px; }
</style>
