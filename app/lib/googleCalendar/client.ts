import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  calendarId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  syncInProgress: boolean;
  historyMonths: number;
  selectedCalendarIds: string[];
  setupCompleted: boolean;
  reauthorizationRequired: boolean;
};

export type GoogleOwnedCalendar = {
  id: string;
  summary: string;
  timeZone: string;
  backgroundColor: string | null;
  primary: boolean;
  selected: boolean;
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

export async function getOwnedGoogleCalendars(): Promise<GoogleOwnedCalendar[]> {
  return googleCalendarRequest<GoogleOwnedCalendar[]>('/calendars');
}

export async function updateGoogleCalendarSettings(
  calendarIds: string[],
  historyMonths: number
): Promise<GoogleCalendarStatus> {
  return googleCalendarRequest<GoogleCalendarStatus>('/settings', {
    method: 'PUT',
    body: JSON.stringify({ calendarIds, historyMonths }),
  });
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
