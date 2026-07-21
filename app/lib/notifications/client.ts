import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';
import { mapNotificationInstance } from '@/app/data/mappers';
import type { NotificationInstance, NotificationPreferences } from '@/app/data/types';

async function notificationRequest<TResult>(path: string, options?: RequestInit): Promise<TResult> {
  const response = await apiFetch(`/notifications${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getApiAuthHeaders(),
      ...(options?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }

  return payload as TResult;
}

export function getNotificationPreferences() {
  return notificationRequest<NotificationPreferences>('/preferences');
}

export function updateNotificationPreferences(preferences: Omit<NotificationPreferences, 'userId'>) {
  return notificationRequest<NotificationPreferences>('/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
}

export async function syncNotificationInstances() {
  const result = await notificationRequest<{ instances: unknown[] }>('/sync', { method: 'POST' });
  return result.instances.map((row) => mapNotificationInstance(row as never));
}

export async function listNotificationInstances(limit = 50) {
  const rows = await notificationRequest<unknown[]>(`/instances?limit=${encodeURIComponent(String(limit))}`);
  return rows.map((row) => mapNotificationInstance(row as never));
}

export function markNotificationRead(id: string) {
  return notificationRequest<{ ok: boolean }>(`/instances/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export function dismissNotification(id: string) {
  return notificationRequest<{ ok: boolean }>(`/instances/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
}

export function markAllNotificationsRead() {
  return notificationRequest<{ ok: boolean }>('/read-all', { method: 'POST' });
}

export function unreadNotificationCount(instances: NotificationInstance[], now = new Date()) {
  return instances.filter((instance) => !instance.readAt && !instance.dismissedAt && new Date(instance.fireAt) <= now).length;
}
