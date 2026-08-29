// Builds server-shaped rows for edits made while offline.
//
// Pages read the raw snake_case rows that `callAction` returns and map them with
// `@/app/data/mappers`, so a synthesized row only has to match the columns those
// mappers touch. Real IDs arrive later, when the queued mutation replays.

import { DEFAULT_DUE_TIME_ZONE, normalizeDateString } from '@/app/data/assignmentDates';

export const TEMP_ID_PREFIX = 'tmp-';

export type OfflineEntity = 'course' | 'assignment' | 'classSession' | 'event' | 'note' | 'courseLink';

type Row = Record<string, unknown>;
type Params = Record<string, unknown>;

export const entityByAction: Record<string, OfflineEntity> = {
  createCourse: 'course',
  updateCourse: 'course',
  deleteCourse: 'course',
  createAssignment: 'assignment',
  updateAssignment: 'assignment',
  deleteAssignment: 'assignment',
  createClassSession: 'classSession',
  updateClassSession: 'classSession',
  deleteClassSession: 'classSession',
  createEvent: 'event',
  updateEvent: 'event',
  deleteEvent: 'event',
  createNote: 'note',
  updateNote: 'note',
  deleteNote: 'note',
  createCourseLink: 'courseLink',
  updateCourseLink: 'courseLink',
  deleteCourseLink: 'courseLink',
};

export const loadActionByEntity: Record<OfflineEntity, string> = {
  course: 'loadCourses',
  assignment: 'loadAssignments',
  classSession: 'loadClassSessions',
  event: 'loadEvents',
  note: 'loadNotes',
  courseLink: 'loadCourseLinks',
};

export function isTempId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(TEMP_ID_PREFIX);
}

export function createTempId(): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${TEMP_ID_PREFIX}${suffix}`;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function nullableText(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value);
  return trimmed === '' ? null : trimmed;
}

/** Today's date in `timeZone`, formatted as YYYY-MM-DD. */
function todayInTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Mirrors the CASE expression in `assignmentSelectColumns` (server/actions.ts). */
export function assignmentStatus(dueDate: string, timeZone: string, requestedStatus?: unknown): string {
  if (requestedStatus === 'completed') return 'completed';
  const today = todayInTimeZone(timeZone || DEFAULT_DUE_TIME_ZONE);
  const due = normalizeDateString(dueDate);
  if (due < today) return 'late';
  if (due === today) return 'due_today';
  return 'upcoming';
}

function buildCourse(params: Params, existing?: Row): Row {
  return {
    ...existing,
    code: text(params.code),
    name: text(params.name),
    color: params.color ?? existing?.color ?? 'course-diamond',
    homepage_url: nullableText(params.homepageUrl),
  };
}

function buildAssignment(params: Params, existing?: Row): Row {
  const dueDate = text(params.dueDate ?? existing?.due_date);
  const timeZone = text(params.dueTimeZone ?? existing?.due_timezone) || DEFAULT_DUE_TIME_ZONE;
  return {
    ...existing,
    course_id: text(params.courseId ?? existing?.course_id),
    name: text(params.name),
    due_date: normalizeDateString(dueDate),
    due_time: nullableText(params.dueTime),
    due_timezone: timeZone,
    status: assignmentStatus(dueDate, timeZone, params.status),
    description: nullableText(params.description),
  };
}

function buildClassSession(params: Params, existing?: Row): Row {
  return {
    ...existing,
    course_id: text(params.courseId ?? existing?.course_id),
    day: text(params.day),
    start_time: text(params.startTime),
    end_time: text(params.endTime),
    location: nullableText(params.location),
  };
}

function buildEvent(params: Params, existing?: Row): Row {
  const date = normalizeDateString(text(params.date ?? existing?.event_date));
  const endDate = params.endDate ? normalizeDateString(String(params.endDate)) : null;
  const courseId = nullableText(params.courseId);
  return {
    ...existing,
    title: text(params.title),
    event_date: date,
    end_date: endDate && endDate !== date ? endDate : null,
    event_time: nullableText(params.time),
    end_time: nullableText(params.endTime),
    event_timezone: text(params.timeZone) || DEFAULT_DUE_TIME_ZONE,
    description: nullableText(params.description),
    course_id: courseId,
    academic_kind: courseId && params.academicKind === 'class' ? 'class' : null,
  };
}

function buildNote(params: Params, existing?: Row): Row {
  const now = new Date().toISOString();
  return {
    ...existing,
    course_id: nullableText(params.courseId),
    title: text(params.title),
    content: typeof params.content === 'string' ? params.content : '',
    created_at: text(existing?.created_at) || now,
    updated_at: now,
  };
}

function buildCourseLink(params: Params, existing?: Row): Row {
  return {
    ...existing,
    course_id: text(params.courseId ?? existing?.course_id),
    label: text(params.label),
    url: text(params.url),
    created_at: text(existing?.created_at) || new Date().toISOString(),
  };
}

const builders: Record<OfflineEntity, (params: Params, existing?: Row) => Row> = {
  course: buildCourse,
  assignment: buildAssignment,
  classSession: buildClassSession,
  event: buildEvent,
  note: buildNote,
  courseLink: buildCourseLink,
};

export function buildRow(entity: OfflineEntity, params: Params, existing?: Row): Row {
  return builders[entity](params, existing);
}

function compare(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''));
}

/** Keeps a patched cache in the order the matching SQL `ORDER BY` would produce. */
export function sortRows(entity: OfflineEntity, rows: Row[]): Row[] {
  const sorted = [...rows];
  switch (entity) {
    case 'course':
      return sorted.sort((a, b) => compare(a.code, b.code));
    case 'assignment':
      return sorted.sort((a, b) => compare(a.due_date, b.due_date) || compare(a.due_time, b.due_time));
    case 'event':
      return sorted.sort((a, b) => compare(a.event_date, b.event_date) || compare(a.event_time, b.event_time));
    case 'note':
      return sorted.sort((a, b) => compare(b.updated_at, a.updated_at));
    case 'courseLink':
      return sorted.sort((a, b) => compare(a.created_at, b.created_at));
    default:
      return sorted.sort((a, b) => compare(a.id, b.id));
  }
}
