import { Response } from 'express';

/**
 * xlsx 文件流响应头（各模块导出 / 模板下载共用）。
 *
 * 中文文件名走 `filename*=UTF-8''`：老式 `filename=` 只认 ASCII，中文名在部分浏览器
 * 会变成乱码或退化成 `download`，故两个都给——ASCII 兜底名 + RFC 5987 的中文名。
 *
 * 用在标了 `@SkipTransform()` 的接口上（返回原始文件流，不走统一响应包装）。
 */
export function sendXlsx(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}
