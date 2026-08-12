<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="reload">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword" clearable style="width: 200px"
            placeholder="岗位编码 / 名称"
            @clear="reload" @keyup.enter="reload"
          />
        </el-form-item>
        <el-form-item label="所属部门">
          <el-tree-select
            v-model="query.deptId"
            :data="deptTree"
            :props="{ label: 'deptName', children: 'children' }"
            node-key="id"
            check-strictly
            clearable
            placeholder="全部"
            style="width: 180px"
            @change="reload"
          />
        </el-form-item>
        <el-form-item label="岗位性质">
          <el-select v-model="query.isManager" clearable placeholder="全部" style="width: 120px" @change="reload">
            <el-option label="管理岗" :value="1" />
            <el-option label="普通岗" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 100px" @change="reload">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="query.onlyCommon" @change="reload">只看通用岗位</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="reload">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'position:create'" type="primary" :icon="Plus" @click="openForm()">
          新增岗位
        </el-button>
        <span class="tip">
          <el-icon><InfoFilled /></el-icon>
          岗位供「人事档案」建档时选择。<b>不填所属部门 = 通用岗位</b>，任何部门都能选到。
          已被员工使用的岗位<b>不能删除</b>，要下线请改成「停用」。
        </span>
      </div>

      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="id">
        <el-table-column label="岗位编码" width="130" fixed="left">
          <template #default="{ row }">
            {{ row.positionCode }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="岗位名称" prop="positionName" min-width="120" fixed="left" />
        <el-table-column label="所属部门" min-width="130">
          <template #default="{ row }">
            <span v-if="row.deptName">{{ row.deptName }}</span>
            <el-tag v-else size="small" type="info" disable-transitions>通用岗位</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="职级" width="90" align="center">
          <template #default="{ row }">{{ dictLabel(jobLevelOpts, row.jobLevel) }}</template>
        </el-table-column>
        <el-table-column label="岗位性质" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.isManager === 1" size="small" type="warning" disable-transitions>管理岗</el-tag>
            <span v-else>普通岗</span>
          </template>
        </el-table-column>
        <el-table-column label="编制 / 在岗" width="110" align="center">
          <template #default="{ row }">
            <span :class="{ 'over-head': isOverHead(row) }">
              {{ row.headcount ?? '不限' }} / {{ row.employeeCount ?? 0 }}
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
        <el-table-column label="备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button
                size="small" v-permission.disable="'position:update'" link type="primary" :icon="EditPen"
                @click="openForm(row)"
              >编辑</el-button>
              <el-button
                size="small" v-permission.disable="'position:delete'" link type="danger" :icon="Delete"
                @click="onDelete(row)"
              >删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

    <el-dialog v-model="formVisible" :title="editId ? '编辑岗位' : '新增岗位'" width="680px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" size="small">
        <el-row :gutter="14">
          <el-col :span="12">
            <el-form-item label="岗位编码">
              <el-input
                :model-value="editId ? form.positionCode : '保存后自动生成'"
                disabled :spellcheck="false"
              />
              <div class="hint">
                <template v-if="editId">编码<b>不可修改</b>，它是对账用的唯一业务键</template>
                <template v-else>保存时自动生成 <b>POS + 3 位流水号</b>，无需手工填写</template>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="岗位名称" prop="positionName">
              <el-input v-model="form.positionName" placeholder="如 质检" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属部门">
              <el-tree-select
                v-model="form.deptId"
                :data="deptTree"
                :props="{ label: 'deptName', children: 'children' }"
                node-key="id"
                check-strictly
                clearable
                default-expand-all
                placeholder="留空=通用岗位"
                style="width: 100%"
              />
              <div class="hint">留空表示<b>通用岗位</b>，任何部门的员工都能选到</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="职级">
              <el-select v-model="form.jobLevel" clearable placeholder="可选" style="width: 100%">
                <el-option v-for="o in jobLevelOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="岗位性质">
              <el-radio-group v-model="form.isManager">
                <el-radio :value="0">普通岗</el-radio>
                <el-radio :value="1">管理岗</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="编制人数">
              <el-input-number
                v-model="form.headcount" :min="0" :precision="0" :controls="false"
                placeholder="留空=不限编" style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序">
              <el-input-number v-model="form.sort" :min="0" :precision="0" :controls="false" style="width: 100%" />
              <div class="hint">越小越靠前，控制下拉顺序</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-switch
                v-model="form.status" :active-value="1" :inactive-value="0"
                active-text="启用" inactive-text="停用"
              />
              <div class="hint">停用后不再进下拉，已在岗员工不受影响</div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" maxlength="255" show-word-limit />
            </el-form-item>
          </el-col>
        </el-row>
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
  getPositionList,
  createPosition,
  updatePosition,
  deletePosition,
  type PositionRow,
} from '@/api/position';
import { getDeptTree, type DeptNode } from '@/api/system';
import { loadDict } from '@/composables/useDict';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

