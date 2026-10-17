import request from '@/utils/request';
import { downloadXlsx } from '@/utils/download';

export interface AnnouncementItem {
  id: number;
  title: string;
  summary: string;
  content?: string;
  level: 'normal' | 'important' | 'urgent';
  levelLabel?: string;
  requiresReply: boolean | number;
  status?: 'draft' | 'published' | 'withdrawn';
  displayStatus?: string;
  publishAt: string;
  expireAt: string | null;
  activatedAt?: string | null;
  creatorName: string | null;
  viewedAt?: string | null;
  completedAt?: string | null;
  isUnread?: boolean;
  canManage?: boolean;
  canReply?: boolean;
  recipientCount?: number;
  viewedCount?: number;
  completedCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AnnouncementReply {
  id: number;
  announcementId: number;
  userId: number;
  username: string;
  realName: string;
  deptName: string | null;
  roleNames: string | null;
  scope: 'public' | 'private';
  content: string;
  createdAt: string;
}

export interface AnnouncementViewRecord {
  index: number;
  username: string | null;
  realName: string | null;
  deptName: string | null;
  roleNames: string | null;
  viewedAt: string;
}

export interface SaveAnnouncementPayload {
  title: string;
  summary: string;
  content: string;
  level: string;
  requiresReply: boolean;
  publishAt?: string;
  expireAt?: string | null;
}

export interface AnnouncementAdminQuery {
  keyword?: string;
  status?: 'draft' | 'published' | 'withdrawn';
  level?: 'normal' | 'important' | 'urgent';
  requiresReply?: boolean;
  publishDateFrom?: string;
  publishDateTo?: string;
  page?: number;
  pageSize?: number;
}

export function getAnnouncementPending() {
  return request.get<any, { list: AnnouncementItem[]; unreadCount: number }>('/api/announcement/pending', {
    __silent: true,
  } as any);
}

export function getAnnouncementHistory(
  params: { page?: number; pageSize?: number } = {},
  silent = false,
) {
  return request.get<any, { list: AnnouncementItem[]; total: number }>('/api/announcement/history', {
    params,
    __silent: silent,
  } as any);
}

export function getAnnouncementDetail(id: number) {
  return request.get<any, AnnouncementItem>(`/api/announcement/${id}`);
}

export function markAnnouncementViewed(id: number) {
  return request.post<any, void>(`/api/announcement/${id}/view`);
}

export function ackAnnouncements(ids: number[]) {
  return request.post<any, void>('/api/announcement/ack', { ids });
}

export function getAnnouncementReplies(
  id: number,
  params: { page?: number; pageSize?: number } = {},
) {
  return request.get<any, {
    list: AnnouncementReply[];
    total: number;
    page: number;
    pageSize: number;
    canManage: boolean;
    requiresReply: boolean;
  }>(
    `/api/announcement/${id}/replies`,
    { params },
  );
}

export function createAnnouncementReply(id: number, data: { scope: string; content: string }) {
  return request.post<any, AnnouncementReply>(`/api/announcement/${id}/replies`, data);
}

export function getAnnouncementAdminList(params: AnnouncementAdminQuery) {
  return request.get<any, { list: AnnouncementItem[]; total: number }>('/api/announcement/admin', { params });
}

export function createAnnouncementDraft(data: SaveAnnouncementPayload) {
  return request.post<any, AnnouncementItem>('/api/announcement/admin', data);
}

export function updateAnnouncementDraft(id: number, data: SaveAnnouncementPayload) {
  return request.put<any, AnnouncementItem>(`/api/announcement/admin/${id}`, data);
}

export function deleteAnnouncementDraft(id: number) {
  return request.delete<any, void>(`/api/announcement/admin/${id}`);
}

export function publishAnnouncement(id: number, data: { publishAt?: string; expireAt?: string | null }) {
  return request.post<any, AnnouncementItem>(`/api/announcement/admin/${id}/publish`, data);
}

export function withdrawAnnouncement(id: number) {
  return request.post<any, void>(`/api/announcement/admin/${id}/withdraw`);
}

export function getAnnouncementViewRecords(id: number) {
  return request.get<any, AnnouncementViewRecord[]>(`/api/announcement/admin/${id}/view-records`);
}

export function getAnnouncementReplyExportCount(id: number) {
  return request.get<any, number>(`/api/announcement/admin/${id}/replies/export-count`);
}

export function downloadAnnouncementReplies(id: number) {
  return downloadXlsx(`/api/announcement/admin/${id}/replies/export`, {}, '通知公告回复.xlsx');
}
