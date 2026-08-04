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
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize">
        <el-table-column label="生产图号" prop="drawingNo" width="150" fixed="left" />
        <el-table-column label="版本号" prop="drawingVersion" width="80" />
        <el-table-column label="客户名称" prop="customerName" min-width="140" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="产品名称" prop="productName" min-width="140" class-name="col-left" show-overflow-tooltip />
        <el-table-column label="生产机台" width="110">
          <template #default="{ row }">{{ machinesDisplay(row.machines) }}</template>
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
          <el-col :span="24">
            <el-form-item label="生产机台">
              <el-select
                v-model="machineTags"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="输入机台号回车，可多个（如 89、90、91）"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">分部件要求（外轨 / 中轨 / 内轨）</el-divider>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="长度-外轨" label-width="90px"><el-input v-model="form.lengthReqOuter" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="长度-中轨" label-width="90px"><el-input v-model="form.lengthReqMiddle" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="长度-内轨" label-width="90px"><el-input v-model="form.lengthReqInner" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="特殊-外轨" label-width="90px"><el-input v-model="form.specialReqOuter" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="特殊-中轨" label-width="90px"><el-input v-model="form.specialReqMiddle" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="特殊-内轨" label-width="90px"><el-input v-model="form.specialReqInner" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="模具-外轨" label-width="90px"><el-input v-model="form.moldNoOuter" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="模具-中轨" label-width="90px"><el-input v-model="form.moldNoMiddle" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="模具-内轨" label-width="90px"><el-input v-model="form.moldNoInner" /></el-form-item></el-col>
        </el-row>

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
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type UploadFile } from 'element-plus';
import { Plus, Edit, Delete, Search, CircleCloseFilled } from '@element-plus/icons-vue';
import {
  getProcessInfoList,
  createProcessInfo,
  updateProcessInfo,
  deleteProcessInfo,
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
function machinesDisplay(machines: string | null): string {
  return machines ? machines.split(',').filter(Boolean).join('/') : '—';
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
</style>
