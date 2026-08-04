import request from '@/utils/request';

export interface LoginParams {
  username: string;
  password: string;
  /** 滑块验证通过后的一次性凭证（/api/captcha/verify 返回） */
  captchaToken: string;
}

export interface MenuNode {
  id: number;
  name: string;
  path: string | null;
  component: string | null;
  icon: string | null;
  children: MenuNode[];
}

export interface UserInfo {
  id: number;
  username: string;
  realName: string;
  /** 性别：0未知 1男 2女 */
  gender: number;
  deptId: number | null;
  deptName: string | null;
  phone: string | null;
  remark: string | null;
  status: number;
  mustChangePwd: boolean;
  avatar: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  userInfo: UserInfo;
  roles: string[];
  roleNames: string[];
  permissions: string[];
  menus: MenuNode[];
}

export interface ProfileResult {
  userInfo: UserInfo;
  roles: string[];
  roleNames: string[];
  permissions: string[];
  menus: MenuNode[];
}

export interface UpdateProfileParams {
  realName: string;
  gender?: number;
  phone?: string;
  remark?: string;
  avatar?: string;
}

export const login = (data: LoginParams) =>
  request.post<any, LoginResult>('/api/auth/login', data);

export const logout = () => request.post('/api/auth/logout');

export const getProfile = () =>
  request.get<any, ProfileResult>('/api/auth/profile');

export const updateProfile = (data: UpdateProfileParams) =>
  request.put<any, ProfileResult>('/api/auth/profile', data);

export const changePassword = (data: {
  oldPassword: string;
  newPassword: string;
}) => request.post('/api/auth/change-password', data);
