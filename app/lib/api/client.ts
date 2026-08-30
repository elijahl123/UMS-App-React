import { Capacitor } from '@capacitor/core';
import { REVALIDATED_EVENT, isLoadAction, isQueueableAction } from '@/app/lib/api/actionMeta';
import {
  getOfflineAdapter,
  markApiReachable,
  markApiUnreachable,
  shouldSkipNetwork,
  type OfflineAdapter,
} from '@/app/lib/offline/runtime';
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

const revalidating = new Set<string>();

/**
 * Refreshes a cached load without anyone waiting on it. The screen is only
 * disturbed when the answer actually changed, which also stops the reload it
 * triggers from revalidating forever.
 */
function revalidateInBackground(
  offline: OfflineAdapter,
  name: string,
  params: Record<string, unknown> | undefined,
  cached: unknown[]
) {
  if (shouldSkipNetwork()) return;
  const key = `${name}|${JSON.stringify(params ?? {})}`;
  if (revalidating.has(key)) return;
  revalidating.add(key);

  void callActionOverNetwork<unknown[]>(name, params)
    .then(async (rows) => {
      markApiReachable();
      await offline.writeActionRows(name, params, rows);
      if (typeof window !== 'undefined' && JSON.stringify(rows) !== JSON.stringify(cached)) {
        window.dispatchEvent(new CustomEvent(REVALIDATED_EVENT, { detail: { name } }));
      }
    })
    .catch((err) => {
      if (isTransportFailure(err)) markApiUnreachable();
    })
    .finally(() => revalidating.delete(key));
}

export async function callAction<TResult = unknown>(name: string, params?: Record<string, unknown>): Promise<TResult> {
  const offline = getOfflineAdapter();
  if (!offline) {
    return callActionOverNetwork<TResult>(name, params);
  }

  if (isLoadAction(name)) {
    // Cache first. Waiting on the network before showing anything is what turns
    // an unresponsive connection into a blank screen for the length of the
    // timeout, once per load on the page.
    const cached = await offline.readActionRows(name, params);
    if (cached) {
      revalidateInBackground(offline, name, params, cached);
      return cached as TResult;
    }

    try {
      const rows = await callActionOverNetwork<TResult>(name, params);
      markApiReachable();
      // Awaited, not fired and forgotten: the prefetch finishes when these reads
      // resolve, and an in-flight write is lost if the page goes away.
      await offline.writeActionRows(name, params, rows);
      return rows;
    } catch (err) {
      if (isTransportFailure(err)) markApiUnreachable();
      throw err;
    }
  }

  if (isQueueableAction(name)) {
    if (shouldSkipNetwork()) {
      return (await offline.enqueueMutation(name, params)) as TResult;
    }

    // Tag the attempt so that if its response is lost and the write is queued
    // and replayed, the server answers with the original result instead of
    // writing a second row.
    const clientMutationId = createMutationId();
    try {
      const result = await callActionOverNetwork<TResult>(
        name,
        clientMutationId ? { ...params, clientMutationId } : params
      );
      markApiReachable();
      return result;
    } catch (err) {
      if (!isTransportFailure(err)) throw err;
      markApiUnreachable();
      return (await offline.enqueueMutation(name, params, clientMutationId)) as TResult;
    }
  }

  return callActionOverNetwork<TResult>(name, params);
}
