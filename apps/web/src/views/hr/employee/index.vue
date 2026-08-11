<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="filter-bar" @submit.prevent="reload">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="工号/姓名/手机/身份证"
            style="width: 200px"
            @clear="reload"
            @keyup.enter="reload"
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
            @change="reload"
          />
        </el-form-item>
        <el-form-item label="厂区">
          <el-select v-model="query.plantCode" clearable placeholder="全部" style="width: 140px" @change="reload">
            <el-option v-for="o in EMP_PLANT_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="用工属性">
          <el-select v-model="query.empType" clearable placeholder="全部" style="width: 120px" @change="reload">
            <el-option v-for="o in empTypeOpts" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位">
          <el-select v-model="query.position" clearable placeholder="全部" style="width: 120px" @change="reload">
            <el-option v-for="o in positionOpts" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="在职状态">
          <el-select v-model="query.jobStatus" clearable placeholder="全部" style="width: 110px" @change="reload">
            <el-option v-for="o in JOB_STATUS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button size="small" type="primary" :icon="Search" @click="reload">查询</el-button>
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
          <template #default="{ row }">{{ empPlantLabel(row.plantCode) || '—' }}</template>
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
          <template #default="{ row }">{{ row.teamGroup || '—' }}</template>
        </el-table-column>
        <el-table-column label="岗位" width="90" align="center">
          <template #default="{ row }">{{ dictLabel(positionOpts, row.position) }}</template>
        </el-table-column>
        <el-table-column label="用工属性" width="90" align="center">
          <template #default="{ row }">{{ dictLabel(empTypeOpts, row.empType) }}</template>
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

    <el-dialog v-model="formVisible" :title="editId ? '编辑员工' : '新增员工'" width="820px" top="4vh" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" size="small">
        <div class="form-sec">基本信息</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="员工编号">
              <el-input :model-value="editId ? form.empNo : codePreviewText" disabled :spellcheck="false" />
              <div class="code-hint">
                <template v-if="editId">
                  编号<b>终身不变</b>，调岗 / 升职 / 跨厂区调动都不换号
                </template>
                <template v-else>
                  保存时按<b>厂区 + 年份 + 部门 + 流水号</b>自动生成，无需手工填写
                </template>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" prop="empName">
              <el-input v-model="form.empName" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="厂区" prop="plantCode">
              <el-select v-model="form.plantCode" placeholder="请选择" style="width: 100%">
                <el-option v-for="o in EMP_PLANT_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <div class="code-hint">编号第 1-2 位；跨厂区调动改这里，<b>编号不变</b></div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="性别" prop="gender">
              <el-radio-group v-model="form.gender">
                <el-radio :value="1">男</el-radio>
                <el-radio :value="2">女</el-radio>
                <el-radio :value="0">未知</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="身份证">
              <el-input v-model="form.idCard" maxlength="18" placeholder="选填，可带出生日" @blur="onIdCardBlur" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="出生日期">
              <el-date-picker v-model="form.birthDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系方式">
              <el-input v-model="form.phone" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="籍贯">
              <el-input v-model="form.nativePlace" placeholder="如：广东东莞" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="民族">
              <el-input v-model="form.ethnicity" placeholder="如：汉族" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="婚姻状况">
              <el-select v-model="form.maritalStatus" clearable style="width: 100%">
                <el-option v-for="o in maritalOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="政治面貌">
              <el-select v-model="form.politicalStatus" clearable style="width: 100%">
                <el-option v-for="o in politicalOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="住址">
              <el-input v-model="form.address" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="紧急联系人">
              <el-input v-model="form.emergencyContact" placeholder="如：张三 138xxxx" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-sec">教育背景</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="学历">
              <el-select v-model="form.education" clearable style="width: 100%">
                <el-option v-for="o in educationOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="学历类型">
              <el-select v-model="form.educationType" clearable placeholder="选填" style="width: 100%">
                <el-option v-for="o in EDUCATION_TYPE" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="专业">
              <el-input v-model="form.major" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="毕业时间">
              <el-date-picker
                v-model="form.graduateDate"
                type="month"
                value-format="YYYY-MM-DD"
                placeholder="选择年月"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="毕业院校">
              <el-input v-model="form.graduateSchool" placeholder="最终毕业院校" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-sec">用工属性</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="用工属性" prop="empType">
              <el-select v-model="form.empType" style="width: 100%">
                <el-option v-for="o in empTypeOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="在职状态" prop="jobStatus">
              <el-radio-group v-model="form.jobStatus">
                <el-radio v-for="o in JOB_STATUS" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入职日期">
              <el-date-picker v-model="form.hireDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="试用期(月)">
              <el-input-number v-model="form.probationMonths" :min="0" :max="36" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="合同到期日">
              <el-date-picker v-model="form.contractEndDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="档案状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" :disabled="form.jobStatus === JOB_STATUS_VALUE.LEFT" />
            </el-form-item>
          </el-col>
          <template v-if="form.jobStatus === JOB_STATUS_VALUE.LEFT">
            <el-col :span="12">
              <el-form-item label="离职日期" prop="leaveDate">
                <el-date-picker v-model="form.leaveDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="离职原因">
                <el-input v-model="form.leaveReason" />
              </el-form-item>
            </el-col>
          </template>
        </el-row>

        <div class="form-sec">车间属性</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="所属组织" prop="deptId">
              <el-tree-select
                v-model="form.deptId"
                :data="deptTreeLabeled"
                :props="{ label: 'codeLabel', children: 'children' }"
                node-key="id"
                check-strictly
                clearable
                default-expand-all
                placeholder="选自部门信息"
                style="width: 100%"
              />
              <div class="code-hint">
                括号里是<b>人事编码</b>（编号第 5-7 位）；没有编码的部门无法生成员工编号，
                需先到「基础数据 → 部门信息」配置
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="班组">
              <el-input v-model="form.teamGroup" placeholder="自由填写" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="岗位">
              <el-select v-model="form.position" clearable style="width: 100%">
                <el-option v-for="o in positionOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="直属主管">
              <el-select v-model="form.supervisorId" clearable filterable style="width: 100%" placeholder="本表在职员工">
                <el-option
                  v-for="o in supervisorOpts"
                  :key="o.id"
                  :label="`${o.empName}（${o.empNo}）`"
                  :value="o.id"
                  :disabled="o.id === editId"
                />
              </el-select>
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
defineOptions({ name: 'HrEmployee' });

