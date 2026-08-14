<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="runKeywordSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="工号/姓名/手机/身份证"
            style="width: 200px"
            @input="scheduleKeywordSearch"
            @keyup.enter="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="所属组织">
          <el-tree-select
            v-model="query.deptId"
            :data="deptTree"
            :props="{ label: 'deptName', children: 'children' }"
            node-key="id"
            check-strictly
            clearable
            placeholder="全部"
            style="width: 180px"
            @change="runKeywordSearch"
          />
        </el-form-item>
        <el-form-item label="厂区">
          <el-select v-model="query.plantCode" clearable placeholder="全部" style="width: 140px" @change="runKeywordSearch">
            <el-option v-for="o in EMP_PLANT_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="用工属性">
          <el-select v-model="query.empType" clearable placeholder="全部" style="width: 120px" @change="runKeywordSearch">
            <el-option v-for="o in empTypeOpts" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位">
          <el-select v-model="query.positionId" clearable filterable placeholder="全部" style="width: 140px" @change="runKeywordSearch">
            <el-option v-for="o in positionOpts" :key="o.id" :label="o.positionName" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="在职状态">
          <el-select v-model="query.jobStatus" clearable placeholder="全部" style="width: 110px" @change="runKeywordSearch">
            <el-option v-for="o in JOB_STATUS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="runKeywordSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button size="small" v-permission="'employee:create'" type="primary" :icon="Plus" @click="openCreate">新增员工</el-button>
        <span class="tip">
          <el-icon><InfoFilled /></el-icon>
          人事档案为 HR 独立模块，可选用部门等主数据；<b>暂不向订单等业务模块供数</b>。
        </span>
      </div>
      <app-table :data="list" v-loading="loading" border stripe :page="query.page" :page-size="query.pageSize" row-key="id">
        <el-table-column label="员工编号" width="120" fixed="left">
          <template #default="{ row }">
            {{ row.empNo }}<audit-info mode="inline" :row="row" />
          </template>
        </el-table-column>
        <el-table-column label="姓名" prop="empName" width="90" fixed="left" />
        <el-table-column label="厂区" width="110" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.plantCode" :seed="row.plantCode">{{ empPlantLabel(row.plantCode) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="性别" width="60" align="center">
          <template #default="{ row }">{{ labelOf(GENDER, row.gender) }}</template>
        </el-table-column>
        <el-table-column label="年龄" width="60" align="center">
          <template #default="{ row }">{{ ageFromBirthDate(row.birthDate) ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="籍贯" width="100" show-overflow-tooltip>
          <template #default="{ row }">{{ row.nativePlace || '—' }}</template>
        </el-table-column>
        <el-table-column label="学历" width="90" align="center">
          <template #default="{ row }">{{ dictLabel(educationOpts, row.education) }}</template>
        </el-table-column>
        <el-table-column label="所属组织" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.deptName || '—' }}</template>
        </el-table-column>
        <el-table-column label="班组" width="90" show-overflow-tooltip>
          <template #default="{ row }">
            <color-tag v-if="row.teamGroup" :seed="row.teamGroup">{{ row.teamGroup }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="岗位" width="100" align="center">
          <template #default="{ row }">{{ row.positionName || '—' }}</template>
        </el-table-column>
        <el-table-column label="用工属性" width="90" align="center">
          <template #default="{ row }">
            <color-tag v-if="row.empType" :seed="row.empType">{{ dictLabel(empTypeOpts, row.empType) }}</color-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="入职日期" width="110" align="center">
          <template #default="{ row }">{{ row.hireDate || '—' }}</template>
        </el-table-column>
        <el-table-column label="在职状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="tagTypeOf(JOB_STATUS, row.jobStatus)">
              {{ labelOf(JOB_STATUS, row.jobStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="联系方式" width="120">
          <template #default="{ row }">{{ row.phone || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <app-actions>
              <el-button size="small" v-permission.disable="'employee:update'" link type="primary" class="btn-edit" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" v-permission.disable="'employee:delete'" link type="primary" class="btn-delete" :icon="Delete" :loading="deletingId === row.id" @click="onDelete(row)">删除</el-button>
            </app-actions>
          </template>
        </el-table-column>
      </app-table>
      <app-pagination class="pager" :total="total" v-model:page="query.page" v-model:size="query.pageSize" @change="load" />
    </el-card>

  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'HrEmployee' });

import { reactive, ref, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Edit, Delete, InfoFilled } from '@element-plus/icons-vue';
import { getEmployeeList, deleteEmployee, type EmployeeRow } from '@/api/employee';
import { getPositionOptions, type PositionOption } from '@/api/position';
import { getDeptTree, type DeptNode } from '@/api/system';
import {
  JOB_STATUS,
  GENDER,
  labelOf,
  tagTypeOf,
  ageFromBirthDate,
  EMP_PLANT_OPTIONS,
  empPlantLabel,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import { useDebouncedSearch } from '@/composables/useDebouncedSearch';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';
import ColorTag from '@/components/ColorTag.vue';

const router = useRouter();
const loading = ref(false);
const list = ref<EmployeeRow[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  deptId: undefined as number | undefined,
  plantCode: undefined as string | undefined,
  empType: undefined as string | undefined,
  positionId: undefined as number | undefined,
  jobStatus: undefined as number | undefined,
});

const empTypeOpts = ref<Array<{ label: string; value: string }>>([]);
const positionOpts = ref<PositionOption[]>([]);
const educationOpts = ref<Array<{ label: string; value: string }>>([]);
const deptTree = ref<DeptNode[]>([]);

function mapDict(rows: any[]) {
  return rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
}
loadDict('emp_type').then((rows: any[]) => { empTypeOpts.value = mapDict(rows); });
loadDict('education').then((rows: any[]) => { educationOpts.value = mapDict(rows); });
getDeptTree().then((t) => { deptTree.value = t || []; }).catch(() => {});
// 岗位筛选下拉：全部启用岗位（不按部门过滤——列表筛选要能跨部门找人）
getPositionOptions().then((rows) => { positionOpts.value = rows || []; }).catch(() => {});

function dictLabel(opts: Array<{ label: string; value: string }>, v: string | null) {
  if (!v) return '—';
  return opts.find((o) => o.value === v)?.label ?? v;
}

async function load() {
  loading.value = true;
  try {
    const res = (await getEmployeeList({ ...query })) as any;
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

const deletingId = ref<number | null>(null);

/** 录入/编辑走独立子页面（字段四大段，弹窗塞不下），列表只负责跳转 */
function openCreate() {
  router.push('/hr/employee/form');
}
function openEdit(row: EmployeeRow) {
  router.push({ path: '/hr/employee/form', query: { id: row.id } });
}


async function onDelete(row: EmployeeRow) {
  await ElMessageBox.confirm(`确认删除员工「${row.empName}（${row.empNo}）」？`, '删除确认', { type: 'warning' });
  deletingId.value = row.id;
  try {
    await deleteEmployee(row.id);
    ElMessage.success('已删除');
    load();
  } finally {
    deletingId.value = null;
  }
}
</script>

<style scoped lang="scss">
/** 编码规则相关字段的行内说明：告诉 HR 这一项决定编号的第几位 */
.code-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  b { color: var(--el-text-color-primary); }
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  b { color: var(--el-text-color-regular); font-weight: 600; }
}
.pager { margin-top: 12px; }
.form-sec {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-left: 3px solid var(--el-color-primary);
  padding-left: 8px;
  margin: 4px 0 12px;
  line-height: 1.3;
  &:not(:first-child) { margin-top: 16px; }
}
</style>
