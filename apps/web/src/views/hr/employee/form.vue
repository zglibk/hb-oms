<template>
  <div class="page">
    <el-card shadow="never" v-loading="loading">
      <div class="form-header">
        <div class="form-title">
          <el-button size="small" :icon="Back" @click="goBack">返回列表</el-button>
          <span class="title-text">{{ editId ? '编辑员工' : '新增员工' }}</span>
          <span v-if="editId && form.empNo" class="title-no">{{ form.empNo }}</span>
        </div>
        <div>
          <el-button size="small" @click="goBack">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" size="small">
        <div class="form-sec">基本信息</div>
        <el-row :gutter="16">
          <el-col :md="8" :sm="12" :xs="24">
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
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="姓名" prop="empName">
              <el-input v-model="form.empName" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="厂区" prop="plantCode">
              <el-select v-model="form.plantCode" placeholder="请选择" style="width: 100%">
                <el-option v-for="o in EMP_PLANT_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <div class="code-hint">编号第 1-2 位；跨厂区调动改这里，<b>编号不变</b></div>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="性别" prop="gender">
              <el-radio-group v-model="form.gender">
                <el-radio :value="1">男</el-radio>
                <el-radio :value="2">女</el-radio>
                <el-radio :value="0">未知</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="身份证">
              <el-input v-model="form.idCard" maxlength="18" placeholder="选填，可带出生日" @blur="onIdCardBlur" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="出生日期">
              <el-date-picker v-model="form.birthDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="联系方式">
              <el-input v-model="form.phone" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="籍贯">
              <el-input v-model="form.nativePlace" placeholder="如：广东东莞" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="民族">
              <el-input v-model="form.ethnicity" placeholder="如：汉族" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="婚姻状况">
              <el-select v-model="form.maritalStatus" clearable style="width: 100%">
                <el-option v-for="o in maritalOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="政治面貌">
              <el-select v-model="form.politicalStatus" clearable style="width: 100%">
                <el-option v-for="o in politicalOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="16" :sm="24" :xs="24">
            <el-form-item label="住址">
              <el-input v-model="form.address" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="紧急联系人">
              <el-input v-model="form.emergencyContact" placeholder="如：张三 138xxxx" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-sec">教育背景</div>
        <el-row :gutter="16">
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="学历">
              <el-select v-model="form.education" clearable style="width: 100%">
                <el-option v-for="o in educationOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="学历类型">
              <el-select v-model="form.educationType" clearable placeholder="选填" style="width: 100%">
                <el-option v-for="o in EDUCATION_TYPE" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="专业">
              <el-input v-model="form.major" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="毕业时间">
              <el-date-picker
                v-model="form.graduateDate" type="month" value-format="YYYY-MM-DD"
                placeholder="选择年月" style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :md="16" :sm="24" :xs="24">
            <el-form-item label="毕业院校">
              <el-input v-model="form.graduateSchool" placeholder="最终毕业院校" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-sec">用工属性</div>
        <el-row :gutter="16">
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="用工属性" prop="empType">
              <el-select v-model="form.empType" style="width: 100%">
                <el-option v-for="o in empTypeOpts" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="在职状态" prop="jobStatus">
              <el-radio-group v-model="form.jobStatus">
                <el-radio v-for="o in JOB_STATUS" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="入职日期" prop="hireDate">
              <el-date-picker v-model="form.hireDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              <div class="code-hint">决定编号第 3-4 位年份标识</div>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="试用期(月)">
              <el-input-number v-model="form.probationMonths" :min="0" :max="36" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="合同到期日">
              <el-date-picker v-model="form.contractEndDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="档案状态">
              <el-switch
                v-model="form.status" :active-value="1" :inactive-value="0"
                active-text="启用" inactive-text="停用"
                :disabled="form.jobStatus === JOB_STATUS_VALUE.LEFT"
              />
            </el-form-item>
          </el-col>
          <template v-if="form.jobStatus === JOB_STATUS_VALUE.LEFT">
            <el-col :md="8" :sm="12" :xs="24">
              <el-form-item label="离职日期" prop="leaveDate">
                <el-date-picker v-model="form.leaveDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :md="16" :sm="24" :xs="24">
              <el-form-item label="离职原因">
                <el-input v-model="form.leaveReason" />
              </el-form-item>
            </el-col>
          </template>
        </el-row>

        <div class="form-sec">车间属性</div>
        <el-row :gutter="16">
          <el-col :md="8" :sm="12" :xs="24">
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
                @change="onDeptChange"
              />
              <div class="code-hint">
                括号里是<b>人事编码</b>（编号第 5-7 位）；没有编码的部门无法生成员工编号，
                需先到「基础数据 → 部门信息」配置
              </div>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="岗位">
              <el-select v-model="form.positionId" clearable filterable placeholder="选自岗位管理" style="width: 100%">
                <el-option
                  v-for="o in positionOpts"
                  :key="o.id"
                  :label="o.deptId ? o.positionName : `${o.positionName}（通用）`"
                  :value="o.id"
                />
              </el-select>
              <div class="code-hint">
                <el-checkbox v-model="showAllPositions" size="small" @change="loadPositions">
                  显示全部岗位
                </el-checkbox>
                <span v-if="!showAllPositions && form.deptId">（当前只列本部门岗位 + 通用岗位）</span>
              </div>
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
            <el-form-item label="班组">
              <el-input v-model="form.teamGroup" placeholder="自由填写" />
            </el-form-item>
          </el-col>
          <el-col :md="8" :sm="12" :xs="24">
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
          <el-col :md="16" :sm="24" :xs="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Back } from '@element-plus/icons-vue';
