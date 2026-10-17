/**
 * 通知公告 API E2E（要求本地服务已启动、测试库可写）。
 * 只清理本脚本创建并记录 ID 的数据，不碰其它公告。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JwtService } = require('@nestjs/jwt');
const mysql = require('mysql2/promise');

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8100/api';
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('请设置 JWT_SECRET（须与正在运行的服务一致）');

const db = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'haibao_oms',
});
const [users] = await db.query(
  "SELECT id, username FROM t_user WHERE username IN ('admin', 'sales01', 'follow01')",
);
const idOf = (username) => Number(users.find((u) => u.username === username)?.id || 0);
if (!idOf('admin') || !idOf('sales01') || !idOf('follow01')) throw new Error('缺少 E2E 所需种子账号');

const jwt = new JwtService();
const tokenOf = (username) => jwt.sign(
  { sub: idOf(username), username, jti: `announcement-e2e-${username}-${Date.now()}`, sessionIatMs: Date.now() },
  { secret, expiresIn: '20m' },
);
const tokens = {
  admin: tokenOf('admin'),
  sales: tokenOf('sales01'),
  follow: tokenOf('follow01'),
};
const createdIds = [];

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

async function api(path, { token = tokens.admin, method = 'GET', body, raw = false } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return response;
  const json = await response.json();
  if (!response.ok || json.code !== 0) throw new Error(`${method} ${path}: ${json.message || response.status}`);
  return json.data;
}

async function waitForAnnouncementEvent(token, timeoutMs = 10000) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/announcement/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abort.signal,
    });
    assert(response.ok && response.body, 'SSE 连接失败');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error('SSE 在公告事件前关闭');
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      if (frames.some((frame) => /^event:\s*announcement/m.test(frame))) return;
    }
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

const iso = (ms) => new Date(ms).toISOString();
async function createDraft(suffix, extra = {}) {
  const row = await api('/announcement/admin', {
    method: 'POST',
    body: {
      title: `公告E2E-${suffix}-${Date.now()}`,
      summary: `摘要-${suffix}`,
      content: `正文-${suffix}`,
      level: 'important',
      requiresReply: false,
      ...extra,
    },
  });
  createdIds.push(row.id);
  return row;
}

try {
  const forbidden = await fetch(`${base}/announcement/admin`, {
    headers: { Authorization: `Bearer ${tokens.sales}` },
  });
  assert(forbidden.status === 403, '普通用户不应读取管理列表');

  const normal = await createDraft('普通');
  assert(normal.expireAt, '未指定失效时间时应默认三天');
  const hours = (new Date(normal.expireAt).getTime() - new Date(normal.publishAt).getTime()) / 3600000;
  assert(Math.abs(hours - 72) < 0.02, '默认失效时间应为发布时间后 72 小时');
  const sseEvent = waitForAnnouncementEvent(tokens.sales);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const publishedNormal = await api(`/announcement/admin/${normal.id}/publish`, { method: 'POST', body: {} });
  await sseEvent;
  const normalPending = await api('/announcement/pending');
  assert(
    normalPending.list.some((r) => r.id === normal.id),
    `立即发布后应进入未读（publishAt=${publishedNormal.publishAt}，now=${new Date().toISOString()}，activatedAt=${publishedNormal.activatedAt || 'NULL'}，pending=${normalPending.list.length}）`,
  );
  await api(`/announcement/${normal.id}/view`, { method: 'POST' });
  // 模拟首次查看时姓名快照为空：后续再次打开也不得拿当前身份回填，快照必须保持“首次”语义。
  await db.query(
    'UPDATE t_announcement_recipient SET view_real_name = NULL WHERE announcement_id = ? AND user_id = ?',
    [normal.id, idOf('admin')],
  );
  await api(`/announcement/${normal.id}/view`, { method: 'POST' });
  assert(!(await api('/announcement/pending')).list.some((r) => r.id === normal.id), '普通公告查看后应完成');
  const [normalRecipient] = await db.query(
    'SELECT view_real_name AS viewRealName FROM t_announcement_recipient WHERE announcement_id = ? AND user_id = ?',
    [normal.id, idOf('admin')],
  );
  assert(normalRecipient[0]?.viewRealName === null, '重复查看不得补写或覆盖首次身份快照');
  assert((await api(`/announcement/admin/${normal.id}/view-records`)).length === 1, '首次查看记录必须唯一');

  const acked = await createDraft('批量确认');
  await api(`/announcement/admin/${acked.id}/publish`, { method: 'POST', body: {} });
  await api('/announcement/ack', { method: 'POST', body: { ids: [acked.id] } });
  assert(!(await api('/announcement/pending')).list.some((r) => r.id === acked.id), '弹窗批量确认应完成无需回复公告');
  assert((await api(`/announcement/admin/${acked.id}/view-records`)).length === 1, '批量确认应生成首次查看记录');

  const permanent = await createDraft('永久', { expireAt: null });
  assert(permanent.expireAt === null, '永久公告失效时间应为 NULL');
  await api(`/announcement/admin/${permanent.id}`, { method: 'DELETE' });
  createdIds.splice(createdIds.indexOf(permanent.id), 1);

  const scheduledAt = Date.now() + 5500;
  const scheduled = await createDraft('定时', {
    publishAt: iso(scheduledAt),
    expireAt: iso(scheduledAt + 86400000),
  });
  await api(`/announcement/admin/${scheduled.id}/publish`, { method: 'POST', body: {} });
  assert(!(await api('/announcement/pending', { token: tokens.sales })).list.some((r) => r.id === scheduled.id), '定时公告不应提前激活');
  assert(!(await api(`/announcement/${scheduled.id}`)).canReply, '尚未激活的定时公告不应显示回复入口');
  // 扫描间隔 5 秒；给“发布时间 5.5 秒后 + 最坏一个完整扫描周期”留足余量。
  await new Promise((resolve) => setTimeout(resolve, 12000));
  assert((await api('/announcement/pending', { token: tokens.sales })).list.some((r) => r.id === scheduled.id), '定时公告到点后应激活');

  const required = await createDraft('回复', { requiresReply: true, level: 'urgent' });
  await api(`/announcement/admin/${required.id}/publish`, { method: 'POST', body: {} });
  await api(`/announcement/${required.id}/view`, { token: tokens.sales, method: 'POST' });
  assert((await api('/announcement/pending', { token: tokens.sales })).list.some((r) => r.id === required.id), '要求回复公告查看后仍应待回复');
  await api(`/announcement/${required.id}/replies`, {
    token: tokens.sales,
    method: 'POST',
    body: { scope: 'private', content: '销售私密回复' },
  });
  await api(`/announcement/${required.id}/replies`, {
    token: tokens.follow,
    method: 'POST',
    body: { scope: 'public', content: '跟单公开回复' },
  });
  const followReplies = await api(`/announcement/${required.id}/replies`, { token: tokens.follow });
  assert(followReplies.list.length === 1 && followReplies.list[0].scope === 'public', '普通用户不得读取他人私密回复');
  const salesReplies = await api(`/announcement/${required.id}/replies`, { token: tokens.sales });
  assert(salesReplies.list.length === 2, '回复人应看到公开回复和自己的私密回复');
  const adminReplies = await api(`/announcement/${required.id}/replies`);
  assert(adminReplies.list.length === 2, '管理员应看到完整回复');
  const replyPage = await api(`/announcement/${required.id}/replies?page=1&pageSize=1`);
  assert(replyPage.total === 2 && replyPage.list.length === 1, '回复列表应按服务端分页返回总数与当前页');
  assert(replyPage.list[0].content === '跟单公开回复', '回复列表应按最新回复优先排序');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const [replyLogs] = await db.query(
    "SELECT params, biz_type AS bizType, biz_id AS bizId FROM t_operation_log WHERE action = '追加回复' AND biz_id = ? ORDER BY id DESC LIMIT 2",
    [required.id],
  );
  assert(replyLogs.length === 2, '追加回复应保留操作日志');
  assert(replyLogs.every((row) => row.bizType === 'announcement' && Number(row.bizId) === required.id), '回复日志应关联公告编号');
  assert(replyLogs.every((row) => String(row.params).includes('***') && !String(row.params).includes('销售私密回复') && !String(row.params).includes('跟单公开回复')), '回复正文必须从操作日志参数中脱敏');
  assert((await api(`/announcement/admin/${required.id}/replies/export-count`)) === 2, '回复导出预检数应正确');
  const exported = await api(`/announcement/admin/${required.id}/replies/export`, { raw: true });
  assert(exported.ok && exported.headers.get('content-type')?.includes('spreadsheetml'), '回复 Excel 导出失败');

  const expiredRequired = await createDraft('过期待回复', { requiresReply: true });
  await api(`/announcement/admin/${expiredRequired.id}/publish`, { method: 'POST', body: {} });
  await db.query('UPDATE t_announcement SET expire_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?', [expiredRequired.id]);
  assert((await api('/announcement/pending', { token: tokens.sales })).list.some((r) => r.id === expiredRequired.id), '要求回复公告过期后既有接收人仍应待回复');

  const expiredNormal = await createDraft('过期普通');
  await api(`/announcement/admin/${expiredNormal.id}/publish`, { method: 'POST', body: {} });
  await db.query('UPDATE t_announcement SET expire_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?', [expiredNormal.id]);
  assert(!(await api('/announcement/pending', { token: tokens.sales })).list.some((r) => r.id === expiredNormal.id), '普通公告过期后不应继续未读');

  await api(`/announcement/admin/${required.id}/withdraw`, { method: 'POST' });
  const hidden = await fetch(`${base}/announcement/${required.id}`, {
    headers: { Authorization: `Bearer ${tokens.sales}` },
  });
  assert(hidden.status === 404, '撤回公告应从普通用户入口隐藏');

  console.log('✓ 通知公告 API E2E 通过');
} finally {
  if (createdIds.length) {
    const placeholders = createdIds.map(() => '?').join(',');
    await db.query(
      `DELETE FROM t_operation_log WHERE biz_type = 'announcement' AND biz_id IN (${placeholders})`,
      createdIds,
    );
    await db.query(`DELETE FROM t_announcement_reply WHERE announcement_id IN (${placeholders})`, createdIds);
    await db.query(`DELETE FROM t_announcement_recipient WHERE announcement_id IN (${placeholders})`, createdIds);
    await db.query(`DELETE FROM t_announcement WHERE id IN (${placeholders})`, createdIds);
  }
  await db.end();
}
