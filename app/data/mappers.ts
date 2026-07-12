import type { Assignment, AssignmentStatus, AppUser, CalendarEvent, ClassSession, Course, CourseLink, Note } from '@/app/data/types';
import { DEFAULT_DUE_TIME_ZONE, normalizeDateString, normalizeTimeString } from '@/app/data/assignmentDates';

interface DbCourse {
  id: number;
  code: string;
  name: string;
  color: string;
}

interface DbAssignment {
  id: number;
  course_id: number;
  name: string;
  due_date: string;
  due_time?: string | null;
  due_timezone?: string | null;
  status: string;
  description: string | null;
}

interface DbClassSession {
  id: number;
  course_id: number;
  day: string;
  start_time: string;
  end_time: string;
}

interface DbEvent {
  id: number;
  title: string;
  event_date: string;
  event_time: string | null;
  description: string | null;
}

interface DbNote {
  id: number;
  course_id: number | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface DbCourseLink {
  id: number;
  course_id: number;
  label: string;
  url: string;
  created_at: string;
}

export function mapCourse(row: DbCourse): Course {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    color: row.color,
  };
}

export function mapAssignment(row: DbAssignment): Assignment {
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    name: row.name,
    dueDate: normalizeDateString(row.due_date),
    dueTime: normalizeTimeString(row.due_time),
    dueTimeZone: row.due_timezone || DEFAULT_DUE_TIME_ZONE,
    status: row.status as AssignmentStatus,
    description: row.description ?? undefined,
  };
}

export function mapClassSession(row: DbClassSession): ClassSession {
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    day: row.day as ClassSession['day'],
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

export function mapEvent(row: DbEvent): CalendarEvent {
  return {
    id: String(row.id),
    title: row.title,
    date: row.event_date.split('T')[0], // Extract date part from ISO timestamp
    time: row.event_time ?? undefined,
    description: row.description ?? undefined,
  };
}

export function mapNote(row: DbNote): Note {
  return {
    id: String(row.id),
    courseId: row.course_id !== null ? String(row.course_id) : undefined,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCourseLink(row: DbCourseLink): CourseLink {
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    label: row.label,
    url: row.url,
    createdAt: row.created_at,
  };
}

interface FirebaseUser {
  localId: string;
  email: string;
  displayName?: string;
  emailVerified?: boolean;
  createdAt?: string;
}

export function mapFirebaseUser(row: FirebaseUser): AppUser {
  const displayName = (row.displayName ?? '').trim();
  const [firstName = '', ...rest] = displayName.split(' ').filter(Boolean);
  const lastName = rest.join(' ');
  return {
    id: row.localId,
    email: row.email,
    firstName,
    lastName,
    createdAt: row.createdAt ? new Date(Number(row.createdAt)).toISOString() : new Date().toISOString(),
    emailVerified: row.emailVerified ?? false,
  };
}
