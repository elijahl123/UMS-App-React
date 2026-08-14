import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';

async function emailRequest<TResult>(path: string, body?: Record<string, unknown>): Promise<TResult> {
  const response = await apiFetch(`/email/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getApiAuthHeaders(),
    },
    body: JSON.stringify(body ?? {}),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }
  return payload as TResult;
}

export function requestPasswordResetEmail(email: string) {
  return emailRequest<{ status: 'accepted' }>('password-reset', { email });
}

export function requestPrimaryEmailVerification() {
  return emailRequest<{ status: 'accepted' | 'already_verified' }>('verification');
}
