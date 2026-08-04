/**
 * 文件真实类型嗅探与 SVG 净化（安全审查 P1：上传型同源存储 XSS）
 *
 * 问题背景：
 *   旧实现只信任客户端提交的 file.mimetype，并保留原始文件扩展名。攻击者可
 *   将 .html/.js 声明为 image/png 上传，或上传内嵌 <script> 的 SVG；由于
 *   uploads 目录与前端同源、且 token 存于 localStorage，浏览器直接访问该
 *   文件即可执行脚本并窃取令牌。
 *
 * 现方案：
 *   1. 一律按文件内容（魔数 / magic number）判定真实类型，客户端 MIME 仅作参考；
 *   2. 扩展名由服务端根据嗅探结果生成，不再采用 originalname 中的扩展名；
 *   3. SVG 具备脚本和外部资源能力，本服务不接收用户上传的 SVG。
 */

export type SniffedKind =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'ico'
  | 'pdf'
  | 'unknown';

export interface SniffResult {
  kind: SniffedKind;
  /** 服务端派生的安全扩展名，含前导点，如 '.png' */
  ext: string;
  /** 服务端判定的 MIME，落库与响应均以此为准 */
  mime: string;
  isImage: boolean;
  isPdf: boolean;
}

const KIND_META: Record<
  Exclude<SniffedKind, 'unknown'>,
  { ext: string; mime: string; isImage: boolean }
> = {
  jpeg: { ext: '.jpg', mime: 'image/jpeg', isImage: true },
  png: { ext: '.png', mime: 'image/png', isImage: true },
  webp: { ext: '.webp', mime: 'image/webp', isImage: true },
  gif: { ext: '.gif', mime: 'image/gif', isImage: true },
  ico: { ext: '.ico', mime: 'image/x-icon', isImage: true },
  pdf: { ext: '.pdf', mime: 'application/pdf', isImage: false },
};

/** 按魔数判定允许的二进制类型 */
function sniffBinary(buf: Buffer): SniffedKind {
  if (buf.length < 12) return 'unknown';

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }

  // GIF: 'GIF87a' | 'GIF89a'
  if (buf.subarray(0, 6).toString('latin1').match(/^GIF8[79]a$/)) return 'gif';

  // WEBP: 'RIFF' .... 'WEBP'
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }

  // ICO: 00 00 01 00
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return 'ico';
  }

  // PDF: '%PDF-'
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';

  return 'unknown';
}

/**
 * 嗅探文件真实类型。
 * @param buf 文件字节内容
 * @param declaredMime 客户端声明的 MIME（仅用于日志/参考，不参与放行判定）
 */
export function sniffFileType(buf: Buffer): SniffResult {
  const kind: SniffedKind = sniffBinary(buf);

  if (kind === 'unknown') {
    return {
      kind: 'unknown',
      ext: '',
      mime: 'application/octet-stream',
      isImage: false,
      isPdf: false,
    };
  }

  const meta = KIND_META[kind];
  return {
    kind,
    ext: meta.ext,
    mime: meta.mime,
    isImage: meta.isImage,
    isPdf: kind === 'pdf',
  };
}
