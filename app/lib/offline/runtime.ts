// Dependency-free holder for the offline layer's live state.
//
// `@/app/lib/api/client` needs to reach the offline cache, and the offline
// cache needs to reach the network client. This module breaks that cycle the
// same way `setApiAuthTokenRefresher` already does: the client only reads from
// here, and `OfflineProvider` registers the real implementation at mount.

export interface OfflineAdapter {
  readActionRows(name: string, params?: Record<string, unknown>): Promise<unknown[] | null>;
  writeActionRows(name: string, params: Record<string, unknown> | undefined, rows: unknown): Promise<void>;
  enqueueMutation(
    name: string,
    params?: Record<string, unknown>,
    clientMutationId?: string | null
  ): Promise<unknown[]>;
  enqueueStudyTaskCompletion(planId: string, taskId: string, completed: boolean, userId?: string): Promise<void>;
  readResource<T>(key: string): Promise<T | null>;
  writeResource(key: string, payload: unknown): Promise<void>;
}

interface OfflineRuntimeState {
  enabled: boolean;
  userId: string | null;
  adapter: OfflineAdapter | null;
  pendingCount: number;
}

const state: OfflineRuntimeState = { enabled: false, userId: null, adapter: null, pendingCount: 0 };

export function setOfflineRuntime(next: Partial<OfflineRuntimeState>) {
  if (next.enabled !== undefined) state.enabled = next.enabled;
  if (next.userId !== undefined) state.userId = next.userId;
  if (next.adapter !== undefined) state.adapter = next.adapter;
  if (next.pendingCount !== undefined) state.pendingCount = next.pendingCount;
}

/**
 * Edits waiting to reach the server, readable without touching IndexedDB so
 * synchronous callers (logout) can check before throwing the queue away.
 */
export function getPendingOfflineCount(): number {
  return state.enabled ? state.pendingCount : 0;
}

export function getOfflineUserId(): string | null {
  return state.userId;
}

/** True only when the feature is on, a user is signed in, and storage is wired up. */
export function isOfflineModeActive(): boolean {
  return state.enabled && Boolean(state.userId) && Boolean(state.adapter);
}

export function getOfflineAdapter(): OfflineAdapter | null {
  return isOfflineModeActive() ? state.adapter : null;
}

/** `navigator.onLine` is only trustworthy when it reports being offline. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// `navigator.onLine` says nothing about whether the API can actually be reached.
// A captive portal or a dead mobile connection accepts the socket and never
// answers, so every request waits out its full timeout. One such failure marks
// the API unreachable for a short window and the rest skip straight to cache.
const UNREACHABLE_WINDOW_MS = 15_000;
let apiUnreachableUntil = 0;

export function markApiUnreachable() {
  apiUnreachableUntil = Date.now() + UNREACHABLE_WINDOW_MS;
}

export function markApiReachable() {
  apiUnreachableUntil = 0;
}

export function isApiUnreachable(): boolean {
  return Date.now() < apiUnreachableUntil;
}

/** Offline in the sense that matters: asking the network is not worth the wait. */
export function shouldSkipNetwork(): boolean {
  return isBrowserOffline() || isApiUnreachable();
}

export const OFFLINE_QUEUE_EVENT = 'ums-offline-queue-changed';

export function notifyOfflineQueueChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
}

export const OFFLINE_ID_REMAPPED_EVENT = 'ums-offline-id-remapped';

/** Announces that a placeholder ID now has a real one, so open routes can follow. */
export function notifyOfflineIdRemapped(tempId: string, realId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OFFLINE_ID_REMAPPED_EVENT, { detail: { tempId, realId } }));
}
