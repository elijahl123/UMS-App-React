import { getApiAuthHeaders } from '@/app/lib/api/client';

export interface AccountEmailAddress {
  id: string;
  email: string;
  source: 'email' | 'google';
  verified: boolean;
  verifiedAt: string | null;
  verificationExpiresAt: string | null;
  createdAt: string;
}

async function accountEmailRequest<TResult>(path: string, init?: RequestInit): Promise<TResult> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  Object.entries(getApiAuthHeaders()).forEach(([key, value]) => headers.set(key, String(value)));

  const response = await fetch(`/api/email/account-addresses${path}`, {
    ...(init ?? {}),
    headers,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }

  return payload as TResult;
}

export async function listAccountEmails(): Promise<{ primaryEmail?: string; loginEmail?: string; emails: AccountEmailAddress[] }> {
  return accountEmailRequest('');
}

export async function addAccountEmail(email: string): Promise<{ email: AccountEmailAddress }> {
  return accountEmailRequest('', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resendAccountEmailVerification(id: string): Promise<{ email: AccountEmailAddress }> {
  return accountEmailRequest(`/${encodeURIComponent(id)}/resend`, {
    method: 'POST',
  });
}

export async function connectGoogleAccountEmail(idToken: string): Promise<{ email: AccountEmailAddress | null; primary: boolean }> {
  return accountEmailRequest('/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}

export async function deleteAccountEmail(id: string): Promise<{ email: AccountEmailAddress }> {
  return accountEmailRequest(`/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function verifyAccountEmailToken(token: string): Promise<{ email: AccountEmailAddress }> {
  const response = await fetch('/api/email/account-addresses/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }

  return payload as { email: AccountEmailAddress };
}
