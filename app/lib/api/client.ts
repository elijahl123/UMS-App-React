import { Capacitor } from '@capacitor/core';
import { isLoadAction, isQueueableAction } from '@/app/lib/api/actionMeta';
import { getOfflineAdapter, isBrowserOffline } from '@/app/lib/offline/runtime';
import { createMutationId } from '@/app/lib/offline/rows';

let authToken: string | null = null;
let authTokenRefresher: (() => Promise<string | null>) | null = null;
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

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const notifyAccessFailure = async (response: Response) => {
    if (response.status !== 403 || typeof window === 'undefined') return response;
    const payload = await response.clone().json().catch(() => null) as { error?: { message?: string } } | null;
    const code = payload?.error?.message;
    if (code === 'READ_ONLY_GRACE' || code === 'BILLING_REQUIRED') {
      window.dispatchEvent(new CustomEvent('ums-access-denied', { detail: { code } }));
    }
    return response;
  };
  let nextInit = init;
  const headers = new Headers(init?.headers);
  if (headers.has('Authorization') && authTokenRefresher) {
    const freshToken = await authTokenRefresher();
    if (freshToken) {
      headers.set('Authorization', `Bearer ${freshToken}`);
    } else {
      headers.delete('Authorization');
    }
    nextInit = { ...init, headers };
  }

  if (nextInit?.signal) {
    return fetch(apiUrl(path), nextInit).then(notifyAccessFailure);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  return fetch(apiUrl(path), { ...nextInit, signal: controller.signal })
    .then(notifyAccessFailure)
    .finally(() => window.clearTimeout(timeoutId));
}

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

export function setApiAuthTokenRefresher(refresher: (() => Promise<string | null>) | null) {
  authTokenRefresher = refresher;
}

export function getApiAuthHeaders(): HeadersInit {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

/** Calls an action without consulting the offline cache. Used by the sync engine. */
export async function callActionOverNetwork<TResult = unknown>(
  name: string,
  params?: Record<string, unknown>
): Promise<TResult> {
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

/**
 * A rejection the server never saw. Failed requests reject with the parsed JSON
 * body (a plain object), so anything thrown as an `Error` came from the
 * transport, the request timeout, or the token refresh that precedes it.
 */
function isTransportFailure(err: unknown): boolean {
  return err instanceof Error;
}

export async function callAction<TResult = unknown>(name: string, params?: Record<string, unknown>): Promise<TResult> {
  const offline = getOfflineAdapter();
  if (!offline) {
    return callActionOverNetwork<TResult>(name, params);
  }

  if (isLoadAction(name)) {
    if (isBrowserOffline()) {
      const cached = await offline.readActionRows(name, params);
      if (cached) return cached as TResult;
    }

    try {
      const rows = await callActionOverNetwork<TResult>(name, params);
      void offline.writeActionRows(name, params, rows);
      return rows;
    } catch (err) {
      const cached = await offline.readActionRows(name, params);
      if (cached) return cached as TResult;
      throw err;
    }
  }

  if (isQueueableAction(name)) {
    if (isBrowserOffline()) {
      return (await offline.enqueueMutation(name, params)) as TResult;
    }

    // Tag the attempt so that if its response is lost and the write is queued
    // and replayed, the server answers with the original result instead of
    // writing a second row.
    const clientMutationId = createMutationId();
    try {
      return await callActionOverNetwork<TResult>(
        name,
        clientMutationId ? { ...params, clientMutationId } : params
      );
    } catch (err) {
      if (!isTransportFailure(err)) throw err;
      return (await offline.enqueueMutation(name, params, clientMutationId)) as TResult;
    }
  }

  return callActionOverNetwork<TResult>(name, params);
}
