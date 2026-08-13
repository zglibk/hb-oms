import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';
import { PDFDocument, PDFName, PDFNull, PDFNumber } from 'pdf-lib';

/**
 * 打印页 → PDF 渲染服务（服务端出 PDF，前端一键下载，无需打印对话框）。
 *
 * ⚠️ **生产服务器内存紧张**（3.5G 总量，同机还跑着 MySQL / hb-mes / QMS / OnlyOffice，
 * 常态可用仅 1.3G 左右，CLAUDE.md §八 明确连 vite build 都会 OOM）。因此这里的
 * 三条内存纪律**不得删改**：
 *   1. **单例 + 懒启动 + 空闲自动关闭**：不导出时浏览器进程根本不存在（常态 0 占用），
 *      只在渲染那几秒占 ~250MB；`IDLE_CLOSE_MS` 无人使用即整个 close。
 *   2. **串行队列**：同一时刻只渲染一个页面。并发导出会线性放大内存，直接把整机拖垮。
 *   3. **超时强杀**：渲染卡住（如前端页面加载不出来）时必须放掉浏览器，否则进程常驻吃内存。
 *
 * 用 `puppeteer-core` 而不是 `puppeteer`：后者每次安装都会下载 ~300MB Chromium 进
 * node_modules，部署包和磁盘都吃不消。浏览器由**系统包**提供（服务器 apt 装 chromium，
 * 本机开发用已装的 Chrome），路径经 `PUPPETEER_EXECUTABLE_PATH` 指定或按下表探测。
 */

/** 空闲多久关掉浏览器（毫秒）——车间导出是零星操作，常驻毫无必要 */
const IDLE_CLOSE_MS = 60_000;
/** 单次渲染超时（毫秒）：含页面加载 + 接口取数 + 图片加载 */
const RENDER_TIMEOUT_MS = 40_000;

/** 常见 Chrome/Chromium 安装位置（Linux 生产 + Windows 本地开发） */
const EXECUTABLE_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

/**
 * 给 PDF 设「初始视图缩放 100%」。
 *
 * puppeteer 的 `page.pdf()` 没有这个选项——缩放属于**文档打开动作**（PDF 规范的
 * `/OpenAction`），要在生成后写进目录字典：`[页引用 /XYZ null null 1]`，
 * 其中 `/XYZ left top zoom` 的 zoom=1 即 100%，left/top 给 null 表示不改动位置。
 *
 * ⚠️ 各阅读器对 OpenAction 的尊重程度不同：Adobe Reader / 福昕会按 100% 打开；
 * Chrome 内置 PDF 查看器**会忽略**它、始终用自己的「适合页宽」。这是查看器行为，
 * 不是这里没写对——用 Adobe 打开或另存后打开即可验证。
 *
 * 处理失败不影响导出：直接回原始 PDF（缩放只是观感，丢了不该让整个导出失败）。
 */
async function withInitialZoom100(pdf: Buffer): Promise<Buffer> {
  try {
    const doc = await PDFDocument.load(pdf);
    const [first] = doc.getPages();
    if (!first) return pdf;
    doc.catalog.set(
      PDFName.of('OpenAction'),
      doc.context.obj([first.ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNumber.of(1)]),
    );
    return Buffer.from(await doc.save());
  } catch {
    return pdf;
  }
}

