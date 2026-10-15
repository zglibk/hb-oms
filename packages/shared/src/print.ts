/** Windows 打印驱动中的纸张方向。 */
export type PrintDriverOrientation = 'portrait' | 'landscape';

export interface PrintPaperOrientationInput {
  widthMm: number;
  heightMm: number;
  driverFormName?: string;
  /** 旧纸型没有该字段，按驱动纸型名与进纸宽高推断。 */
  driverOrientation?: PrintDriverOrientation;
}

/**
 * Windows 内置标准纸型（A4/A5/Letter…）一律按竖长定义，打横版时驱动须选横向；
 * 自定义表单（如针式连续纸 241.3×140）按纸张实际走向定义宽高，驱动须选纵向，
 * 选横向会让整页旋转 90° 并缩小。
 */
const STANDARD_FORM_NAME = /^(A[3-6]|B[4-6]|Letter|Legal)\b/i;

/** 返回纸型要求的驱动方向；旧配置缺省时推断，无需重写历史发布版本。 */
export function printDriverOrientationOf(paper: PrintPaperOrientationInput): PrintDriverOrientation {
  if (paper.driverOrientation) return paper.driverOrientation;
  const standardForm = STANDARD_FORM_NAME.test(paper.driverFormName?.trim() ?? '');
  return standardForm && paper.widthMm > paper.heightMm ? 'landscape' : 'portrait';
}

export function printDriverOrientationLabelOf(paper: PrintPaperOrientationInput): '横向' | '纵向' {
  return printDriverOrientationOf(paper) === 'landscape' ? '横向' : '纵向';
}

export function oppositePrintDriverOrientationLabelOf(paper: PrintPaperOrientationInput): '横向' | '纵向' {
  return printDriverOrientationOf(paper) === 'landscape' ? '纵向' : '横向';
}
