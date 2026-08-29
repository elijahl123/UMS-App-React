// Replays offline edits against the server once a connection is back.

import { MUTATION_EVENT, notificationMutationActions } from '@/app/lib/api/actionMeta';
import { callActionOverNetwork } from '@/app/lib/api/client';
import { clearActionCache, rewriteTempIdInCaches } from '@/app/lib/offline/adapter';
import {
  ID_MAP_STORE,
  META_STORE,
  countMutations,
  deleteMutation,
  readMutationQueue,
  readRecord,
  updateMutation,
  writeRecord,
  type QueuedMutation,
} from '@/app/lib/offline/db';
import { entityByAction, isTempId, type OfflineEntity } from '@/app/lib/offline/rows';
import { setStudyTaskCompletedOverNetwork } from '@/app/lib/studyPlans/client';
import {
  getOfflineUserId,
  isBrowserOffline,
  isOfflineModeActive,
  notifyOfflineIdRemapped,
  notifyOfflineQueueChanged,
} from '@/app/lib/offline/runtime';

export interface SyncIssue {
  id: string;
  message: string;
  at: string;
}

export interface SyncOutcome {
  synced: number;
  remaining: number;
  issues: SyncIssue[];
}

const entityLabels: Record<OfflineEntity, string> = {
  course: 'course',
  assignment: 'assignment',
  classSession: 'class session',
  event: 'event',
  note: 'note',
  courseLink: 'course link',
};

function describeFailure(name: string, reason: string): string {
  if (name === 'setStudyTaskCompleted') {
    return `Could not save a study task you checked off offline. ${reason}`;
  }
  const entity = entityByAction[name];
  const label = entity ? entityLabels[entity] : 'item';
  const verb = name.startsWith('create') ? 'add' : name.startsWith('update') ? 'save changes to' : 'delete';
  return `Could not ${verb} a ${label} you changed offline. ${reason}`;
}

function serverMessage(err: unknown): string {
  const code = (err as { error?: { message?: string } })?.error?.message;
  if (!code || code === 'REQUEST_FAILED') return 'The server rejected the change.';
  if (code === 'BILLING_REQUIRED' || code === 'READ_ONLY_GRACE') {
    return 'Your account cannot make changes right now.';
  }
  return `The server reported: ${code}.`;
}

function isTransportFailure(err: unknown): boolean {
  return err instanceof Error;
}

function issuesKey(userId: string): string {
  return `${userId}|syncIssues`;
}

function lastSyncedKey(userId: string): string {
  return `${userId}|lastSyncedAt`;
}

function idMapKey(userId: string, tempId: string): string {
  return `${userId}|${tempId}`;
}

export async function readSyncIssues(userId: string): Promise<SyncIssue[]> {
  return (await readRecord<SyncIssue[]>(META_STORE, issuesKey(userId))) ?? [];
}

export async function dismissSyncIssue(userId: string, id: string): Promise<SyncIssue[]> {
  const remaining = (await readSyncIssues(userId)).filter((issue) => issue.id !== id);
  await writeRecord(META_STORE, issuesKey(userId), remaining);
  return remaining;
}

export async function readLastSyncedAt(userId: string): Promise<string | null> {
  return readRecord<string>(META_STORE, lastSyncedKey(userId));
}

async function recordIssue(userId: string, message: string): Promise<SyncIssue> {
  const issue: SyncIssue = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    at: new Date().toISOString(),
  };
  const existing = await readSyncIssues(userId);
  await writeRecord(META_STORE, issuesKey(userId), [...existing, issue].slice(-20));
  return issue;
}

/** Substitutes placeholder IDs with the real ones recorded by earlier replays. */
async function resolveParams(
  userId: string,
  params: Record<string, unknown>
): Promise<{ params: Record<string, unknown>; unresolved: boolean }> {
  const resolved: Record<string, unknown> = { ...params };
  let unresolved = false;

  for (const [key, value] of Object.entries(params)) {
    if (!isTempId(value)) continue;
    const realId = await readRecord<string>(ID_MAP_STORE, idMapKey(userId, value));
    if (realId) {
      resolved[key] = realId;
    } else {
      unresolved = true;
    }
  }

  return { params: resolved, unresolved };
}