import {
  getEmployee,
  getEmployeeList,
  createEmployee,
  updateEmployee,
  type EmployeeRow,
} from '@/api/employee';
import { getPositionOptions, type PositionOption } from '@/api/position';
import { getDeptTree, type DeptNode } from '@/api/system';
import {
  JOB_STATUS,
  JOB_STATUS_VALUE,
  ENABLE_STATUS_VALUE,
  EDUCATION_TYPE,
  EMP_PLANT_OPTIONS,
  empCodePreview,
  empCodePrefix,
  needsEmpNoReissue,
  birthDateFromIdCard,
} from '@/constants/dict';
import { loadDict } from '@/composables/useDict';

const route = useRoute();
const router = useRouter();

const editId = ref<number | null>(route.query.id ? Number(route.query.id) : null);
const loading = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();

/** 编辑时的原始档案：换发编号要拿它比对用工属性是否变化 */
const original = ref<EmployeeRow | null>(null);

const empTypeOpts = ref<Array<{ label: string; value: string }>>([]);
const maritalOpts = ref<Array<{ label: string; value: string }>>([]);
const politicalOpts = ref<Array<{ label: string; value: string }>>([]);
const educationOpts = ref<Array<{ label: string; value: string }>>([]);
const deptTree = ref<DeptNode[]>([]);
const positionOpts = ref<PositionOption[]>([]);
const supervisorOpts = ref<Array<{ id: number; empNo: string; empName: string }>>([]);
/** 部门下岗位太少时的兜底开关：勾上就不按部门过滤 */
const showAllPositions = ref(false);

const mapDict = (rows: any[]) => rows.map((r) => ({ label: r.dictLabel, value: r.dictValue }));
loadDict('emp_type').then((rows: any[]) => { empTypeOpts.value = mapDict(rows); });
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
  positionId: undefined as number | undefined,
  supervisorId: undefined as number | undefined,
  status: ENABLE_STATUS_VALUE.ENABLED as number,
  remark: '',
});
const form = reactive(emptyForm());

const rules = computed<FormRules>(() => ({
  // 员工编号由服务端生成，不校验；厂区/入职日期/部门是生成编号的三项前置信息
  plantCode: [{ required: true, message: '请选择厂区（员工编号第 1-2 位）', trigger: 'change' }],
  hireDate: [{ required: true, message: '请填写入职日期（决定编号第 3-4 位年份标识）', trigger: 'change' }],
  deptId: [{ required: true, message: '请选择所属组织（员工编号第 5-7 位）', trigger: 'change' }],
  empName: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  gender: [{ required: true, message: '请选择性别', trigger: 'change' }],
  empType: [{ required: true, message: '请选择用工属性', trigger: 'change' }],
  jobStatus: [{ required: true, message: '请选择在职状态', trigger: 'change' }],
  leaveDate:
    form.jobStatus === JOB_STATUS_VALUE.LEFT
      ? [{ required: true, message: '离职须填写离职日期', trigger: 'change' }]
      : [],
}));