const loading = ref(false);
const saving = ref(false);
const list = ref<PositionRow[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  deptId: undefined as number | undefined,
  isManager: undefined as number | undefined,
  status: undefined as number | undefined,
  onlyCommon: false,
});

const deptTree = ref<DeptNode[]>([]);
getDeptTree().then((t) => { deptTree.value = t || []; }).catch(() => {});

const jobLevelOpts = ref<Array<{ label: string; value: string }>>([]);
loadDict('job_level').then((rows: any[]) => {
  jobLevelOpts.value = rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
});
const dictLabel = (opts: Array<{ label: string; value: string }>, v: string | null) =>
  (v && opts.find((o) => o.value === v)?.label) || (v || '—');

/** 在岗人数超过编制 → 标红提醒 */
const isOverHead = (row: PositionRow) =>
  row.headcount != null && (row.employeeCount ?? 0) > row.headcount;

async function load() {
  loading.value = true;
  try {
    const res = await getPositionList({ ...query });
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

/* ===== 新增 / 编辑 ===== */
const formVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const emptyForm = () => ({
  positionCode: '',
  positionName: '',
  deptId: undefined as number | undefined,
  jobLevel: '' as string,
  isManager: 0,
  headcount: undefined as number | undefined,
  sort: 0,
  status: 1,
  remark: '',
});
const form = reactive(emptyForm());

// 岗位编码由服务端自动采番，不校验
const rules: FormRules = {
  positionName: [{ required: true, message: '请填写岗位名称', trigger: 'blur' }],
};

function openForm(row?: PositionRow) {
  editId.value = row?.id ?? null;
  Object.assign(form, emptyForm(), row ? {
    positionCode: row.positionCode,
    positionName: row.positionName,
    deptId: row.deptId ?? undefined,
    jobLevel: row.jobLevel ?? '',
    isManager: row.isManager,
    headcount: row.headcount ?? undefined,
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
      // 编码不回传：新增由服务端采番，编辑时服务端也会无视（编码不可改）
      positionName: form.positionName.trim(),
      deptId: form.deptId ?? undefined,
      jobLevel: form.jobLevel || undefined,
      isManager: form.isManager,
      headcount: form.headcount ?? undefined,
      sort: form.sort ?? 0,
      status: form.status,
      remark: form.remark || undefined,
    };
    if (editId.value) {
      await updatePosition(editId.value, payload);
      ElMessage.success('已保存');
    } else {
      const res = await createPosition(payload);
      ElMessage.success(`已新增，岗位编码 ${res?.positionCode ?? ''}`);
    }
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: PositionRow) {
  await ElMessageBox.confirm(
    `确定删除岗位「${row.positionName}」吗？`,
    '删除岗位',
    { type: 'warning' },
  );
  await deletePosition(row.id);
  ElMessage.success('已删除');
  load();
}
</script>

<script lang="ts">
export default { name: 'BasicPosition' };
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
.hint { font-size: 12px; line-height: 1.5; color: var(--el-text-color-secondary);
  b { color: var(--el-text-color-primary); } }
/* 在岗人数超编：标红，提示需要扩编或调岗 */
.over-head { color: var(--el-color-danger); font-weight: 600; }
</style>
