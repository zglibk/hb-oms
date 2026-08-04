import request from '@/utils/request';

/** 滑块验证码数据（GET /api/captcha/slider 返回） */
export interface SliderCaptchaData {
  captchaId: string;
  backgroundImage: string; // SVG dataURL
  sliderImage: string; // SVG dataURL
  width: number; // 背景原始宽（滑动坐标以此坐标系上报）
  height: number;
  sliderSize: number;
  gapY: number; // 滑块垂直位置
}

/** 滑块验证码校验结果（POST /api/captcha/verify 返回） */
export interface SliderCaptchaVerifyResult {
  verifyToken: string;
  correctX: number; // 原图坐标系中的真实缺口 X，用于成功态视觉吸附
}

/** 获取滑块验证码 */
export const getSliderCaptcha = () =>
  request.get<any, SliderCaptchaData>('/api/captcha/slider');

/** 校验滑动坐标，成功返回一次性登录凭证 */
export const verifySliderCaptcha = (captchaId: string, slideX: number) =>
  request.post<any, SliderCaptchaVerifyResult>('/api/captcha/verify', {
    captchaId,
    slideX,
  });
