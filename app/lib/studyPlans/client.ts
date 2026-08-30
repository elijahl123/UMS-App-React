import type {
  ExamType,
  PhasePreset,
  StudyAvailability,
  StudyCalendarData,
  StudyDashboardData,
  StudyDashboardTask,
  StudyDifficulty,
  StudyPlanDefinition,
  StudyPlanMode,
  StudyPlanSummary,
  StudyRecoveryPreview,
  StudyRecoveryStatus,
  StudyTask,
  StudyTopic,
  StudyTargetType,
} from '@/app/data/types';
import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';
import {
  getOfflineAdapter,
  isBrowserOffline,
  markApiReachable,
  markApiUnreachable,
  shouldSkipNetwork,
} from '@/app/lib/offline/runtime';
export { parseStudyTopics } from '@/app/data/studyPlans';
import { trackProductEvent } from '@/app/lib/launch/client';

export type StudyPlanInput = {
  courseId: string;
  targetType?: StudyTargetType;
  targetTitle?: string;
  targetDate?: string;
  targetTime?: string | null;
  targetAssignmentId?: string | null;
  estimatedMinutes?: number | null;
  dailyCapMinutes?: number | null;
  availableWeekdays?: number[];
  partialPlanAcknowledged?: boolean;
  examType: ExamType;
  examDate: string;
  startDate: string;
  timeZone: string;
  availability: StudyAvailability[];
  topics: Array<{ id?: string; title: string; difficulty: StudyDifficulty }>;
  topicMode?: StudyPlanMode;
  phasePreset?: PhasePreset;
};

