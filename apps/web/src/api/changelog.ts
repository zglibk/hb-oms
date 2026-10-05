import request from '@/utils/request';

export interface ChangelogItem {
  id: number;
  version: string;
  title: string | null;
  content: string[];
  releasedAt: string;
  category: string | null;
  sort: number;
  status: number;
}

export interface SaveChangelogPayload {
  version: string;
  title?: string | null;
  content: string[];
  releasedAt: string;
  category?: string | null;
  sort?: number;
  status?: number;
}

/** 前台展示：仅启用记录 */
export function getChangelogList() {
  return request.get<any, ChangelogItem[]>('/api/changelog');
}

/** 后台管理：全部记录 */
export function getChangelogListAll() {
  return request.get<any, ChangelogItem[]>('/api/changelog/all');
}

export function createChangelog(data: SaveChangelogPayload) {
  return request.post<any, ChangelogItem>('/api/changelog', data);
}

export function updateChangelog(id: number, data: SaveChangelogPayload) {
  return request.put<any, ChangelogItem>(`/api/changelog/${id}`, data);
}

export function deleteChangelog(id: number) {
  return request.delete<any, void>(`/api/changelog/${id}`);
}

/** 首页「系统更新」弹窗：本人未读的更新；latestId 关闭时回传登记已读 */
export function getUnseenChangelog() {
  return request.get<any, { list: ChangelogItem[]; latestId: number }>('/api/changelog/unseen');
}

export function markChangelogSeen(id: number) {
  return request.post<any, void>('/api/changelog/seen', { id });
}
