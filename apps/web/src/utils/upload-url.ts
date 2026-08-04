const UPLOADS_SEGMENT_RE = /(?:^|\/)uploads\/.*/i;

/** 部署子路径前缀（生产 /oms，开发为空走 Vite proxy），与 request.ts 的 baseURL 同源 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function normalizeUploadUrl(value: string | null | undefined): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;

  const normalized = raw.replace(/\\/g, '/');
  const uploadMatch = normalized.match(UPLOADS_SEGMENT_RE);

  if (uploadMatch) {
    return API_BASE + '/' + uploadMatch[0].replace(/^\/+/, '');
  }

  if (
    /^https?:\/\//i.test(normalized) ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:')
  ) {
    return normalized;
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
