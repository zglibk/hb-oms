/**
 * hb-oms 前台静态站构建脚本
 *
 * 输入：仓库根目录《订单跟踪系统(hb-oms)设计文档-V1.0.md》
 * 输出：../site/ 目录（可直接作为 Nginx 静态根部署）
 *   - index.html       前台首页（导航栏：首页 / 技术文档 / 后台管理占位）
 *   - design-doc.html  设计文档 HTML 版（同导航栏 + 侧栏目录，暂挂前台供评审）
 *
 * 用法：cd docs && npm install && npm run build
 */
import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_MD = join(ROOT, '订单跟踪系统(hb-oms)设计文档-V1.0.md');
const OUT_DIR = join(ROOT, 'site');

const md = readFileSync(SRC_MD, 'utf8');

/* ---------- markdown 渲染：标题带锚点 id、表格包滚动容器 ---------- */

const headings = []; // { id, level, text }
const usedIds = new Map();

function slugify(raw) {
  const base = raw
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .trim()
    .replace(/[\s/\\]+/g, '-')
    .replace(/[?？!！:：#（）()【】\[\]{}<>"'，,。.、]/g, '')
    .toLowerCase() || 'section';
  const n = usedIds.get(base) ?? 0;
  usedIds.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

marked.use({
  renderer: {
    heading(text, level, raw) {
      const id = slugify(String(raw ?? text));
      if (level === 2 || level === 3) headings.push({ id, level, text });
      return `<h${level} id="${id}">${text}<a class="anchor" href="#${id}" aria-hidden="true">#</a></h${level}>\n`;
    },
    table(header, body) {
      return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`;
    },
  },
});

const docBody = marked.parse(md);
const docTitle = (md.match(/^#\s+(.+)$/m) ?? [, '设计文档'])[1].replace(/[*`]/g, '');

const tocHtml = headings
  .map(h => `<a class="toc-l${h.level}" href="#${h.id}">${h.text.replace(/<[^>]+>/g, '')}</a>`)
  .join('\n        ');

/* ---------- 公共壳：导航栏 + 样式 ---------- */

const NAV = (active) => `
  <header class="nav">
    <div class="nav-inner">
      <div class="brand"><span class="brand-mark">HB</span> 海宝五金 · 订单跟踪系统 <span class="brand-sub">hb-oms</span></div>
      <nav>
        <a href="index.html" class="${active === 'home' ? 'active' : ''}">首页</a>
        <a href="design-doc.html" class="${active === 'doc' ? 'active' : ''}">技术文档</a>
        <a class="disabled" title="建设中，敬请期待">后台管理</a>
      </nav>
    </div>
  </header>`;

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  :root {
    --brand: #1f5aa8; --brand-dark: #16406f; --bg: #f5f7fa; --card: #fff;
    --text: #24292f; --muted: #6b7280; --line: #e5e8ee; --code-bg: #f0f2f6;
  }
  html { scroll-behavior: smooth; scroll-padding-top: 68px; }
  body { font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; background: var(--bg); color: var(--text); line-height: 1.75; }
  .nav { position: sticky; top: 0; z-index: 50; background: var(--brand); color: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.18); }
  .nav-inner { max-width: 1580px; margin: 0 auto; padding: 0 20px; height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .brand { font-weight: 600; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .brand-mark { display: inline-block; background: #fff; color: var(--brand); font-weight: 800; border-radius: 6px; padding: 1px 7px; margin-right: 8px; font-size: 14px; }
  .brand-sub { opacity: .72; font-size: 13px; margin-left: 6px; font-weight: 400; }
  .nav nav { display: flex; gap: 4px; }
  .nav nav a { color: #fff; text-decoration: none; padding: 6px 14px; border-radius: 6px; font-size: 15px; white-space: nowrap; }
  .nav nav a:hover { background: rgba(255,255,255,.16); }
  .nav nav a.active { background: rgba(255,255,255,.24); font-weight: 600; }
  .nav nav a.disabled { opacity: .55; cursor: not-allowed; }
  footer { text-align: center; color: var(--muted); font-size: 13px; padding: 28px 16px 36px; }
`;

/* ---------- 页面一：前台首页 ---------- */

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>海宝五金 · 订单跟踪系统</title>
<style>
${BASE_CSS}
  .hero { background: linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%); color: #fff; padding: 64px 20px 72px; text-align: center; }
  .hero h1 { font-size: 30px; letter-spacing: 1px; }
  .hero p { margin-top: 12px; opacity: .88; font-size: 16px; }
  .hero .cta { display: inline-block; margin-top: 26px; background: #fff; color: var(--brand); font-weight: 600; text-decoration: none; padding: 10px 26px; border-radius: 8px; }
  .hero .cta:hover { opacity: .92; }
  main { max-width: 1580px; margin: -34px auto 0; padding: 0 20px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 20px 22px; box-shadow: 0 2px 10px rgba(31,90,168,.06); }
  .card h3 { font-size: 16px; color: var(--brand); margin-bottom: 8px; }
  .card p { font-size: 14px; color: var(--muted); }
  .flow { background: var(--card); border: 1px solid var(--line); border-radius: 10px; margin-top: 16px; padding: 22px; }
  .flow h3 { font-size: 16px; color: var(--brand); margin-bottom: 14px; }
  .steps { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 14px; }
  .step { background: #eef3fa; border: 1px solid #d7e3f2; color: var(--brand-dark); padding: 6px 14px; border-radius: 999px; white-space: nowrap; }
  .step.opt { border-style: dashed; color: var(--muted); }
  .arrow { color: #9db4d0; }
  .notice { margin-top: 16px; background: #fff8e6; border: 1px solid #f2dfa8; border-radius: 10px; padding: 14px 18px; font-size: 14px; color: #7a5b00; }
</style>
</head>
<body>
${NAV('home')}
<div class="hero">
  <h1>海宝五金订单跟踪系统</h1>
  <p>接单 → 外发 → 回货 → 入库 → 出库 · 订单数 / 完成数 / 库存数 / 欠数 一目了然</p>
  <a class="cta" href="design-doc.html">查看设计文档（评审版）</a>
</div>
<main>
  <div class="cards">
    <div class="card"><h3>订单数</h3><p>客户订购数量，统一折算为「支」；套/支自动换算，1 套 = 2 支。</p></div>
    <div class="card"><h3>完成数</h3><p>累计成品入库数量，生产欠数 = 订单数 − 完成数。</p></div>
    <div class="card"><h3>库存数</h3><p>当前成品结存，按订单产品行（卡口分左右）实时聚合。</p></div>
    <div class="card"><h3>欠数</h3><p>双口径并列：生产欠数（还差多少没做完）与发货欠数（还欠客户多少货）。</p></div>
  </div>
  <div class="flow">
    <h3>业务主线</h3>
    <div class="steps">
      <span class="step">客户下单</span><span class="arrow">→</span>
      <span class="step">创建订单</span><span class="arrow">→</span>
      <span class="step opt">部件外发（可选）</span><span class="arrow">→</span>
      <span class="step opt">外发回货（可选）</span><span class="arrow">→</span>
      <span class="step">成品入库</span><span class="arrow">→</span>
      <span class="step">成品出库</span>
    </div>
  </div>
  <div class="notice">📌 系统建设中：当前阶段为<strong>设计评审</strong>，请相关人员通过导航栏「技术文档」查阅《设计文档 V1.0》并反馈意见；后台管理功能将在评审通过后按里程碑逐步上线。</div>
</main>
<footer>海宝五金 · hb-oms 订单跟踪系统 · 内部系统</footer>
</body>
</html>
`;

/* ---------- 页面二：设计文档 ---------- */

const docHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${docTitle}</title>
<style>
${BASE_CSS}
  .layout { max-width: 1580px; margin: 0 auto; display: flex; align-items: flex-start; gap: 0; }
  aside { position: sticky; top: 56px; width: 300px; flex: none; max-height: calc(100vh - 56px); overflow-y: auto; padding: 20px 8px 40px 20px; font-size: 13.5px; }
  aside .toc-title { font-weight: 700; color: var(--muted); font-size: 12px; letter-spacing: 1px; margin-bottom: 8px; }
  aside a { display: block; color: var(--text); text-decoration: none; padding: 4px 10px; border-left: 2px solid transparent; border-radius: 0 6px 6px 0; line-height: 1.5; margin: 2px 0; }
  aside a:hover { background: #e9eef6; }
  aside a.toc-l3 { padding-left: 26px; color: var(--muted); }
  article { flex: 1; min-width: 0; background: var(--card); border-left: 1px solid var(--line); border-right: 1px solid var(--line); padding: 36px 44px 64px; }
  article h1 { font-size: 26px; border-bottom: 2px solid var(--brand); padding-bottom: 12px; margin-bottom: 18px; }
  article h2 { font-size: 21px; margin: 38px 0 14px; padding-top: 10px; border-top: 1px solid var(--line); color: var(--brand-dark); }
  article h3 { font-size: 17px; margin: 26px 0 10px; }
  article h4 { font-size: 15px; margin: 20px 0 8px; }
  article p { margin: 10px 0; }
  article ul, article ol { padding-left: 26px; margin: 10px 0; }
  article li { margin: 4px 0; }
  article blockquote { border-left: 4px solid var(--brand); background: #f2f6fb; padding: 10px 16px; margin: 14px 0; border-radius: 0 8px 8px 0; color: #3d4a5c; }
  article blockquote p { margin: 4px 0; }
  .anchor { visibility: hidden; margin-left: 8px; color: #9db4d0; text-decoration: none; font-size: .85em; }
  h1:hover .anchor, h2:hover .anchor, h3:hover .anchor, h4:hover .anchor { visibility: visible; }
  .table-wrap { overflow-x: auto; margin: 14px 0; border: 1px solid var(--line); border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  th, td { border: 1px solid var(--line); padding: 7px 12px; text-align: left; vertical-align: top; }
  th { background: #eef3fa; color: var(--brand-dark); white-space: nowrap; }
  tr:nth-child(even) td { background: #fafbfd; }
  code { background: var(--code-bg); border-radius: 4px; padding: 1px 6px; font-size: .9em; font-family: Consolas, "Courier New", monospace; }
  pre { background: #20293a; color: #dbe4f3; padding: 16px 18px; border-radius: 8px; overflow-x: auto; margin: 14px 0; line-height: 1.55; }
  pre code { background: none; padding: 0; color: inherit; font-size: 13px; }
  hr { border: none; border-top: 1px solid var(--line); margin: 30px 0; }
  @media (max-width: 900px) { aside { display: none; } article { border: none; padding: 24px 18px 48px; } }
  @media print { .nav, aside { display: none; } body { background: #fff; } article { border: none; padding: 0; } pre { white-space: pre-wrap; } }
</style>
</head>
<body>
${NAV('doc')}
<div class="layout">
  <aside>
    <div class="toc-title">目录</div>
        ${tocHtml}
  </aside>
  <article>
${docBody}
  </article>
</div>
<footer>本页面由《订单跟踪系统(hb-oms)设计文档-V1.0.md》自动生成 · 修改请改 md 源文件后执行 docs 目录 npm run build</footer>
</body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'index.html'), indexHtml);
writeFileSync(join(OUT_DIR, 'design-doc.html'), docHtml);
console.log(`✔ 已生成 site/index.html、site/design-doc.html（目录 ${headings.length} 项）`);