import { computed, reactive, ref, onActivated, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Search, Plus, Edit, Delete, InfoFilled } from '@element-plus/icons-vue';
import {
  getEmployeeList,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  type EmployeeRow,
} from '@/api/employee';
import { getDeptTree, type DeptNode } from '@/api/system';
import {
  ENABLE_STATUS_VALUE,
  JOB_STATUS,
  JOB_STATUS_VALUE,
  GENDER,
  EDUCATION_TYPE,
  labelOf,
  tagTypeOf,
  ageFromBirthDate,
  birthDateFromIdCard,
  EMP_PLANT_OPTIONS,
  empPlantLabel,
  empCodePreview,
  isConvertToFormal,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';
import AppTable from '@/components/AppTable.vue';
import AppPagination from '@/components/AppPagination.vue';
import AppActions from '@/components/AppActions.vue';

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
  position: undefined as string | undefined,
  jobStatus: undefined as number | undefined,
});

const empTypeOpts = ref<Array<{ label: string; value: string }>>([]);
const positionOpts = ref<Array<{ label: string; value: string }>>([]);
const maritalOpts = ref<Array<{ label: string; value: string }>>([]);
const politicalOpts = ref<Array<{ label: string; value: string }>>([]);
const educationOpts = ref<Array<{ label: string; value: string }>>([]);
const deptTree = ref<DeptNode[]>([]);
const supervisorOpts = ref<Array<{ id: number; empNo: string; empName: string }>>([]);

function mapDict(rows: any[]) {
  return rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
}
loadDict('emp_type').then((rows: any[]) => { empTypeOpts.value = mapDict(rows); });
loadDict('hr_position').then((rows: any[]) => { positionOpts.value = mapDict(rows); });
loadDict('marital_status').then((rows: any[]) => { maritalOpts.value = mapDict(rows); });
loadDict('political_status').then((rows: any[]) => { politicalOpts.value = mapDict(rows); });
loadDict('education').then((rows: any[]) => { educationOpts.value = mapDict(rows); });
getDeptTree().then((t) => { deptTree.value = t || []; }).catch(() => {});

