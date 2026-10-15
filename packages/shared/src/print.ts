/** Windows 打印驱动中的纸张方向。 */
export type PrintDriverOrientation = 'portrait' | 'landscape';

export interface PrintPaperOrientationInput {
  widthMm: number;
  heightMm: number;
  /** 旧纸型没有该字段，按驱动进纸宽高自动推断。 */
  driverOrientation?: PrintDriverOrientation;
}

/**
 * 返回纸型要求的驱动方向。
 *
 * 旧配置以宽高推断，保证新增方向字段后无需重写历史发布版本也能正常使用。
 */
export function printDriverOrientationOf(paper: PrintPaperOrientationInput): PrintDriverOrientation {
  return paper.driverOrientation ?? (paper.widthMm >= paper.heightMm ? 'landscape' : 'portrait');
}

export function printDriverOrientationLabelOf(paper: PrintPaperOrientationInput): '横向' | '纵向' {
  return printDriverOrientationOf(paper) === 'landscape' ? '横向' : '纵向';
}

export function oppositePrintDriverOrientationLabelOf(paper: PrintPaperOrientationInput): '横向' | '纵向' {
  return printDriverOrientationOf(paper) === 'landscape' ? '纵向' : '横向';
}
