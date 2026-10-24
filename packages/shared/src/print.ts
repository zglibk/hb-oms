import { SURFACE_NONE } from './business-status';

/** 纸型「字体缩放」百分比。100 对应纸面组件默认字号（正文 12px）。改字号只调纸型，不要改组件。 */
export const PRINT_FONT_SCALE_MIN = 80;
export const PRINT_FONT_SCALE_MAX = 160;
export const PRINT_FONT_SCALE_DEFAULT = 100;

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

const textOf = (value: unknown): string => (value == null ? '' : String(value).trim());

/**
 * 纸面「表面处理」组合文本：表面处理与颜色都有值时输出「表面处理/颜色」，
 * 颜色为空时只输出表面处理；表面处理为空或为「无」时只输出颜色。
 *
 * `surfaceLabel` 由调用端提供，服务端与前端可各自复用已经加载的字典标签。
 */
export function formatSurfaceColorText(
  surfaceType: string | null | undefined,
  color: string | null | undefined,
  surfaceLabel: (value: string) => string,
): string {
  const rawSurface = textOf(surfaceType);
  const surface = rawSurface && rawSurface !== SURFACE_NONE
    ? textOf(surfaceLabel(rawSurface)) || rawSurface
    : '';
  return [surface, textOf(color)].filter(Boolean).join('/');
}
