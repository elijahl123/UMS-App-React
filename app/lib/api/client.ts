import { Capacitor } from '@capacitor/core';

let authToken: string | null = null;
const API_TIMEOUT_MS = 10000;

export function getApiBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const isCapacitorUrl = typeof window !== 'undefined' && window.location.protocol === 'capacitor:';
  if (Capacitor.isNativePlatform() || isCapacitorUrl) {
    return Capacitor.getPlatform() === 'android' ? 'http://10.0.2.2:3001/api' : 'http://localhost:3001/api';
  }

  return '/api';
}

export function apiUrl(path = ''): string {
  const normalizedPath = path.replace(/^\/+/, '');
  const baseUrl = getApiBaseUrl();
  return normalizedPath ? `${baseUrl}/${normalizedPath}` : baseUrl;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const notifyAccessFailure = async (response: Response) => {
    if (response.status !== 403 || typeof window === 'undefined') return response;
    const payload = await response.clone().json().catch(() => null) as { error?: { message?: string } } | null;
    const code = payload?.error?.message;
    if (code === 'READ_ONLY_GRACE' || code === 'BILLING_REQUIRED') {
      window.dispatchEvent(new CustomEvent('ums-access-denied', { detail: { code } }));
    }
    return response;
  };
  if (init?.signal) {
    return fetch(apiUrl(path), init).then(notifyAccessFailure);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  return fetch(apiUrl(path), { ...init, signal: controller.signal })
    .then(notifyAccessFailure)
    .finally(() => window.clearTimeout(timeoutId));
}

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

export function getApiAuthHeaders(): HeadersInit {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export async function callAction<TResult = unknown>(name: string, params?: Record<string, unknown>): Promise<TResult> {
  const response = await apiFetch(`/actions/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
    body: JSON.stringify(params ?? {}),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }

  return payload as TResult;
}
