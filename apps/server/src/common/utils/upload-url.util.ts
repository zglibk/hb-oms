const UPLOADS_SEGMENT_RE = /(?:^|\/)uploads\/.*/i;

export function normalizeUploadUrl(value: string | null | undefined): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;

  const normalized = raw.replace(/\\/g, '/');
  const uploadMatch = normalized.match(UPLOADS_SEGMENT_RE);

  if (uploadMatch) {
    return '/' + uploadMatch[0].replace(/^\/+/, '');
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