/** 部门树节点标签带上人事编码：「品检部（005）」，让 HR 一眼看出哪些部门能生成编号 */
const deptTreeLabeled = computed(() => {
  const walk = (nodes: any[]): any[] =>
    (nodes || []).map((n) => ({
      ...n,
      codeLabel: n.hrCode ? `${n.deptName}（${n.hrCode}）` : `${n.deptName}（未配人事编码）`,
      children: walk(n.children || []),
    }));
  return walk(deptTree.value as any[]);
});

/** 部门 id → 人事编码，供编号预览用 */
const deptHrCodeMap = computed(() => {
  const map = new Map<number, string>();
  const walk = (nodes: any[]) => {
    (nodes || []).forEach((n) => {
      if (n.hrCode) map.set(Number(n.id), String(n.hrCode));
      walk(n.children || []);
    });
  };
  walk(deptTree.value as any[]);
  return map;
});

/**
 * 新增时的编号预览：只展示能确定的前 7 位（厂区+年份+部门），
 * 流水号用 ??? 占位——真实流水号由服务端采番时才定，提前显示可能与最终值不符。
 */
const codePreviewText = computed(() => {
  const prefix = empCodePreview({
    plantCode: form.plantCode,
    hireDate: form.hireDate,
    deptCode: form.deptId ? deptHrCodeMap.value.get(form.deptId) : '',
    empType: form.empType,
  });
  return prefix ? `${prefix}???` : '补全厂区 / 入职日期 / 部门后自动生成';
});

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
load();
onActivated(load);

const formVisible = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const deletingId = ref<number | null>(null);

const emptyForm = () => ({
  empNo: '',
  plantCode: '' as string,
  empName: '',
  gender: 1,
  idCard: '',
  birthDate: '' as string,
  phone: '',
  address: '',
  emergencyContact: '',
  nativePlace: '',
  ethnicity: '',
  maritalStatus: '' as string,
  politicalStatus: '' as string,
  education: '' as string,
  educationType: '' as string,
  major: '',
  graduateSchool: '',
  graduateDate: '' as string,
  empType: 'formal',
  hireDate: '' as string,
  probationMonths: undefined as number | undefined,
  contractEndDate: '' as string,
  jobStatus: JOB_STATUS_VALUE.ACTIVE as number,
  leaveDate: '' as string,
  leaveReason: '',
  deptId: undefined as number | undefined,
  teamGroup: '',
  position: '' as string,
  supervisorId: undefined as number | undefined,
  status: ENABLE_STATUS_VALUE.ENABLED as number,
  remark: '',
});
const form = reactive(emptyForm());

const rules = computed<FormRules>(() => ({
  // 员工编号由服务端生成，不再校验；厂区/入职日期/部门是生成编号的三项前置信息
  plantCode: [{ required: true, message: '请选择厂区（员工编号第 1-2 位）', trigger: 'change' }],
  hireDate: [{ required: true, message: '请填写入职日期（决定编号第 3-4 位年份标识）', trigger: 'change' }],
  deptId: [{ required: true, message: '请选择所属组织（员工编号第 5-7 位）', trigger: 'change' }],
  empName: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  gender: [{ required: true, message: '请选择性别', trigger: 'change' }],
  empType: [{ required: true, message: '请选择用工属性', trigger: 'change' }],
  jobStatus: [{ required: true, message: '请选择在职状态', trigger: 'change' }],
  leaveDate:
    form.jobStatus === JOB_STATUS_VALUE.LEFT
      ? [{ required: true, message: '离职时请填写离职日期', trigger: 'change' }]
      : [],
}));

watch(
  () => form.jobStatus,
  (v) => {
    if (v === JOB_STATUS_VALUE.LEFT) form.status = ENABLE_STATUS_VALUE.DISABLED;
  },
);

function onIdCardBlur() {
  if (!form.birthDate) {
    const d = birthDateFromIdCard(form.idCard);
    if (d) form.birthDate = d;
  }
}

async function loadSupervisors() {
  const rows = (await getEmployeeList({ forSupervisor: true })) as any;
  supervisorOpts.value = Array.isArray(rows) ? rows : [];
}

