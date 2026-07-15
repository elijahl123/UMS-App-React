import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';
import type { StagingAccessGrant, StagingAccessRole, StagingAccessStatus, StagingAccessUser } from '@/app/data/types';

async function stagingRequest<TResult>(path: string, options?: RequestInit): Promise<TResult> {
  const response = await apiFetch(`/staging-access${path}`, {
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

export function getMyStagingAccess() {
  return stagingRequest<{ enabled: boolean; user: StagingAccessUser | null }>('/me');
}

export async function getStagingAccessConfig() {
  const response = await apiFetch('/staging-access/config');
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }
  return payload as { enabled: boolean };
}

export function listStagingAccessUsers() {
  return stagingRequest<StagingAccessGrant[]>('/users');
}

export function upsertStagingAccessUser(params: {
  email: string;
  role: StagingAccessRole;
  status: StagingAccessStatus;
}) {
  return stagingRequest<StagingAccessGrant>('/users', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function updateStagingAccessUser(
  id: string | number,
  params: Partial<{ role: StagingAccessRole; status: StagingAccessStatus }>
) {
  return stagingRequest<StagingAccessGrant>(`/users/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export function deleteStagingAccessUser(id: string | number) {
  return stagingRequest<{ success: boolean }>(`/users/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  });
}
