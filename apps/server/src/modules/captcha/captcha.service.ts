import { Injectable, BadRequestException } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { CaptchaStoreService } from './captcha.store';
import { renderCaptchaImages } from './captcha-image.util';

/**
 * 滑块拼图验证码服务（hb-mes 适配版）
 *
 * 相对《登录安全验证码设计文档》的三处适配（评估结论落地）：
 * 1. 图片生成：使用服务端直接编码的 PNG 像素图，不在客户端资源中暴露缺口坐标。
 * 2. 状态存储：Redis GETDEL → CaptchaStoreService 内存原子消费
 *    —— 单进程等价实现，切 cluster 时随技术债清单切 Redis（文档 20.6）。
 * 3. 校验流程：原文档「verify 后登录接口二次校验坐标」存在逻辑缺陷
 *    （GETDEL 已删 key，二次校验必失败）→ 改为业界标准两段式：
 *    verify 校验坐标成功 → 签发一次性 verifyToken（60s）
 *    → 登录接口核销 verifyToken（同样原子消费，防重放）。
 *
 * PNG 仍可能被图像识别攻击，因此还需配合一次性消费、接口限流与账号锁定。
 */

/** 验证码配置 */
const WIDTH = 300; // 背景宽（px）
const HEIGHT = 150; // 背景高（px）
const PIECE = 50; // 滑块边长（px）
const TOLERANCE = 1; // 坐标容差（px）：仅覆盖显示缩放/取整误差
const CAPTCHA_TTL = 120; // 验证码有效期（秒）
const TOKEN_TTL = 60; // verifyToken 有效期（秒）

/** 存储键前缀：坐标 与 一次性凭证 分离 */
const KEY_POS = 'pos:';
const KEY_TOKEN = 'tok:';

@Injectable()
export class CaptchaService {
  constructor(private readonly store: CaptchaStoreService) {}

  // ────────────────────────────────────────────────────────────
  // 生成
  // ────────────────────────────────────────────────────────────

  /**
   * 生成滑块验证码
   * @returns captchaId + 背景/滑块 PNG dataURL + 尺寸信息
   */
  generate() {
    // gapX is the secret answer; gapY is public positioning data for the client.
    const gapX = randomInt(PIECE + 20, WIDTH - PIECE - 10);
    const gapY = randomInt(10, HEIGHT - PIECE - 10);
    const images = renderCaptchaImages(WIDTH, HEIGHT, PIECE, gapX, gapY);

    // Store the answer only on the server. The PNG payload contains no coordinate metadata.
    const captchaId = randomUUID();
    this.store.set(KEY_POS + captchaId, String(gapX), CAPTCHA_TTL);

    return {
      captchaId,
      ...images,
      width: WIDTH,
      height: HEIGHT,
      sliderSize: PIECE,
      gapY, // 滑块垂直位置由前端按 gapY 摆放（仅横向滑动）
    };
  }

  // ────────────────────────────────────────────────────────────
  // 校验（两段式）
  // ────────────────────────────────────────────────────────────

  /**
   * 第一段：校验滑动坐标（原子消费，验证码无论成败仅可用一次）
   * 成功签发一次性 verifyToken 供登录接口核销
   */
  verify(captchaId: string, slideX: number): { verifyToken: string; correctX: number } {
    const correct = this.store.consume(KEY_POS + captchaId);
    if (correct === null) {
      throw new BadRequestException('验证码已失效，请刷新重试');
    }
    const correctX = Number(correct);
    if (Math.abs(correctX - slideX) > TOLERANCE) {
      throw new BadRequestException('验证失败，请重试');
    }
    // 签发一次性凭证（60 秒内须完成登录）
    const verifyToken = randomUUID();
    this.store.set(KEY_TOKEN + verifyToken, '1', TOKEN_TTL);
    // 坐标已原子消费，仅用于前端成功态吸附到真实缺口，避免视觉上停在容差边缘。
    return { verifyToken, correctX };
  }

  /**
   * 第二段：登录接口核销 verifyToken（原子消费，防重放）
   * @throws BadRequestException 凭证缺失/过期/已使用
   */
  consumeVerifyToken(token: string | undefined): void {
    if (!token || this.store.consume(KEY_TOKEN + token) === null) {
      throw new BadRequestException('请先完成滑块验证');
    }
  }
}