function openCreate() {
  editId.value = null;
  Object.assign(form, emptyForm());
  formVisible.value = true;
  loadSupervisors();
}
function openEdit(row: EmployeeRow) {
  editId.value = row.id;
  Object.assign(form, emptyForm(), {
    empNo: row.empNo,
    plantCode: row.plantCode || '',
    empName: row.empName,
    gender: row.gender ?? 0,
    idCard: row.idCard || '',
    birthDate: row.birthDate || '',
    phone: row.phone || '',
    address: row.address || '',
    emergencyContact: row.emergencyContact || '',
    nativePlace: row.nativePlace || '',
    ethnicity: row.ethnicity || '',
    maritalStatus: row.maritalStatus || '',
    politicalStatus: row.politicalStatus || '',
    education: row.education || '',
    educationType: row.educationType || '',
    major: row.major || '',
    graduateSchool: row.graduateSchool || '',
    graduateDate: row.graduateDate || '',
    empType: row.empType,
    hireDate: row.hireDate || '',
    probationMonths: row.probationMonths ?? undefined,
    contractEndDate: row.contractEndDate || '',
    jobStatus: row.jobStatus,
    leaveDate: row.leaveDate || '',
    leaveReason: row.leaveReason || '',
    deptId: row.deptId ?? undefined,
    teamGroup: row.teamGroup || '',
    position: row.position || '',
    supervisorId: row.supervisorId ?? undefined,
    status: row.status,
    remark: row.remark || '',
  });
  formVisible.value = true;
  loadSupervisors();
}

async function onSave() {
  await formRef.value?.validate();

  /**
   * 试用转正换发正式编码（规则五）：实习生 S / 临时工 L 转成不带前缀的用工属性时，
   * 换发标准 10 位编码。**必须先问过用户**——编号是对外标识，
   * 悄悄换掉会让工牌、考勤、薪资对不上账。用户选「保留」就沿用原编号。
   */
  let regenerateEmpNo = false;
  const original = editId.value ? list.value.find((r) => r.id === editId.value) : null;
  if (original && isConvertToFormal(original.empType, form.empType)) {
    try {
      await ElMessageBox.confirm(
        `「${form.empName}」由${dictLabel(empTypeOpts.value, original.empType)}转为`
          + `${dictLabel(empTypeOpts.value, form.empType)}，按编码规则应换发 10 位正式员工编号`
          + `（现编号 ${original.empNo}）。换发后原编号永久封存、不再启用。`,
        '试用转正：是否换发正式编号？',
        { type: 'warning', confirmButtonText: '换发新编号', cancelButtonText: '保留原编号' },
      );
      regenerateEmpNo = true;
    } catch {
      regenerateEmpNo = false;
    }
  }

  saving.value = true;
  try {
    const payload: any = {
      ...form,
      // 编号一律不回传：新增由服务端生成，编辑时服务端也会无视（编号终身不变）
      empNo: undefined,
      regenerateEmpNo: regenerateEmpNo || undefined,
      idCard: form.idCard || undefined,
      birthDate: form.birthDate || undefined,
      nativePlace: form.nativePlace || undefined,
      ethnicity: form.ethnicity || undefined,
      maritalStatus: form.maritalStatus || undefined,
      politicalStatus: form.politicalStatus || undefined,
      education: form.education || undefined,
      educationType: form.educationType || undefined,
      major: form.major || undefined,
      graduateSchool: form.graduateSchool || undefined,
      graduateDate: form.graduateDate || undefined,
      hireDate: form.hireDate || undefined,
      contractEndDate: form.contractEndDate || undefined,
      leaveDate: form.jobStatus === JOB_STATUS_VALUE.LEFT ? form.leaveDate || undefined : undefined,
      leaveReason: form.jobStatus === JOB_STATUS_VALUE.LEFT ? form.leaveReason || undefined : undefined,
      position: form.position || undefined,
      deptId: form.deptId ?? undefined,
      supervisorId: form.supervisorId ?? undefined,
      probationMonths: form.probationMonths ?? undefined,
    };
    if (editId.value) {
      const res = await updateEmployee(editId.value, payload);
      ElMessage.success(res?.empNoChanged ? `已保存，新编号 ${res.empNo}` : '已保存');
    } else {
      const res = await createEmployee(payload);
      ElMessage.success(`已新增，员工编号 ${res?.empNo ?? ''}`);
    }
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
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
