import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { ElMessage } from 'element-plus';

/** 后端统一响应结构 */
export interface ApiResult<T = any> {
  code: number;
  message: string;
  data: T;
}

const TOKEN_KEY = 'hb_mes_token';
const REFRESH_KEY = 'hb_mes_refresh';
let memoryAccessToken = '';
let memoryRefreshToken = '';

function safeStorageGet(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 移动端隐私模式/内嵌浏览器可能禁用 localStorage，内存 token 仍可支撑当前会话。
  }
}

function safeStorageRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const tokenStore = {
  // 优先返回内存 token（最新值），避免 localStorage 写入失败时读到旧 token
  get: () => memoryAccessToken || safeStorageGet(TOKEN_KEY),
  getRefresh: () => memoryRefreshToken || safeStorageGet(REFRESH_KEY),
  set: (access: string, refresh: string) => {
    memoryAccessToken = access;
    memoryRefreshToken = refresh;
    safeStorageSet(TOKEN_KEY, access);
    safeStorageSet(REFRESH_KEY, refresh);
  },
  clear: () => {
    memoryAccessToken = '';
    memoryRefreshToken = '';
    safeStorageRemove(TOKEN_KEY);
    safeStorageRemove(REFRESH_KEY);
  },
};

// baseURL 留空走相对路径，开发由 Vite proxy、生产由 Nginx 路由（文档 1.8.5）
const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 30000,
});

service.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;

service.interceptors.response.use(
  (response) => {
    // 标记为原始响应（如文件下载 blob）：返回完整 AxiosResponse，供调用方读 headers/data
    if ((response.config as any)?.__raw) {
      return response;
    }
    const res = response.data as ApiResult;
    // 非包装响应（如 wangEditor）直接返回
    if (res == null || typeof res.code === 'undefined') {
      return response.data;
    }
    if (res.code === 0) {
      return res.data;
    }
    if (!(response.config as any)?.__silent) {
      ElMessage.error(res.message || '请求失败');
    }
    return Promise.reject(new Error(res.message || '请求失败'));
  },
  async (error) => {
    const { response, config } = error;
    const silent = Boolean(config?.__silent);
    if (response?.status === 401 && !config.__isRetry) {
      // 登录接口自身的 401（账号/密码错误、验证码失效等）属于业务错误，
      // 不应触发「登录失效」硬跳转，交由调用方 catch 处理并提示。
      if (config.url?.includes('/auth/login')) {
        const msg = response?.data?.message || '账号或密码错误';
        ElMessage.error(msg);
        return Promise.reject(new Error(msg));
      }
      // 尝试刷新 token
      const refresh = tokenStore.getRefresh();
      if (refresh && !config.url?.includes('/auth/refresh')) {
        return handleRefresh(config);
      }
      tokenStore.clear();
      ElMessage.error('登录已失效，请重新登录');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    // blob 请求出错时，错误响应体也是 Blob，需解析为文本再读 message
    if (
      response?.data instanceof Blob &&
      response.data.type?.includes('application/json')
    ) {
      try {
        const text = await response.data.text();
        const json = JSON.parse(text);
        const bmsg = json?.message || '请求失败';
        if (!silent) ElMessage.error(bmsg);
        return Promise.reject(new Error(bmsg));
      } catch {
        /* 解析失败走后续通用处理 */
      }
    }
    const msg =
      response?.data?.message || error.message || '网络异常，请稍后重试';
    if (!silent) ElMessage.error(msg);
    return Promise.reject(error);
  },
);

// 等待刷新的请求队列：每项含成功回调与失败回调，
// 刷新失败时必须 reject，否则排队的并发请求永久挂起（await 不 settle）。
let pendingResolvers: Array<{
  onSuccess: (token: string) => void;
  onFailure: (err: unknown) => void;
}> = [];

function flushPendingSuccess(token: string) {
  pendingResolvers.forEach((p) => p.onSuccess(token));
  pendingResolvers = [];
}
function flushPendingFailure(err: unknown) {
  pendingResolvers.forEach((p) => p.onFailure(err));
  pendingResolvers = [];
}

async function handleRefresh(config: AxiosRequestConfig & { __isRetry?: boolean }) {
  if (isRefreshing) {
    // 等待刷新完成后重发；刷新失败则一并拒绝，避免永久挂起
    return new Promise((resolve, reject) => {
      pendingResolvers.push({
        onSuccess: (token: string) => {
          config.headers = config.headers || {};
          (config.headers as any).Authorization = `Bearer ${token}`;
          config.__isRetry = true;
          resolve(service(config));
        },
        onFailure: (err: unknown) => reject(err),
      });
    });
  }
  isRefreshing = true;
  try {
    const data: any = await service.post('/api/auth/refresh', {
      refreshToken: tokenStore.getRefresh(),
    });
    tokenStore.set(data.accessToken, data.refreshToken);
    flushPendingSuccess(data.accessToken);
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${data.accessToken}`;
    config.__isRetry = true;
    return service(config);
  } catch (e) {
    // 关键：先拒绝所有排队请求，再跳转登录。跳转是异步的，若不主动
    // settle，排队请求的 await 会永久挂起、loading 卡死。
    flushPendingFailure(e);
    tokenStore.clear();
    window.location.href = '/login';
    return Promise.reject(e);
  } finally {
    isRefreshing = false;
  }
}

export default service;
