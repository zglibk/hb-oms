/**
 * 员工编码规则（《海宝五金员工编码管理规则》，行政人事部）。
 *
 * 10 位纯数字，全公司唯一、**终身固定不变**：
 *
 * ```
 *   01      26        009        018
 *   厂区(2) 年份标识(2) 部门编码(3) 部门流水号(3)
 * ```
 *
 * - 第 1-2 位 **厂区**：见 `EMP_PLANT_OPTIONS`；
 * - 第 3-4 位 **年份标识**：`EMP_CODE_YEAR_CUTOFF`（含）之后入职填公历年份后两位，
 *   之前的存量老员工统一填 `99`。**99 只是存量标识**，真实入职时间/工龄/年假一律
 *   以 `hire_date` 字段为准，不从编码反推；
 * - 第 5-7 位 **部门编码**：数据落在 `t_department.hr_code`（部门主数据里维护），
 *   不在本文件写死——部门是会增减的主数据，硬编码会和库里对不上；
 * - 第 8-10 位 **流水号**：在「厂区 + 年份标识 + 部门」这一组合内从 001 递增。
 *   新员工每年 1 月 1 日自然从 001 重来（年份标识变了 = 换了一个计数组合）。
 *
 * 非正式人员加字母前缀（`EMP_TYPE_CODE_PREFIX`），**试用转正后换发标准 10 位码**。
 *
 * 人事异动（调岗/升职/跨厂区调动）**不换号**；离职编号永久封存不再分配；
 * 离职返聘按返聘当下信息**生成全新编号**（即新建一条档案）。
 */

/** 纯数字部分的长度（不含非正式人员前缀） */
export const EMP_CODE_DIGITS = 10;

/** 厂区编码（第 1-2 位）。新增厂区须经人事/财务/生产三方评审后修订（规则附则） */
export const EMP_PLANT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '总厂（海宝五金本部）', value: '01' },
  { label: '一号分厂', value: '02' },
  { label: '二号分厂', value: '03' },
];

export const EMP_PLANT_CODES: string[] = EMP_PLANT_OPTIONS.map((o) => o.value);

export function empPlantLabel(code: string | null | undefined): string {
  return EMP_PLANT_OPTIONS.find((o) => o.value === code)?.label ?? '';
}

/** 年份标识位分界节点：该日（含）之后入职按年份编码，之前算存量老员工 */
export const EMP_CODE_YEAR_CUTOFF = '2026-01-01';

/** 存量老员工的年份标识位 */
export const EMP_LEGACY_YEAR_FLAG = '99';

/**
 * 由入职日期推年份标识位。
 * 入职日期为空时返回空串——调用方须先要求填写入职日期再生成编码
 * （没有入职日期就定不了这两位，不能瞎猜）。
 */
export function empYearFlag(hireDate: string | null | undefined): string {
  const d = (hireDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  if (d < EMP_CODE_YEAR_CUTOFF) return EMP_LEGACY_YEAR_FLAG;
  return d.slice(2, 4);
}

/**
 * 非正式用工的编码前缀（规则第五条）。
 *
 * 规则只点名了**实习生 S / 临时工 L** 两类，其余用工属性（正式工/派遣工/学徒）
 * 一律不加前缀、直接用 10 位码——**不要自行给未列出的类别发明前缀**，
 * 编码架构的变更须经人事/财务/生产三方评审（规则附则）。
 */
export const EMP_TYPE_CODE_PREFIX: Record<string, string> = {
  intern: 'S',
  temp: 'L',
};

/** 取用工属性对应的编码前缀；未列出的返回空串 */
export function empCodePrefix(empType: string | null | undefined): string {
  return EMP_TYPE_CODE_PREFIX[(empType ?? '').trim()] ?? '';
}

/** 该用工属性是否属于「带前缀的非正式人员」 */
export function isPrefixedEmpType(empType: string | null | undefined): boolean {
  return !!empCodePrefix(empType);
}

/**
 * 是否构成「试用转正」：由带前缀的非正式用工（实习生/临时工）转为不带前缀的用工属性。
 * 规则第五条要求此时**换发**标准 10 位正式编码，故这是唯一允许重新生成编号的场景。
 */
export function isConvertToFormal(
  oldEmpType: string | null | undefined,
  newEmpType: string | null | undefined,
): boolean {
  return isPrefixedEmpType(oldEmpType) && !isPrefixedEmpType(newEmpType);
}

/** 流水号位数与上限（001~999） */
export const EMP_SEQ_WIDTH = 3;
export const EMP_SEQ_MAX = 999;

/**
 * 拼装员工编号。各段须由调用方**先校验再传入**（本函数只负责拼，不做业务报错）：
 * plantCode/deptCode/yearFlag 定长数字串，seq 为 1~999。
 */
export function buildEmpNo(params: {
  plantCode: string;
  yearFlag: string;
  deptCode: string;
  seq: number;
  empType?: string | null;
}): string {
  const { plantCode, yearFlag, deptCode, seq, empType } = params;
  const digits = `${plantCode}${yearFlag}${deptCode}${String(seq).padStart(EMP_SEQ_WIDTH, '0')}`;
  return `${empCodePrefix(empType)}${digits}`;
}

/** 编码格式校验：可选 S/L 前缀 + 10 位数字 */
export const EMP_NO_PATTERN = /^[SL]?\d{10}$/;

export function isValidEmpNo(empNo: string | null | undefined): boolean {
  return EMP_NO_PATTERN.test((empNo ?? '').trim());
}

/**
 * 编码前 7 位（厂区+年份+部门），流水号未定时用于界面预览：`0126009` + `???`。
 * 任一段缺失即返回空串，界面据此显示「补全厂区/入职日期/部门后自动生成」。
 */
export function empCodePreview(params: {
  plantCode?: string | null;
  hireDate?: string | null;
  deptCode?: string | null;
  empType?: string | null;
}): string {
  const plant = (params.plantCode ?? '').trim();
  const dept = (params.deptCode ?? '').trim();
  const year = empYearFlag(params.hireDate);
  if (!plant || !dept || !year) return '';
  return `${empCodePrefix(params.empType)}${plant}${year}${dept}`;
}