async function studyPlanRequest<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await apiFetch(`/study-plans${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...getApiAuthHeaders(),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  return payload as T;
}

/**
 * Study plans are read-only offline: the schedule is generated server side, so a
 * cached copy is safe to show but edits cannot be replayed later.
 */
/** Fired when a background refresh found newer study plan data than the cache held. */
export const STUDY_PLANS_REVALIDATED_EVENT = 'ums-study-plans-revalidated';

const revalidatingStudyKeys = new Set<string>();

function revalidateStudyRead<T>(cacheKey: string, load: () => Promise<T>, cached: T) {
  if (shouldSkipNetwork() || revalidatingStudyKeys.has(cacheKey)) return;
  revalidatingStudyKeys.add(cacheKey);

  void load()
    .then(async (payload) => {
      markApiReachable();
      const offline = getOfflineAdapter();
      if (!offline) return;
      await offline.writeResource(cacheKey, payload);
      if (typeof window !== 'undefined' && JSON.stringify(payload) !== JSON.stringify(cached)) {
        window.dispatchEvent(new CustomEvent(STUDY_PLANS_REVALIDATED_EVENT));
      }
    })
    .catch((err) => {
      if (err instanceof Error) markApiUnreachable();
    })
    .finally(() => revalidatingStudyKeys.delete(cacheKey));
}

/**
 * Cache first, like every other read. Asking the network before showing anything
 * is what leaves a plan blank until the request times out, which is exactly when
 * the saved copy is the thing worth showing.
 */
async function cachedStudyRead<T>(cacheKey: string, load: () => Promise<T>): Promise<T> {
  const offline = getOfflineAdapter();
  if (!offline) return load();

  const cached = await offline.readResource<T>(cacheKey);
  if (cached !== null) {
    revalidateStudyRead(cacheKey, load, cached);
    return cached;
  }

  try {
    const payload = await load();
    markApiReachable();
    await offline.writeResource(cacheKey, payload);
    return payload;
  } catch (err) {
    if (err instanceof Error) markApiUnreachable();
    throw err;
  }
}

function requireConnection() {
  if (isBrowserOffline()) throw { error: { message: 'OFFLINE_UNAVAILABLE' } };
}

function mapTask(row: Record<string, unknown>): StudyTask {
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    topicId: String(row.topic_id),
    phase: row.phase as StudyTask['phase'],
    title: String(row.title),
    scheduledDate: String(row.scheduled_date).slice(0, 10),
    estimatedMinutes: Number(row.estimated_minutes),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    sequence: Number(row.sequence),
  };
}

function mapTopic(row: Record<string, unknown>): StudyTopic {
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    title: String(row.title),
    difficulty: row.difficulty as StudyTopic['difficulty'],
    position: Number(row.position),
    active: Boolean(row.active),
    totalTasks: Number(row.total_tasks ?? 0),
    completedTasks: Number(row.completed_tasks ?? 0),
  };
}

export function mapStudyPlanSummary(row: Record<string, unknown>): StudyPlanSummary {
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    courseCode: String(row.course_code),
    courseName: String(row.course_name),
    courseColor: String(row.course_color),
    courseHomepageUrl: row.course_homepage_url ? String(row.course_homepage_url) : null,
    examType: row.exam_type as StudyPlanSummary['examType'],
    examDate: String(row.exam_date).slice(0, 10),
    targetType: (row.target_type ?? 'exam') as StudyPlanSummary['targetType'],
    targetTitle: String(row.target_title ?? (row.exam_type === 'midterm' ? 'Midterm exam' : 'Final exam')),
    targetDate: String(row.target_date ?? row.exam_date).slice(0, 10),
    targetTime: row.target_time ? String(row.target_time).slice(0, 5) : null,
    targetAssignmentId: row.target_assignment_id ? String(row.target_assignment_id) : null,
    estimatedMinutes: row.estimated_minutes == null ? null : Number(row.estimated_minutes),
    dailyCapMinutes: row.daily_cap_minutes == null ? null : Number(row.daily_cap_minutes),
    schedulerVersion: Number(row.scheduler_version ?? 1),
    schedulerExplanation: row.scheduler_explanation ? String(row.scheduler_explanation) : null,
    unscheduledMinutes: Number(row.unscheduled_minutes ?? 0),
    partialPlanAcknowledged: Boolean(row.partial_plan_acknowledged),
    topicMode: (row.topic_mode ?? 'phases') as StudyPlanSummary['topicMode'],
    phasePreset: (row.phase_preset ?? 'study') as StudyPlanSummary['phasePreset'],
    startDate: String(row.start_date).slice(0, 10),
    timeZone: String(row.timezone),
    archived: Boolean(row.archived),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    totalTasks: Number(row.total_tasks ?? 0),
    completedTasks: Number(row.completed_tasks ?? 0),
    overdueTasks: Number(row.overdue_tasks ?? 0),
    overCapacityMinutes: Number(row.over_capacity_minutes ?? 0),
    overCapacityDays: Number(row.over_capacity_days ?? 0),
    recoveryNeeded: Boolean(row.recovery_needed ?? (
      Number(row.overdue_tasks ?? 0) > 0 || Number(row.over_capacity_minutes ?? 0) > 0
    )),
    studyDaysLeft: Number(row.study_days_left ?? 0),
    activeTopics: Number(row.active_topics ?? 0),
    nextStudyDate: row.next_study_date ? String(row.next_study_date).slice(0, 10) : null,
    nextTaskTitle: row.next_task_title ? String(row.next_task_title) : null,
  };
}

function requestQuery(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.size ? `?${params.toString()}` : '';
}

export async function listStudyPlanSummaries(courseId?: string, userId?: string): Promise<StudyPlanSummary[]> {
  return cachedStudyRead(`study-plans:summaries:${courseId ?? 'all'}`, async () => {
    const payload = await studyPlanRequest<{ plans: Array<Record<string, unknown>> }>(
      requestQuery({ courseId, userId })
    );
    return payload.plans.map(mapStudyPlanSummary);
  });
}

export async function getStudyPlanDefinition(planId: string, userId?: string): Promise<StudyPlanDefinition> {
  return cachedStudyRead(`study-plans:definition:${planId}`, async () => {
  const payload = await studyPlanRequest<{
    plan: Record<string, unknown>;
    availability: Array<Record<string, unknown>>;
    topics: Array<Record<string, unknown>>;
  }>(`/${planId}${requestQuery({ userId })}`);
  return {
    ...mapStudyPlanSummary(payload.plan),
    availability: payload.availability.map((row) => ({
      weekday: Number(row.weekday),
      minutes: Number(row.minutes),
    })),
    topics: payload.topics.map(mapTopic),
  };
  });
}

function studyTasksKey(planId: string): string {
  return `study-plans:tasks:${planId}`;
}

function inWindow(task: StudyTask, from: string, to: string): boolean {
  return task.scheduledDate >= from && task.scheduledDate < to;
}

/**
 * The visible task window moves with the calendar, so caching per window would
 * miss the moment the day rolls over. Instead every fetched window is merged
 * into one cached set per plan and filtered on read.
 */
export async function getStudyPlanTasks(
  planId: string,
  from: string,
  to: string,
  userId?: string
): Promise<{ from: string; to: string; tasks: StudyTask[] }> {
  const load = async () => {
    const payload = await studyPlanRequest<{
      from: string;
      to: string;
      tasks: Array<Record<string, unknown>>;
    }>(`/${planId}/tasks${requestQuery({ from, to, userId })}`);
    return { from: payload.from, to: payload.to, tasks: payload.tasks.map(mapTask) };
  };

  const offline = getOfflineAdapter();
  if (!offline) return load();

  const key = studyTasksKey(planId);
  const merge = async (payload: { from: string; to: string; tasks: StudyTask[] }) => {
    const held = (await offline.readResource<StudyTask[]>(key)) ?? [];
    const outsideWindow = held.filter((task) => !inWindow(task, payload.from, payload.to));
    await offline.writeResource(key, [...outsideWindow, ...payload.tasks]);
  };

  const cached = await offline.readResource<StudyTask[]>(key);
  if (cached) {
    const visible = cached.filter((task) => inWindow(task, from, to));
    if (!shouldSkipNetwork() && !revalidatingStudyKeys.has(key)) {
      revalidatingStudyKeys.add(key);
      void load()
        .then(async (payload) => {
          markApiReachable();
          await merge(payload);
          if (typeof window !== 'undefined' && JSON.stringify(payload.tasks) !== JSON.stringify(visible)) {
            window.dispatchEvent(new CustomEvent(STUDY_PLANS_REVALIDATED_EVENT));
          }
        })
        .catch((err) => {
          if (err instanceof Error) markApiUnreachable();
        })
        .finally(() => revalidatingStudyKeys.delete(key));
    }
    return { from, to, tasks: visible };
  }

  try {
    const payload = await load();
    markApiReachable();
    await merge(payload);
    return payload;
  } catch (err) {
    if (err instanceof Error) markApiUnreachable();
    throw err;
  }
}

/** Keeps the checkbox and the plan's progress count honest until the toggle syncs. */
async function patchCachedStudyTask(planId: string, taskId: string, completedAt: string | null): Promise<void> {
  const offline = getOfflineAdapter();
  if (!offline) return;

  const key = studyTasksKey(planId);
  const cached = await offline.readResource<StudyTask[]>(key);
  const previous = cached?.find((task) => task.id === taskId);
  if (cached) {
    await offline.writeResource(
      key,
      cached.map((task) => (task.id === taskId ? { ...task, completedAt } : task))
    );
  }

  const wasCompleted = Boolean(previous?.completedAt);
  const delta = Number(Boolean(completedAt)) - Number(wasCompleted);
  if (!previous || delta === 0) return;

  const definitionKey = `study-plans:definition:${planId}`;
  const definition = await offline.readResource<StudyPlanDefinition>(definitionKey);
  if (definition) {
    await offline.writeResource(definitionKey, {
      ...definition,
      completedTasks: Math.max(0, definition.completedTasks + delta),
    });
  }
}

export async function getStudyPlanDashboard(userId?: string): Promise<StudyDashboardData> {
  return cachedStudyRead('study-plans:dashboard', async () => {
  const payload = await studyPlanRequest<{
    plans: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
    activePlanCount: number;
    overduePlanCount: number;
    recoveryPlanCount?: number;
    urgentPlan: Record<string, unknown> | null;
    nextStudyDate: string | null;
  }>(`/dashboard${requestQuery({ userId })}`);
  return {
    plans: payload.plans.map(mapStudyPlanSummary),
    tasks: payload.tasks.map((row): StudyDashboardTask => ({
      ...mapTask(row),
      courseId: String(row.course_id),
      courseCode: String(row.course_code),
      courseName: String(row.course_name),
      courseColor: String(row.course_color),
      courseHomepageUrl: row.course_homepage_url ? String(row.course_homepage_url) : null,
    })),
    activePlanCount: Number(payload.activePlanCount),
    overduePlanCount: Number(payload.overduePlanCount),
    recoveryPlanCount: Number(payload.recoveryPlanCount ?? payload.overduePlanCount),
    urgentPlan: payload.urgentPlan ? mapStudyPlanSummary(payload.urgentPlan) : null,
    nextStudyDate: payload.nextStudyDate ? String(payload.nextStudyDate).slice(0, 10) : null,
  };
  });
}

export async function getStudyPlanRecoveryStatus(planId: string, userId?: string): Promise<StudyRecoveryStatus> {
  return cachedStudyRead(`study-plans:recovery:${planId}`, () =>
    studyPlanRequest<StudyRecoveryStatus>(`/${planId}/recovery${requestQuery({ userId })}`)
  );
}

export async function previewStudyPlanRecovery(
  planId: string,
  omittedGroupIds: string[] = [],
  additionalMinutesPerDay = 0,
  userId?: string
): Promise<StudyRecoveryPreview> {
  requireConnection();
  const result = await studyPlanRequest<StudyRecoveryPreview>(`/${planId}/recovery/preview`, {
    method: 'POST',
    body: JSON.stringify({ omittedGroupIds, additionalMinutesPerDay, userId }),
  });
  void trackProductEvent('study_recovery_previewed', {
    movedCount: result.taskChanges.filter((change) => change.status === 'moved').length,
    shortfallMinutes: result.shortfallMinutes,
  });
  return result;
}

export async function confirmStudyPlanRecovery(
  planId: string,
  stateToken: string,
  omittedGroupIds: string[] = [],
  additionalMinutesPerDay = 0,
  userId?: string
): Promise<{ planId: string; recovered: boolean; revisionId: string | null; preview: StudyRecoveryPreview }> {
  requireConnection();
  const result = await studyPlanRequest<{
    planId: string;
    recovered: boolean;
    revisionId: string | null;
    preview: StudyRecoveryPreview;
  }>(`/${planId}/recovery/confirm`, {
    method: 'POST',
    body: JSON.stringify({ stateToken, omittedGroupIds, additionalMinutesPerDay, userId }),
  });
  if (result.recovered) void trackProductEvent('study_recovery_applied', {
    movedCount: result.preview.taskChanges.filter((change) => change.status === 'moved').length,
    unscheduledMinutes: result.preview.totals.after.unscheduledMinutes,
    addedCapacityMinutes: result.preview.capacityChanges.reduce((sum, change) => sum + change.addedMinutes, 0),
  });
  return result;
}

export async function undoStudyPlanRecovery(
  planId: string,
  userId?: string
): Promise<{ planId: string; undone: boolean; revisionId: string }> {
  requireConnection();
  const result = await studyPlanRequest<{ planId: string; undone: boolean; revisionId: string }>(`/${planId}/recovery/undo`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  if (result.undone) void trackProductEvent('study_recovery_undone');
  return result;
}

export async function getStudyPlanCalendar(
  from: string,
  to: string,
  userId?: string
): Promise<StudyCalendarData> {
  return cachedStudyRead(`study-plans:calendar:${from}:${to}`, async () => {
  const payload = await studyPlanRequest<{
    from: string;
    to: string;
    plans: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
  }>(`/calendar${requestQuery({ from, to, userId })}`);
  return {
    from: payload.from,
    to: payload.to,
    plans: payload.plans.map(mapStudyPlanSummary),
    tasks: payload.tasks.map(mapTask),
  };
  });
}

export async function saveStudyPlan(input: StudyPlanInput, planId?: string, userId?: string): Promise<{ planId: string }> {
  requireConnection();
  return studyPlanRequest<{ planId: string }>(planId ? `/${planId}` : '', {
    method: planId ? 'PUT' : 'POST',
    body: JSON.stringify({ ...input, userId }),
  });
}

export async function refreshStudyPlan(planId: string, userId?: string): Promise<{ planId: string; refreshed: boolean }> {
  requireConnection();
  return studyPlanRequest<{ planId: string; refreshed: boolean }>(`/${planId}/refresh`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function setStudyTaskCompleted(
  planId: string,
  taskId: string,
  completed: boolean,
  userId?: string
): Promise<{ id: string; completedAt: string | null }> {
  const offline = getOfflineAdapter();
  const queueLocally = async () => {
    const completedAt = completed ? new Date().toISOString() : null;
    await patchCachedStudyTask(planId, taskId, completedAt);
    await offline!.enqueueStudyTaskCompletion(planId, taskId, completed, userId);
    return { id: taskId, completedAt };
  };

  if (offline && isBrowserOffline()) return queueLocally();
  if (!offline) requireConnection();

  try {
    const result = await setStudyTaskCompletedOverNetwork(planId, taskId, completed, userId);
    if (completed) void trackProductEvent('study_task_completed');
    void patchCachedStudyTask(planId, taskId, result.completedAt);
    return result;
  } catch (err) {
    // A rejection the server never saw: queue it instead of losing the tick.
    if (offline && err instanceof Error) return queueLocally();
    throw err;
  }
}

/** Used by the sync engine to replay a queued toggle without re-entering the queue. */
export function setStudyTaskCompletedOverNetwork(
  planId: string,
  taskId: string,
  completed: boolean,
  userId?: string
): Promise<{ id: string; completedAt: string | null }> {
  return studyPlanRequest<{ id: string; completedAt: string | null }>(`/${planId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed, userId }),
  });
}

