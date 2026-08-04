import geometricBg from '@/assets/login-bg/geometric.svg';
import wavesBg from '@/assets/login-bg/waves.svg';
import particlesBg from '@/assets/login-bg/particles.svg';
import circuitBg from '@/assets/login-bg/circuit.svg';

/**
 * 登录背景方案类型：
 *   - 'system'：系统默认（由系统配置决定，可能为系统配置的图片或回退 CSS 默认装饰）
 *   - 'image'：预置 SVG 图片方案
 */
export type LoginBgType = 'system' | 'image';

export interface LoginBgScheme {
  id: string;
  name: string;
  type: LoginBgType;
  /** 图片方案：SVG 的资源 URL；系统默认方案：undefined（运行时由 store 决定） */
  image?: string;
  /** 缩略图（用于切换面板预览） */
  thumbnail: string;
}

/** 全部背景方案（1 套系统默认 + 4 套本地 SVG 图片） */
export const LOGIN_BG_SCHEMES: LoginBgScheme[] = [
  {
    id: 'system-default',
    name: '系统默认',
    type: 'system',
    thumbnail: 'linear-gradient(135deg, #f0f9f4 0%, #e6f7ef 50%, #d9f2e3 100%)',
  },
  {
    id: 'geometric',
    name: '几何金线',
    type: 'image',
    image: geometricBg,
    thumbnail: geometricBg,
  },
  {
    id: 'waves',
    name: '青波涟漪',
    type: 'image',
    image: wavesBg,
    thumbnail: wavesBg,
  },
  {
    id: 'particles',
    name: '星河粒子',
    type: 'image',
    image: particlesBg,
    thumbnail: particlesBg,
  },
  {
    id: 'circuit',
    name: '电路脉络',
    type: 'image',
    image: circuitBg,
    thumbnail: circuitBg,
  },
];

export const DEFAULT_LOGIN_BG = 'system-default';
export const LOGIN_BG_STORAGE_KEY = 'hb-mes-login-bg';

/** 按 id 查询方案；不存在时返回 undefined */
export function getLoginBgScheme(id: string): LoginBgScheme | undefined {
  return LOGIN_BG_SCHEMES.find((s) => s.id === id);
}
