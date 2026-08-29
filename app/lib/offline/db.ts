// Minimal IndexedDB wrapper for the offline cache and mutation queue.
// Hand-rolled to avoid a runtime dependency, matching `public/sw.js`.

const DB_NAME = 'ums-offline';
const DB_VERSION = 1;

export const ACTION_CACHE_STORE = 'actionCache';
export const RESOURCE_CACHE_STORE = 'resourceCache';
export const MUTATION_QUEUE_STORE = 'mutationQueue';
export const ID_MAP_STORE = 'idMap';
export const META_STORE = 'meta';

const KEYED_STORES = [ACTION_CACHE_STORE, RESOURCE_CACHE_STORE, ID_MAP_STORE, META_STORE] as const;

export interface CachedRows {
  rows: unknown[];
  cachedAt: string;
}

export interface CachedPayload {
  payload: unknown;
  cachedAt: string;
}

export interface QueuedMutation {
  seq: number;
  userId: string;
  name: string;
  params: Record<string, unknown>;
  /** Placeholder ID handed to the UI for a create, remapped once it replays. */
  tempId?: string;
  createdAt: string;
  attempts: number;
}

let databasePromise: Promise<IDBDatabase | null> | null = null;

function indexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

export function openOfflineDb(): Promise<IDBDatabase | null> {
  if (!indexedDbAvailable()) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      console.warn('[Offline] IndexedDB is unavailable:', err);
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      KEYED_STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      });
      if (!db.objectStoreNames.contains(MUTATION_QUEUE_STORE)) {
        db.createObjectStore(MUTATION_QUEUE_STORE, { keyPath: 'seq', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('[Offline] Could not open the offline database:', request.error);
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });

  return databasePromise;
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T
): Promise<T | null> {
  const db = await openOfflineDb();
  if (!db) return null;
  try {
    const transaction = db.transaction(storeName, mode);
    const result = await run(transaction.objectStore(storeName));
    if (mode === 'readwrite') {
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }
    return result;
  } catch (err) {
    console.warn(`[Offline] Store operation failed on ${storeName}:`, err);
    return null;
  }
}

export async function readRecord<T>(storeName: string, key: string): Promise<T | null> {
  const value = await withStore(storeName, 'readonly', (store) => runRequest<T | undefined>(store.get(key)));
  return (value ?? null) as T | null;
}

export async function writeRecord(storeName: string, key: string, value: unknown): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => runRequest(store.put(value, key)));
}

export async function deleteRecord(storeName: string, key: string): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => runRequest(store.delete(key)));
}

export async function readKeys(storeName: string, prefix: string): Promise<string[]> {
  const keys = await withStore(storeName, 'readonly', (store) => runRequest<IDBValidKey[]>(store.getAllKeys()));
  return (keys ?? [])
    .filter((key): key is string => typeof key === 'string')
    .filter((key) => key.startsWith(prefix));
}

export async function appendMutation(record: Omit<QueuedMutation, 'seq'>): Promise<number | null> {
  const key = await withStore(MUTATION_QUEUE_STORE, 'readwrite', (store) =>
    runRequest<IDBValidKey>(store.add(record))
  );
  return typeof key === 'number' ? key : null;
}

export async function readMutationQueue(userId: string): Promise<QueuedMutation[]> {
  const records = await withStore(MUTATION_QUEUE_STORE, 'readonly', (store) =>
    runRequest<QueuedMutation[]>(store.getAll())
  );
  return (records ?? []).filter((record) => record.userId === userId).sort((a, b) => a.seq - b.seq);
}

export async function countMutations(userId: string): Promise<number> {
  return (await readMutationQueue(userId)).length;
}

export async function updateMutation(record: QueuedMutation): Promise<void> {
  await withStore(MUTATION_QUEUE_STORE, 'readwrite', (store) => runRequest(store.put(record)));
}

export async function deleteMutation(seq: number): Promise<void> {
  await withStore(MUTATION_QUEUE_STORE, 'readwrite', (store) => runRequest(store.delete(seq)));
}

/**
 * Removes everything stored for one user, or the whole database when no user is
 * given. Called when offline access is switched off, on logout, and when a
 * different account signs in on the same device.
 */
export async function clearOfflineData(userId?: string): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;

  if (!userId) {
    await Promise.all(
      [...KEYED_STORES, MUTATION_QUEUE_STORE].map((storeName) =>
        withStore(storeName, 'readwrite', (store) => runRequest(store.clear()))
      )
    );
    return;
  }

  const prefix = `${userId}|`;
  await Promise.all(
    KEYED_STORES.map(async (storeName) => {
      const keys = await readKeys(storeName, prefix);
      await Promise.all(keys.map((key) => deleteRecord(storeName, key)));
    })
  );
  const queued = await readMutationQueue(userId);
  await Promise.all(queued.map((record) => deleteMutation(record.seq)));
}

/** Test seam: forces the next call to reopen the database. */
export function resetOfflineDbForTests() {
  databasePromise = null;
}
