<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="机台号/产品型号/图号/机修员"
            style="width: 240px"
            @input="scheduleKeywordSearch"
            @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="部件">
          <el-select v-model="query.partType" clearable placeholder="全部" style="width: 110px" @change="runKeywordSearch">
            <el-option v-for="o in PART_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'equipment-info:create'" type="primary" :icon="Plus" @click="openCreate">新增设备信息</el-button>
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize">
        <el-table-column label="机台号" width="90" fixed="left">
          <template #default="{ row }">
            {{ row.machineNo }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="产品型号" prop="productModel" min-width="140" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.productModel || '—' }}</template>
        </el-table-column>
        <el-table-column label="部件" width="80">
          <template #default="{ row }">
            <color-tag v-if="row.partType" :seed="row.partType">{{ partTypeLabel(row.partType) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="机修员" prop="mechanic" width="90">
          <template #default="{ row }">
            <color-tag v-if="row.mechanic" :seed="row.mechanic">{{ row.mechanic }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="用料规格" prop="materialSpec" min-width="130" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.materialSpec || '—' }}</template>
        </el-table-column>
        <el-table-column label="图号" prop="drawingNo" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.drawingNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="常用料厚" prop="commonThickness" width="110">
          <template #default="{ row }">{{ row.commonThickness || '—' }}</template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="120" class-name="col-left" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="更新人" prop="updaterName" width="90">
          <template #default="{ row }">
            <color-tag v-if="row.updaterName" :seed="row.updaterName">{{ row.updaterName }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'equipment-info:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'equipment-info:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <!-- 新增/编辑（字段少，弹窗即可） -->
    <el-dialog v-model="formVisible" :title="editId ? '编辑设备信息' : '新增设备信息'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="机台号" prop="machineNo">
              <el-input v-model="form.machineNo" placeholder="如 89、362" :spellcheck="false" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="部件">
              <el-select v-model="form.partType" clearable placeholder="外/中/内轨" style="width: 100%">
                <el-option v-for="o in PART_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="产品型号">
              <el-input v-model="form.productModel" placeholder="如 45#缓冲滑轨" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="机修员">
              <el-input v-model="form.mechanic" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="常用料厚">
              <el-input v-model="form.commonThickness" placeholder="如 1.2 / 1.2×1.0×1.2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="用料规格">
              <el-input v-model="form.materialSpec" placeholder="如 卷料 65×1.2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="图号">
              <el-input v-model="form.drawingNo" :spellcheck="false" />
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
import { reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import { Plus, Edit, Delete, Search } from '@element-plus/icons-vue';
import {
  getEquipmentInfoList,
  createEquipmentInfo,
  updateEquipmentInfo,
  deleteEquipmentInfo,
  type EquipmentInfoItem,
} from '@/api/equipment';
import { PART_TYPE_OPTIONS, partTypeLabel } from '@/constants/dict';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';
import ColorTag from '@/components/ColorTag.vue';

const loading = ref(false);
const list = ref<EquipmentInfoItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 20, keyword: '', partType: undefined as string | undefined });

async function load() {
  loading.value = true;
  try {
    const res = await getEquipmentInfoList(query);
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

/* ===== 新增/编辑 ===== */
const formVisible = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const emptyForm = () => ({
  machineNo: '',
  productModel: '',
  partType: '',
  mechanic: '',
  materialSpec: '',
  drawingNo: '',
  commonThickness: '',
  remark: '',
});
const form = reactive(emptyForm());
const rules = {
  machineNo: [{ required: true, message: '请输入机台号', trigger: 'blur' }],
};

function openCreate() {
  editId.value = null;
  Object.assign(form, emptyForm());
  formVisible.value = true;
}
function openEdit(row: EquipmentInfoItem) {
  editId.value = row.id;
  Object.assign(form, emptyForm(), {
    machineNo: row.machineNo,
    productModel: row.productModel ?? '',
    partType: row.partType ?? '',
    mechanic: row.mechanic ?? '',
    materialSpec: row.materialSpec ?? '',
    drawingNo: row.drawingNo ?? '',
    commonThickness: row.commonThickness ?? '',
    remark: row.remark ?? '',
  });
  formVisible.value = true;
}

async function onSave() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    if (editId.value) {
      await updateEquipmentInfo(editId.value, form);
      ElMessage.success('已保存');
    } else {
      await createEquipmentInfo(form);
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
async function onDelete(row: EquipmentInfoItem) {
  await ElMessageBox.confirm(`确定删除机台「${row.machineNo}」的这条适产记录吗？`, '提示', { type: 'warning' });
  deletingId.value = row.id;
  try {
    await deleteEquipmentInfo(row.id);
    ElMessage.success('已删除');
    load();
  } finally {
    deletingId.value = null;
  }
}
</script>

<script lang="ts">
export default { name: 'EquipmentInfo' };
</script>

<style scoped lang="scss">
.toolbar { margin-bottom: 12px; }
.pager { margin-top: 12px; }
</style>
