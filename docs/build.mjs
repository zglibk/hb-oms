/**
 * hb-oms 前台静态站构建脚本
 *
 * 输入：仓库根目录《订单跟踪系统(hb-oms)设计文档-V1.0.md》
 * 输出：../site/ 目录（可直接作为 Nginx 静态根部署）
 *   - index.html       前台首页（欢迎文案 + 系统主要功能介绍；无需登录）
 *   - design-doc.html  设计文档 HTML 版（侧栏目录；评审期产物，不再从首页导航栏挂出，
 *                      仍随站点部署，直接访问 /oms/design-doc.html 可看）
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
        ${/* 技术文档只在文档页自身导航栏出现：首页面向业务人员，不外挂内部设计文档 */ ''}
        ${active === 'doc' ? '<a href="design-doc.html" class="active">技术文档</a>' : ''}
        <a href="admin/" title="登录后台管理系统">后台管理</a>
      </nav>
    </div>
  </header>`;

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  :root {
    /* 与后台默认「主题绿」对齐 */
    --brand: #13A67D; --brand-dark: #0B7A5C; --brand-soft: #E8F7F2;
    --bg: #f4f6f5; --card: #fff;
    --text: #1f2933; --muted: #6b7280; --line: #e2e8e6; --code-bg: #f0f4f2;
    --shadow: 0 1px 2px rgba(15, 40, 32, .04), 0 8px 24px rgba(15, 40, 32, .05);
  }
  html { scroll-behavior: smooth; scroll-padding-top: 64px; }
  body {
    font-family: "Segoe UI Variable", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }
  .nav {
    position: sticky; top: 0; z-index: 50;
    background: rgba(11, 122, 92, .96);
    backdrop-filter: saturate(1.2) blur(8px);
    color: #fff;
    border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .nav-inner {
    max-width: 1120px; margin: 0 auto; padding: 0 24px; height: 56px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .brand { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .brand-mark {
    display: inline-grid; place-items: center;
    min-width: 32px; height: 26px; padding: 0 7px; margin-right: 8px;
    background: #fff; color: var(--brand-dark); font-weight: 800; border-radius: 6px; font-size: 12px; letter-spacing: .04em;
  }
  .brand-sub { opacity: .7; font-size: 12px; margin-left: 6px; font-weight: 400; }
  .nav nav { display: flex; gap: 4px; }
  .nav nav a {
    color: #fff; text-decoration: none; padding: 6px 12px; border-radius: 6px;
    font-size: 14px; white-space: nowrap; transition: background .15s ease;
  }
  .nav nav a:hover { background: rgba(255,255,255,.14); }
  .nav nav a.active { background: rgba(255,255,255,.22); font-weight: 600; }
  .nav nav a.disabled { opacity: .55; cursor: not-allowed; }
  footer { text-align: center; color: var(--muted); font-size: 13px; padding: 36px 16px 40px; }
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
  .hero {
    position: relative; overflow: hidden; color: #fff;
    background:
      radial-gradient(120% 80% at 12% 0%, rgba(255,255,255,.18) 0%, transparent 55%),
      radial-gradient(90% 70% at 100% 30%, rgba(0,0,0,.18) 0%, transparent 50%),
      linear-gradient(145deg, #16b289 0%, var(--brand) 42%, var(--brand-dark) 100%);
    padding: clamp(48px, 8vw, 88px) 24px clamp(56px, 9vw, 96px);
  }
  .hero::before {
    content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .22;
    background-image:
      linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: linear-gradient(180deg, #000 20%, transparent 95%);
  }
  .hero-inner {
    position: relative; max-width: 1120px; margin: 0 auto;
    display: grid; gap: 18px; justify-items: start;
    animation: rise .55s ease both;
  }
  .hero-brand {
    display: inline-flex; align-items: center; gap: 10px;
    font-size: clamp(28px, 4.5vw, 42px); font-weight: 800; letter-spacing: .04em; line-height: 1.1;
  }
  .hero-brand span {
    display: inline-grid; place-items: center;
    width: 1.15em; height: 1.15em; border-radius: 12px;
    background: #fff; color: var(--brand-dark); font-size: .55em; letter-spacing: 0;
  }
  .hero h1 {
    max-width: 16em; font-size: clamp(22px, 3.2vw, 30px); font-weight: 600;
    letter-spacing: .02em; line-height: 1.35;
  }
  .hero p {
    max-width: 36em; margin: 0; opacity: .9;
    font-size: clamp(14px, 1.5vw, 16px); line-height: 1.7;
  }
  .hero .cta {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 8px;
    background: #fff; color: var(--brand-dark); font-weight: 700; text-decoration: none;
    padding: 12px 22px; border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,.12);
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .hero .cta:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0,0,0,.16); }
  .hero .cta:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }

  main { max-width: 1120px; margin: 0 auto; padding: 28px 24px 8px; }
  .sec { margin-top: 36px; animation: rise .55s ease both; }
  .sec:nth-child(1) { animation-delay: .05s; }
  .sec:nth-child(2) { animation-delay: .12s; }
  .sec:nth-child(3) { animation-delay: .18s; }
  .sec > h2 {
    font-size: 16px; font-weight: 700; color: var(--text);
    margin: 0 0 14px; letter-spacing: .02em;
  }
  .sec > h2 small {
    display: block; margin-top: 4px; font-size: 13px; font-weight: 400;
    color: var(--muted); letter-spacing: 0;
  }

  .flow {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    padding: 18px 20px; background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    box-shadow: var(--shadow);
  }
  .step {
    background: var(--brand-soft); color: #065f46;
    border: 1px solid rgba(19,166,125,.35);
    padding: 8px 14px; border-radius: 999px; font-size: 13px; white-space: nowrap; font-weight: 600;
  }
  .step.opt { background: #fff; border: 1px dashed #9ca3af; color: #4b5563; font-weight: 500; }
  .arrow { color: #6b8f80; font-size: 13px; }
  .flow-note { width: 100%; margin-top: 4px; font-size: 13px; color: #4b5563; }

  .metrics {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
  }
  .metric {
    position: relative; padding: 18px 18px 16px;
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    border-top: 3px solid var(--brand);
  }
  .metric strong {
    display: block; font-size: 18px; color: var(--brand-dark); margin-bottom: 6px; letter-spacing: .02em;
  }
  .metric p { font-size: 13px; color: var(--muted); line-height: 1.6; }

  .feats {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
  }
  .feat {
    padding: 16px 18px 16px 16px;
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    border-left: 3px solid var(--brand);
    transition: border-color .15s ease, background .15s ease;
  }
  .feat:hover { background: #fbfdfc; border-color: rgba(19,166,125,.35); }
  .feat h3 { font-size: 15px; color: var(--text); margin-bottom: 6px; font-weight: 700; }
  .feat p { font-size: 13px; color: var(--muted); line-height: 1.65; }

  @keyframes rise {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 860px) {
    .metrics { grid-template-columns: repeat(2, 1fr); }
    .feats { grid-template-columns: 1fr; }
  }
  @media (max-width: 520px) {
    .nav-inner { padding: 0 16px; }
    main { padding: 20px 16px 8px; }
    .metrics { grid-template-columns: 1fr; }
    .hero-brand { font-size: 28px; }
  }
</style>
</head>
<body>
${NAV('home')}
<section class="hero">
  <div class="hero-inner">
    <div class="hero-brand"><span>HB</span>海宝 OMS</div>
    <h1>订单跟踪，四数一眼清</h1>
    <p>从客户下单到成品出货，全过程一条主线记录；订单数、完成数、库存数与欠数随时可查。</p>
    <a class="cta" href="admin/">进入后台管理 →</a>
  </div>
</section>
<main>
  <section class="sec">
    <h2>业务主线<small>外发与回货按需使用；无需表面处理的部件组可直达装配与入库</small></h2>
    <div class="flow">
      <span class="step">客户下单</span><span class="arrow">→</span>
      <span class="step">创建订单</span><span class="arrow">→</span>
      <span class="step opt">部件外发</span><span class="arrow">→</span>
      <span class="step opt">外发回货</span><span class="arrow">→</span>
      <span class="step">装配</span><span class="arrow">→</span>
      <span class="step">成品入库</span><span class="arrow">→</span>
      <span class="step">成品出库</span>
      <p class="flow-note">虚线步骤为可选环节。</p>
    </div>
  </section>

  <section class="sec">
    <h2>四个核心数字<small>全系统统一折算为「支」，1 套 = 2 支</small></h2>
    <div class="metrics">
      <div class="metric"><strong>订单数</strong><p>客户订购数量，套/支自动换算。</p></div>
      <div class="metric"><strong>完成数</strong><p>累计成品入库；生产欠数 = 订单数 − 完成数。</p></div>
      <div class="metric"><strong>库存数</strong><p>当前成品结存，按部件组（分左右）实时聚合。</p></div>
      <div class="metric"><strong>欠数</strong><p>双口径：生产欠数与发货欠数并列。</p></div>
    </div>
  </section>

  <section class="sec">
    <h2>主要功能<small>覆盖接单、外发、装配、出入库与基础资料</small></h2>
    <div class="feats">
      <div class="feat">
        <h3>订单跟踪台账</h3>
        <p>全系统落点。按订单 → 产品 → 部件组展开，实时给出四数；发货欠数清零后自动完结，再欠自动重开。</p>
      </div>
      <div class="feat">
        <h3>订单管理</h3>
        <p>订单 → 产品 → 部件组 → 部件四级录入；货号、规格、表面处理、交期一次登记，支持完结、重开与作废。</p>
      </div>
      <div class="feat">
        <h3>外发管理</h3>
        <p>发坯单、发出、分批回货、关闭或作废；可打印《电镀发外加工单》交供应商。</p>
      </div>
      <div class="feat">
        <h3>装配管理</h3>
        <p>按部件组分左右建装配批次，登记计划与实际完成；实际完成量即成品入库可用额度。</p>
      </div>
      <div class="feat">
        <h3>成品出入库</h3>
        <p>入库、出库、期初与红字冲销；入库受装配完成量约束，确认后只能冲销、不能改数。</p>
      </div>
      <div class="feat">
        <h3>成品库存 · 部件台账</h3>
        <p>成品按订单部件组结存；部件半成品按七维属性归集，不依赖订单。</p>
      </div>
      <div class="feat">
        <h3>期初录入</h3>
        <p>上线时把手工账搬进系统：成品可挂历史订单或按属性登记；部件期初按七维累加。</p>
      </div>
      <div class="feat">
        <h3>基础数据 · 系统管理</h3>
        <p>客户、部门、部件、开单与设备集中维护；用户/角色/菜单/字典/日志一体，支持数据范围。</p>
      </div>
    </div>
  </section>
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
  .layout { max-width: 1280px; margin: 0 auto; display: flex; align-items: flex-start; gap: 0; }
  aside { position: sticky; top: 56px; width: 280px; flex: none; max-height: calc(100vh - 56px); overflow-y: auto; padding: 20px 8px 40px 20px; font-size: 13.5px; }
  aside .toc-title { font-weight: 700; color: var(--muted); font-size: 12px; letter-spacing: 1px; margin-bottom: 8px; }
  aside a { display: block; color: var(--text); text-decoration: none; padding: 4px 10px; border-left: 2px solid transparent; border-radius: 0 6px 6px 0; line-height: 1.5; margin: 2px 0; }
  aside a:hover { background: var(--brand-soft); }
  aside a.toc-l3 { padding-left: 26px; color: var(--muted); }
  article { flex: 1; min-width: 0; background: var(--card); border-left: 1px solid var(--line); border-right: 1px solid var(--line); padding: 36px 44px 64px; }
  article h1 { font-size: 26px; border-bottom: 2px solid var(--brand); padding-bottom: 12px; margin-bottom: 18px; }
  article h2 { font-size: 21px; margin: 38px 0 14px; padding-top: 10px; border-top: 1px solid var(--line); color: var(--brand-dark); }
  article h3 { font-size: 17px; margin: 26px 0 10px; }
  article h4 { font-size: 15px; margin: 20px 0 8px; }
  article p { margin: 10px 0; }
  article ul, article ol { padding-left: 26px; margin: 10px 0; }
  article li { margin: 4px 0; }
  article blockquote { border-left: 4px solid var(--brand); background: var(--brand-soft); padding: 10px 16px; margin: 14px 0; border-radius: 0 8px 8px 0; color: #3d4a5c; }
  article blockquote p { margin: 4px 0; }
  .anchor { visibility: hidden; margin-left: 8px; color: #8fb9a8; text-decoration: none; font-size: .85em; }
  h1:hover .anchor, h2:hover .anchor, h3:hover .anchor, h4:hover .anchor { visibility: visible; }
  .table-wrap { overflow-x: auto; margin: 14px 0; border: 1px solid var(--line); border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  th, td { border: 1px solid var(--line); padding: 7px 12px; text-align: left; vertical-align: top; }
  th { background: var(--brand-soft); color: var(--brand-dark); white-space: nowrap; }
  tr:nth-child(even) td { background: #fafcfb; }
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