export function updateStudyTask(
  planId: string,
  taskId: string,
  changes: { title: string; scheduledDate: string; estimatedMinutes: number },
  userId?: string
) {
  requireConnection();
  return studyPlanRequest<{
    id: string;
    completedAt: string | null;
    title: string | null;
    scheduledDate: string;
    estimatedMinutes: number;
    manuallyEditedAt: string | null;
  }>(`/${planId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...changes, userId }),
  });
}

export async function openStudyTaskNote(
  planId: string,
  taskId: string,
  userId?: string
): Promise<{ noteId: string; created: boolean }> {
  requireConnection();
  return studyPlanRequest<{ noteId: string; created: boolean }>(`/${planId}/tasks/${taskId}/note`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function setStudyPlanArchived(
  planId: string,
  archived: boolean,
  userId?: string
): Promise<{ id: string; archived: boolean }> {
  requireConnection();
  return studyPlanRequest<{ id: string; archived: boolean }>(`/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived, userId }),
  });
}

export async function deleteStudyPlan(planId: string, userId?: string): Promise<void> {
  requireConnection();
  await studyPlanRequest(`/${planId}`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

export function studyPlanErrorMessage(error: unknown): string {
  const payload = error as {
    error?: {
      message?: string;
      details?: { requiredMinutes?: number; availableMinutes?: number; missingMinutes?: number };
    };
  };
  if (payload?.error?.message === 'OFFLINE_UNAVAILABLE') return 'Study plans need a connection. Reconnect to make changes.';
  const details = payload?.error?.details;
  if (payload?.error?.message === 'INSUFFICIENT_STUDY_CAPACITY' && details) {
    return `This plan needs ${details.requiredMinutes ?? 0} minutes, but only ${details.availableMinutes ?? 0} are available. Add ${details.missingMinutes ?? 0} minutes or reduce the workload.`;
  }
  if (payload?.error?.message === 'RECOVERY_PREVIEW_STALE') return 'The plan changed after this preview. Review the updated recovery plan before confirming.';
  if (payload?.error?.message === 'RECOVERY_OMISSIONS_REQUIRED') return 'Choose enough work to leave unscheduled before confirming recovery.';
  if (payload?.error?.message === 'RECOVERY_UNDO_UNSAFE') return 'Recovery can no longer be undone because the plan changed afterward.';
  if (payload?.error?.message === 'RECOVERY_UNDO_NOT_AVAILABLE') return 'There is no recovery revision available to undo.';
  if (payload?.error?.message === 'RECOVERY_NO_MOVABLE_WORK') return 'The remaining overdue work is pinned. Edit those tasks manually before recovering the plan.';
  return payload?.error?.message ?? 'Unable to save this plan.';
}
