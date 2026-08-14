<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword" clearable style="width: 180px" placeholder="职级名称"
            @input="scheduleKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="所属序列">
          <el-select v-model="query.positionNature" clearable placeholder="全部" style="width: 130px" @change="runKeywordSearch">
            <el-option v-for="o in POSITION_NATURE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 100px" @change="runKeywordSearch">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'job-level:create'" type="primary" :icon="Plus" @click="openForm()">
          新增职级
        </el-button>
        <span class="tip">
          <el-icon><InfoFilled /></el-icon>
          职级是<b>序列内的等级</b>，不是岗位名称——质检员分初/中/高级，工程师分助理/工程师/高级/资深。
          岗位维护时先选<b>岗位性质</b>，职级下拉只列该序列的等级。已被岗位使用的职级<b>不能删除</b>，请改为「停用」。
        </span>
      </div>

      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="id">
        <el-table-column label="所属序列" width="110" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="natureTag(row.positionNature)" disable-transitions>
              {{ positionNatureLabel(row.positionNature) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="职级名称" min-width="140">
          <template #default="{ row }">
            {{ row.levelName }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="等级" width="80" align="center">
          <template #default="{ row }">{{ row.levelRank }}</template>
        </el-table-column>
        <el-table-column label="使用岗位数" width="100" align="center">
          <template #default="{ row }">
            <span :class="row.positionCount > 0 ? 'num-ok' : 'num-zero'">
              {{ row.positionCount > 0 ? row.positionCount : '无' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="排序" prop="sort" width="70" align="center" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 1 ? 'success' : 'info'" disable-transitions>
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'job-level:update'" link type="primary" :icon="EditPen" @click="openForm(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'job-level:delete'" link type="danger" :icon="Delete" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <el-dialog v-model="formVisible" :title="editId ? '编辑职级' : '新增职级'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" size="small">
        <el-form-item label="所属序列" prop="positionNature">
          <el-radio-group v-model="form.positionNature">
            <el-radio v-for="o in POSITION_NATURE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
          </el-radio-group>
          <div class="hint">与「岗位性质」同一套：岗位选了什么性质，就只能配同序列的职级</div>
        </el-form-item>
        <el-form-item label="职级名称" prop="levelName">
          <el-input v-model="form.levelName" placeholder="如 主管级 / 工程师 / 中级" />
        </el-form-item>
        <el-form-item label="等级">
          <el-input-number v-model="form.levelRank" :min="0" :precision="0" :controls="false" style="width: 100%" />
          <div class="hint">序列内的高低，数字越大越高（如 初级1 / 中级2 / 高级3）</div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :precision="0" :controls="false" style="width: 100%" />
          <div class="hint">越小越靠前，控制下拉顺序</div>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
          <div class="hint">停用后不再进下拉，已使用它的岗位不受影响</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" maxlength="255" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="onSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onActivated, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Search, Plus, EditPen, Delete, InfoFilled } from '@element-plus/icons-vue';
import {
  getJobLevelList,
  createJobLevel,
  updateJobLevel,
  deleteJobLevel,
  type JobLevelRow,
} from '@/api/job-level';
import { POSITION_NATURE_OPTIONS, POSITION_NATURE_VALUE, positionNatureLabel } from '@/constants/dict';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

const loading = ref(false);
const saving = ref(false);
const list = ref<JobLevelRow[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  pageSize: 50,
  keyword: '',
  positionNature: undefined as string | undefined,
  status: undefined as number | undefined,
});

const natureTag = (v: string) =>
  POSITION_NATURE_OPTIONS.find((o) => o.value === v)?.type ?? 'info';

async function load() {
  loading.value = true;
  try {
    const res = await getJobLevelList({ ...query });
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
onActivated(load);

const formVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const emptyForm = () => ({
  levelName: '',
  positionNature: POSITION_NATURE_VALUE.NORMAL as string,
  levelRank: 1,
  sort: 0,
  status: 1,
  remark: '',
});
const form = reactive(emptyForm());

const rules: FormRules = {
  levelName: [{ required: true, message: '请填写职级名称', trigger: 'blur' }],
  positionNature: [{ required: true, message: '请选择所属序列', trigger: 'change' }],
};

function openForm(row?: JobLevelRow) {
  editId.value = row?.id ?? null;
  Object.assign(form, emptyForm(), row ? {
    levelName: row.levelName,
    positionNature: row.positionNature,
    levelRank: row.levelRank,
    sort: row.sort,
    status: row.status,
    remark: row.remark ?? '',
  } : {});
  formVisible.value = true;
}

async function onSubmit() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = {
      levelName: form.levelName.trim(),
      positionNature: form.positionNature,
      levelRank: form.levelRank ?? 0,
      sort: form.sort ?? 0,
      status: form.status,
      remark: form.remark || undefined,
    };
    if (editId.value) await updateJobLevel(editId.value, payload);
    else await createJobLevel(payload);
    ElMessage.success(editId.value ? '已保存' : '已新增');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: JobLevelRow) {
  await ElMessageBox.confirm(`确定删除职级「${row.levelName}」吗？`, '删除职级', { type: 'warning' });
  await deleteJobLevel(row.id);
  ElMessage.success('已删除');
  load();
}
</script>

<script lang="ts">
export default { name: 'BasicJobLevel' };
</script>

<style scoped lang="scss">
.toolbar {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
  .tip {
    display: flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--el-text-color-secondary);
    b { color: var(--el-text-color-primary); }
  }
}
.pager { margin-top: 12px; }
.hint { font-size: 12px; line-height: 1.5; color: var(--el-text-color-secondary); }
.num-ok { color: var(--el-color-primary); font-weight: 600; }
.num-zero { color: var(--el-text-color-placeholder); }
</style>
