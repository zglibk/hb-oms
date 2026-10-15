import type { PrintProfileConfig } from '@/api/print-config';
import {
  oppositePrintDriverOrientationLabelOf,
  printDriverOrientationLabelOf,
  printDriverOrientationOf,
} from '@hb-oms/shared';
export {
  oppositePrintDriverOrientationLabelOf,
  printDriverOrientationLabelOf,
  printDriverOrientationOf,
};

export interface PrintPaperBody {
  widthMm: number;
  heightMm: number;
  offsetXmm: number;
  offsetYmm: number;
}

/** 识别尚未补齐成品纸面字段的旧版 9.5×5.5 连续纸配置。 */
function isLegacyContinuousPaper(paper: PrintProfileConfig['paper']) {
  return paper.widthMm >= 240 && paper.widthMm <= 242
    && paper.heightMm >= 139 && paper.heightMm <= 141;
}

/**
 * 返回去除针式连续纸左右打孔边后的成品纸面，以及它在驱动进纸页面中的居中偏移。
 * 旧配置没有 bodyWidthMm/bodyHeightMm 时仍按 218×140mm 回落，保证迁移前后预览一致。
 */
export function printPaperBodyOf(paper: PrintProfileConfig['paper']): PrintPaperBody {
  const legacyContinuous = isLegacyContinuousPaper(paper);
  const widthMm = paper.bodyWidthMm ?? (legacyContinuous ? 218 : paper.widthMm);
  const heightMm = paper.bodyHeightMm ?? (legacyContinuous ? 140 : paper.heightMm);
  return {
    widthMm,
    heightMm,
    offsetXmm: Math.max(0, (paper.widthMm - widthMm) / 2),
    offsetYmm: Math.max(0, (paper.heightMm - heightMm) / 2),
  };
}

/** 打印页顶部的驱动核对提示，避免尺寸正确但方向相反时整页旋转 90°。 */
export function printDriverTipOf(paper: PrintProfileConfig['paper']): string {
  const orientation = printDriverOrientationLabelOf(paper);
  const opposite = oppositePrintDriverOrientationLabelOf(paper);
  return `OMS 本次请求${orientation}；驱动纸型：${paper.driverFormName || '自定义纸型'}。请确认打印首选项也显示“${orientation}”；若仍为“${opposite}”，表示当前浏览器或驱动未采纳方向请求，整页会旋转 90°。打印时还需设置缩放 100%、边距“无”，并关闭页眉页脚。`;
}
