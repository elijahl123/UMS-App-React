// Read-through cache and write queue behind `callAction`.

import {
  ACTION_CACHE_STORE,
  RESOURCE_CACHE_STORE,
  appendMutation,
  deleteRecord,
  readKeys,
  readRecord,
  writeRecord,
  type CachedPayload,
  type CachedRows,
} from '@/app/lib/offline/db';
import {
  buildRow,
  createTempId,
  entityByAction,
  loadActionByEntity,
  sortRows,
  type OfflineEntity,
} from '@/app/lib/offline/rows';
import { getOfflineUserId, notifyOfflineQueueChanged, type OfflineAdapter } from '@/app/lib/offline/runtime';

type Row = Record<string, unknown>;

export function paramsKey(params?: Record<string, unknown>): string {
  return JSON.stringify(params ?? {});
}

export function actionCacheKey(userId: string, name: string, params?: Record<string, unknown>): string {
  return `${userId}|${name}|${paramsKey(params)}`;
}

function resourceCacheKey(userId: string, key: string): string {
  return `${userId}|${key}`;
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

async function cacheEntriesFor(userId: string, loadName: string): Promise<string[]> {
  return readKeys(ACTION_CACHE_STORE, `${userId}|${loadName}|`);
}

/**
 * Applies `patch` to every cached variant of one load action. A single entity
 * can be cached under several keys because callers pass different params
 * (`loadEvents` is range-scoped, for example).
 */
async function patchCachedRows(userId: string, loadName: string, patch: (rows: Row[]) => Row[]): Promise<void> {
  const keys = await cacheEntriesFor(userId, loadName);
  await Promise.all(
    keys.map(async (key) => {
      const entry = await readRecord<CachedRows>(ACTION_CACHE_STORE, key);
      if (!entry) return;
      await writeRecord(ACTION_CACHE_STORE, key, {
        rows: patch(asRows(entry.rows)),
        cachedAt: entry.cachedAt,
      } satisfies CachedRows);
    })
  );
}

async function findCachedRow(userId: string, loadName: string, id: string): Promise<Row | undefined> {
  const keys = await cacheEntriesFor(userId, loadName);
  for (const key of keys) {
    const entry = await readRecord<CachedRows>(ACTION_CACHE_STORE, key);
    const match = asRows(entry?.rows).find((row) => String(row.id) === id);
    if (match) return match;
  }
  return undefined;
}

/** Mirrors the `ON DELETE CASCADE` / `SET NULL` rules on `courses` in the migrations. */
async function cascadeCourseDelete(userId: string, courseId: string): Promise<void> {
  const owned: Array<[string, OfflineEntity]> = [
    ['loadAssignments', 'assignment'],
    ['loadClassSessions', 'classSession'],
    ['loadCourseLinks', 'courseLink'],
    ['loadNotes', 'note'],
  ];
  await Promise.all(
    owned.map(([loadName]) =>
      patchCachedRows(userId, loadName, (rows) => rows.filter((row) => String(row.course_id ?? '') !== courseId))
    )
  );
  await patchCachedRows(userId, 'loadEvents', (rows) =>
    rows.map((row) =>
      String(row.course_id ?? '') === courseId ? { ...row, course_id: null, academic_kind: null } : row
    )
  );
}

async function enqueueMutation(name: string, params?: Record<string, unknown>): Promise<unknown[]> {
  const userId = getOfflineUserId();
  const entity = entityByAction[name];
  if (!userId || !entity) return [];

  const loadName = loadActionByEntity[entity];
  const request = params ?? {};
  let rows: unknown[] = [];
  let tempId: string | undefined;

  if (name.startsWith('create')) {
    tempId = createTempId();
    const row: Row = { ...buildRow(entity, request), id: tempId };
    await patchCachedRows(userId, loadName, (existing) => sortRows(entity, [...existing, row]));
    rows = [row];
  } else if (name.startsWith('update')) {
    const id = String(request.id ?? '');
    const existing = await findCachedRow(userId, loadName, id);
    const row: Row = { ...buildRow(entity, request, existing), id };
    await patchCachedRows(userId, loadName, (current) =>
      sortRows(entity, current.map((candidate) => (String(candidate.id) === id ? row : candidate)))
    );
    rows = [row];
  } else {
    const id = String(request.id ?? '');
    await patchCachedRows(userId, loadName, (current) => current.filter((row) => String(row.id) !== id));
    if (entity === 'course') await cascadeCourseDelete(userId, id);
  }

  await appendMutation({
    userId,
    name,
    params: request,
    ...(tempId ? { tempId } : {}),
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  notifyOfflineQueueChanged();

  return rows;
}

/** Swaps a placeholder ID for the real one once its create has replayed. */
export async function rewriteTempIdInCaches(userId: string, tempId: string, realId: string): Promise<void> {
  const keys = await readKeys(ACTION_CACHE_STORE, `${userId}|`);
  await Promise.all(
    keys.map(async (key) => {
      const entry = await readRecord<CachedRows>(ACTION_CACHE_STORE, key);
      if (!entry) return;
      let changed = false;
      const rows = asRows(entry.rows).map((row) => {
        const next = { ...row };
        if (String(next.id) === tempId) {
          next.id = realId;
          changed = true;
        }
        if (String(next.course_id ?? '') === tempId) {
          next.course_id = realId;
          changed = true;
        }
        return next;
      });
      if (changed) await writeRecord(ACTION_CACHE_STORE, key, { rows, cachedAt: entry.cachedAt } satisfies CachedRows);
    })
  );
}

export async function clearActionCache(userId: string): Promise<void> {
  const keys = await readKeys(ACTION_CACHE_STORE, `${userId}|`);
  await Promise.all(keys.map((key) => deleteRecord(ACTION_CACHE_STORE, key)));
}

export const offlineAdapter: OfflineAdapter = {
  async readActionRows(name, params) {
    const userId = getOfflineUserId();
    if (!userId) return null;
    const entry = await readRecord<CachedRows>(ACTION_CACHE_STORE, actionCacheKey(userId, name, params));
    return entry ? asRows(entry.rows) : null;
  },

  async writeActionRows(name, params, rows) {
    const userId = getOfflineUserId();
    if (!userId || !Array.isArray(rows)) return;
    await writeRecord(ACTION_CACHE_STORE, actionCacheKey(userId, name, params), {
      rows,
      cachedAt: new Date().toISOString(),
    } satisfies CachedRows);
  },

  enqueueMutation,

  async readResource<T>(key: string): Promise<T | null> {
    const userId = getOfflineUserId();
    if (!userId) return null;
    const entry = await readRecord<CachedPayload>(RESOURCE_CACHE_STORE, resourceCacheKey(userId, key));
    return entry ? (entry.payload as T) : null;
  },

  async writeResource(key, payload) {
    const userId = getOfflineUserId();
    if (!userId) return;
    await writeRecord(RESOURCE_CACHE_STORE, resourceCacheKey(userId, key), {
      payload,
      cachedAt: new Date().toISOString(),
    } satisfies CachedPayload);
  },
};