@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: Browser | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  /** 串行队列：后来的渲染排在前一个之后，永不并发 */
  private queue: Promise<unknown> = Promise.resolve();

  /** 浏览器可执行文件路径；找不到时给出可操作的中文提示（而非 puppeteer 的英文栈） */
  private executablePath(): string {
    const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
    if (fromEnv) {
      if (!existsSync(fromEnv)) {
        throw new InternalServerErrorException(
          `PUPPETEER_EXECUTABLE_PATH 指向的浏览器不存在：${fromEnv}`,
        );
      }
      return fromEnv;
    }
    const hit = EXECUTABLE_CANDIDATES.find((p) => existsSync(p));
    if (!hit) {
      throw new InternalServerErrorException(
        '服务器未安装 Chromium，无法生成 PDF。请在服务器执行 `apt-get install -y chromium`（或设置 PUPPETEER_EXECUTABLE_PATH 指向已装的 Chrome）',
      );
    }
    return hit;
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    this.browser = await puppeteer.launch({
      executablePath: this.executablePath(),
      headless: true,
      args: [
        // 生产以 root 跑 PM2，无沙箱是必需的
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // /dev/shm 常只有 64MB，不加这条渲染大页面会崩
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--mute-audio',
      ],
    });
    this.logger.log('PDF 渲染浏览器已启动');
    return this.browser;
  }

  /** 每次渲染后重置空闲计时；到点没有新任务就整个关掉，把内存还给系统 */
  private scheduleIdleClose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.closeBrowser('空闲超时');
    }, IDLE_CLOSE_MS);
    // 别让这个计时器拖住进程退出
    this.idleTimer.unref?.();
  }

  private async closeBrowser(reason: string) {
    const b = this.browser;
    this.browser = null;
    if (!b) return;
    try {
      await b.close();
      this.logger.log(`PDF 渲染浏览器已关闭（${reason}）`);
    } catch {
      // 关闭失败不影响业务，下次 ensureBrowser 会重新拉起
    }
  }

  /**
   * 渲染前端打印页为 A4 PDF。
   *
   * @param url   打印页完整地址（服务器内网可达，如 http://127.0.0.1/oms/admin/order/print?id=1）
   * @param token 调用者的 JWT——注入到页面 localStorage，让打印页内的接口请求带上登录态。
   *              **刻意不放 URL 查询串**：那样 token 会进 Nginx access log。
   */
  async renderPrintPage(url: string, token: string): Promise<Buffer> {
    // 串行：接到前一个任务的尾巴上，无论其成败
    const task = this.queue
      .catch(() => undefined)
      .then(() => this.doRender(url, token));
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async doRender(url: string, token: string): Promise<Buffer> {
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    try {
      page.setDefaultNavigationTimeout(RENDER_TIMEOUT_MS);
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      // 打印页是 A4 版式，视口给足宽度避免响应式样式介入
      await page.setViewport({ width: 1280, height: 1800 });

      // 页面脚本执行前塞入登录态（键名与前端 request.ts 的 TOKEN_KEY 一致）。
      // ⚠️ 下面几个回调运行在**浏览器**上下文，而后端 tsconfig 刻意不含 dom lib
      // （服务端本就没有 DOM，引入会让人误以为能用），故一律经 globalThis 取。
      await page.evaluateOnNewDocument((t: string) => {
        try {
          (globalThis as any).localStorage.setItem('hb_oms_token', t);
        } catch {
          /* 无痕/禁用存储时忽略，页面会跳登录、随后 waitForSelector 超时报错 */
        }
      }, token);

      await page.goto(url, { waitUntil: 'networkidle0' });
      // 打印纸出现即说明数据已渲染（未登录会跳登录页，这里会超时并抛错）
      await page.waitForSelector('.print-sheet', { timeout: RENDER_TIMEOUT_MS });
      // 富文本里的图片可能晚于 networkidle0 完成解码，再兜一道
      await page.evaluate(async () => {
        const imgs: any[] = Array.from((globalThis as any).document?.images ?? []);
        await Promise.all(
          imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((res) => {
            img.addEventListener('load', () => res(), { once: true });
            img.addEventListener('error', () => res(), { once: true });
          }))),
        );
      });

      const buf = await page.pdf({
        format: 'A4',
        printBackground: true,
        // 用打印页 @page 里的纸张与页边距，避免此处再定义一份、两边漂移
        preferCSSPageSize: true,
      });
      return withInitialZoom100(Buffer.from(buf));
    } finally {
      await page.close().catch(() => undefined);
      this.scheduleIdleClose();
    }
  }

  async onModuleDestroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    await this.closeBrowser('服务停止');
  }
}
