import { Request } from 'express';

/** 从请求 URL/body 推断业务对象类型与 ID */
export function extractBizFromRequest(req: Request): {
  bizType: string | null;
  bizId: number | null;
} {
  const path = (req.originalUrl || req.url || '').split('?')[0];

  const rules: { pattern: RegExp; type: string }[] = [
    { pattern: /\/api\/order\/(\d+)/, type: 'order' },
    { pattern: /\/api\/plan\/(\d+)/, type: 'plan' },
    { pattern: /\/api\/subcontract\/(\d+)/, type: 'subcontract' },
    { pattern: /\/api\/system\/material\/(\d+)/, type: 'material' },
    { pattern: /\/api\/system\/user\/(\d+)/, type: 'user' },
    { pattern: /\/api\/system\/role\/(\d+)/, type: 'role' },
    { pattern: /\/api\/system\/menu\/(\d+)/, type: 'menu' },
    { pattern: /\/api\/system\/dict\/(\d+)/, type: 'dict' },
    { pattern: /\/api\/system\/dept\/(\d+)/, type: 'dept' },
  ];

  for (const { pattern, type } of rules) {
    const m = path.match(pattern);
    if (m?.[1]) {
      const id = Number(m[1]);
      if (Number.isInteger(id) && id > 0) return { bizType: type, bizId: id };
    }
  }

  const body = req.body as Record<string, unknown> | undefined;
  const rawId = body?.id ?? body?.bizId;
  if (rawId != null && Number.isInteger(Number(rawId)) && Number(rawId) > 0) {
    const typeMap: Record<string, string> = {
      '/api/order': 'order',
      '/api/plan': 'plan',
      '/api/subcontract': 'subcontract',
      '/api/system/material': 'material',
    };
    for (const [prefixKey, bizType] of Object.entries(typeMap)) {
      if (path.startsWith(prefixKey)) {
        return { bizType, bizId: Number(rawId) };
      }
    }
  }

  return { bizType: null, bizId: null };
}

/** 构建带业务对象 ID 的操作描述 */
export function buildLogDescription(
  action: string,
  bizId: number | null,
): string {
  return bizId != null ? `${action} (#${bizId})` : action;
}

/** 序列化请求参数（脱敏 + multipart 摘要） */
export function serializeLogParams(req: Request): string {
  const SENSITIVE_KEYS = ['password', 'newPassword', 'oldPassword'];
  try {
    const body: Record<string, unknown> = { ...(req.body || {}) };
    for (const k of SENSITIVE_KEYS) {
      if (k in body) body[k] = '***';
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (file) {
      body._upload = {
        originalname: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      };
    }

    const str = JSON.stringify({ body, query: req.query });
    return str.length > 1000 ? str.slice(0, 1000) : str;
  } catch {
    return '';
  }
}

/** 从请求头解析客户端 IP */
export function extractClientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] as string) || '';
  return (
    xff.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    ''
  ).replace('::ffff:', '');
}
