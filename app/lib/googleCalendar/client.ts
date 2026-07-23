import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  calendarId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  syncInProgress: boolean;
};

export type GoogleCalendarSyncResult = {
  importedCount: number;
  updatedCount: number;
  deletedCount: number;
  pushedCount: number;
  fullSync: boolean;
};

async function googleCalendarRequest<TResult>(path: string, options?: RequestInit): Promise<TResult> {
  const response = await apiFetch(`/google-calendar${path}`, {
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

export async function getGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  return googleCalendarRequest<GoogleCalendarStatus>('/status');
}

export async function connectGoogleCalendar(): Promise<{ authorizationUrl: string }> {
  return googleCalendarRequest<{ authorizationUrl: string }>('/connect', { method: 'POST', body: '{}' });
}

export async function syncGoogleCalendar(forceFull = false): Promise<GoogleCalendarSyncResult> {
  return googleCalendarRequest<GoogleCalendarSyncResult>('/sync', {
    method: 'POST',
    body: JSON.stringify({ forceFull }),
  });
}

export async function disconnectGoogleCalendar(): Promise<{ ok: boolean }> {
  return googleCalendarRequest<{ ok: boolean }>('/connection', { method: 'DELETE' });
}