/** 新增时的编号预览：只展示能确定的前 7 位，流水号用 ??? 占位（服务端采番时才定） */
const codePreviewText = computed(() => {
  const prefix = empCodePreview({
    plantCode: form.plantCode,
    hireDate: form.hireDate,
    deptCode: form.deptId ? deptHrCodeMap.value.get(form.deptId) : '',
    empType: form.empType,
  });
  return prefix ? `${prefix}???` : '补全厂区 / 入职日期 / 部门后自动生成';
});

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

/** 岗位下拉：默认按所属部门过滤（含通用岗位），勾「显示全部」则不过滤 */
async function loadPositions() {
  const deptId = showAllPositions.value ? undefined : form.deptId;
  positionOpts.value = await getPositionOptions(deptId ? { deptId } : undefined);
}

/**
 * 换部门后，已选岗位若不在新范围内就**清空并提示**——
 * 静默留一个不属于该部门的岗位，事后没人看得出是怎么来的。
 */
async function onDeptChange() {
  await loadPositions();
  if (form.positionId && !positionOpts.value.some((p) => p.id === form.positionId)) {
    form.positionId = undefined;
    ElMessage.info('岗位不属于新部门，已清空，请重新选择');
  }
}

async function loadSupervisors() {
  const rows = (await getEmployeeList({ forSupervisor: true })) as any;
  supervisorOpts.value = Array.isArray(rows) ? rows : [];
}

async function init() {
  loading.value = true;
  try {
    await Promise.all([loadSupervisors(), loadPositions()]);
    if (!editId.value) return;
    const row = await getEmployee(editId.value);
    original.value = row;
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
      positionId: row.positionId ?? undefined,
      supervisorId: row.supervisorId ?? undefined,
      status: row.status,
      remark: row.remark || '',
    });
    // 按该员工的部门重取岗位选项，否则编辑时下拉里可能没有他当前的岗位
    await loadPositions();
    if (form.positionId && !positionOpts.value.some((p) => p.id === form.positionId)) {
      // 现岗位不在本部门范围内（借调/历史遗留）：自动放开过滤，别把人家的岗位弄丢
      showAllPositions.value = true;
      await loadPositions();
    }
  } finally {
    loading.value = false;
  }
}
init();

function goBack() {
  router.push('/hr/employee');
}

async function onSave() {
  await formRef.value?.validate();

  /**
   * 换发编号（规则五）：用工属性变更导致编号前缀应当变化时
   * （实习生 S / 临时工 L / 学徒 A / 派遣工 P ↔ 正式工无前缀），
   * 按规则应注销原编号、重新核发。**必须先问过用户**——编号是对外标识，
   * 悄悄换掉会让工牌、考勤、薪资对不上账。用户选「保留」就沿用原编号。
   */
  let regenerateEmpNo = false;
  const orig = original.value;
  if (orig && needsEmpNoReissue(orig.empType, form.empType)) {
    const newPrefix = empCodePrefix(form.empType);
    const labelOfType = (v: string) => empTypeOpts.value.find((o) => o.value === v)?.label || v;
    try {
      await ElMessageBox.confirm(
        `「${form.empName}」由${labelOfType(orig.empType)}转为${labelOfType(form.empType)}，`
          + `按编码规则应换发${newPrefix ? `「${newPrefix} + 10 位数字」的编号` : '10 位纯数字正式员工编号'}`
          + `（现编号 ${orig.empNo}）。换发后原编号注销封存、归档留存，不再启用。`,
        '用工属性变更：是否换发编号？',
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
      deptId: form.deptId ?? undefined,
      positionId: form.positionId ?? undefined,
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
    goBack();
  } finally {
    saving.value = false;
  }
}
</script>

<script lang="ts">
export default { name: 'EmployeeForm' };
</script>

<style scoped lang="scss">
.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.form-title {
  display: flex;
  align-items: center;
  gap: 12px;
  .title-text { font-size: 15px; font-weight: 600; }
  .title-no {
    font-size: 13px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    padding: 2px 8px;
    border-radius: 4px;
  }
}
.form-sec {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-left: 3px solid var(--el-color-primary);
  padding-left: 8px;
  margin: 8px 0 14px;
}
/** 编码规则相关字段的行内说明：告诉 HR 这一项决定编号的第几位 */
.code-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  b { color: var(--el-text-color-primary); }
}
</style>
