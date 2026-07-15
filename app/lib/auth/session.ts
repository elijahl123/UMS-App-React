import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';
import type { AppUser } from '@/app/data/types';

export interface AuthSessionResolution {
  userId: string;
  loginUid: string;
  email: string;
  user?: AppUser;
  linkedToPrimary: boolean;
}

export async function resolveAuthSession(): Promise<AuthSessionResolution> {
  const response = await apiFetch('/auth/session', {
    headers: {
      'Content-Type': 'application/json',
      ...getApiAuthHeaders(),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }

  return payload as AuthSessionResolution;
}
