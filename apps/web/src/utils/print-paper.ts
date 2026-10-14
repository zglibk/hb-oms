import type { PrintProfileConfig } from '@/api/print-config';

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