async function replayStudyTask(userId: string, record: QueuedMutation): Promise<'done' | 'issue' | 'retry'> {
  try {
    await setStudyTaskCompletedOverNetwork(
      String(record.params.planId),
      String(record.params.taskId),
      Boolean(record.params.completed),
      typeof record.params.userId === 'string' ? record.params.userId : undefined
    );
    return 'done';
  } catch (err) {
    if (isTransportFailure(err)) return 'retry';
    await recordIssue(userId, describeFailure(record.name, serverMessage(err)));
    return 'issue';
  }
}

async function replayOne(userId: string, record: QueuedMutation): Promise<'done' | 'issue' | 'retry'> {
  if (record.kind === 'studyTask') return replayStudyTask(userId, record);

  const { params, unresolved } = await resolveParams(userId, record.params);
  if (unresolved) {
    await recordIssue(
      userId,
      describeFailure(record.name, 'It depended on another offline change that could not be saved.')
    );
    return 'issue';
  }

  let rows: unknown;
  try {
    rows = await callActionOverNetwork(record.name, params);
  } catch (err) {
    if (isTransportFailure(err)) return 'retry';
    await recordIssue(userId, describeFailure(record.name, serverMessage(err)));
    return 'issue';
  }

  const returned = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];

  if (record.name.startsWith('create')) {
    const realId = returned[0]?.id;
    if (realId === undefined) {
      await recordIssue(userId, describeFailure(record.name, 'The server did not accept it.'));
      return 'issue';
    }
    if (record.tempId) {
      await writeRecord(ID_MAP_STORE, idMapKey(userId, record.tempId), String(realId));
      await rewriteTempIdInCaches(userId, record.tempId, String(realId));
      notifyOfflineIdRemapped(record.tempId, String(realId));
    }
    return 'done';
  }

  if (record.name.startsWith('update') && returned.length === 0) {
    await recordIssue(userId, describeFailure(record.name, 'It no longer exists on the server.'));
    return 'issue';
  }

  return 'done';
}

let inFlight: Promise<SyncOutcome> | null = null;

export function syncOfflineMutations(): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<SyncOutcome> {
  const userId = getOfflineUserId();
  if (!isOfflineModeActive() || !userId) return { synced: 0, remaining: 0, issues: [] };
  if (isBrowserOffline()) {
    return { synced: 0, remaining: await countMutations(userId), issues: await readSyncIssues(userId) };
  }

  const queue = await readMutationQueue(userId);
  const replayed = new Set<string>();
  let synced = 0;
  let stopped = false;

  for (const record of queue) {
    const outcome = await replayOne(userId, record);
    if (outcome === 'retry') {
      await updateMutation({ ...record, attempts: record.attempts + 1 });
      stopped = true;
      break;
    }
    await deleteMutation(record.seq);
    replayed.add(record.name);
    if (outcome === 'done') synced += 1;
    notifyOfflineQueueChanged();
  }

  const remaining = await countMutations(userId);

  if (!stopped && remaining === 0) {
    // Drop the locally patched rows so the next load re-reads the server's truth.
    await clearActionCache(userId);
    await writeRecord(META_STORE, lastSyncedKey(userId), new Date().toISOString());
  }

  if (typeof window !== 'undefined' && replayed.size > 0) {
    replayed.forEach((name) => {
      window.dispatchEvent(new CustomEvent(MUTATION_EVENT, { detail: { name } }));
    });
    if ([...replayed].some((name) => notificationMutationActions.has(name))) {
      window.dispatchEvent(new CustomEvent('ums-notifications-changed'));
    }
  }

  notifyOfflineQueueChanged();
  return { synced, remaining, issues: await readSyncIssues(userId) };
}
