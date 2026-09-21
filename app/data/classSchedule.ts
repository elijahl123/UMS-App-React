import {
  getBrowserTimeZone,
  isoDateInTimeZone,
  normalizeTimeZone,
  timeInTimeZone,
  timeZoneAbbreviation,
  zonedDateTimeToUtc,
} from '@/lib/timeZones';
import type { ClassDay, ClassSession, Course, Note } from '@/app/data/types';

export const dayLabels: Record<ClassDay, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

export const dayOrder: ClassDay[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function todayDayName(date = new Date()): ClassDay {
  return dayOrder[date.getDay()];
}

export function formatLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createDailyClassNoteTitle(course: Course, date = new Date()): string {
  return `${course.name} Notes for ${formatLocalDateKey(date)}`;
}

export function findDailyClassNote(notes: Note[], course: Course, date = new Date()): Note | undefined {
  const title = createDailyClassNoteTitle(course, date);
  return notes.find((note) => note.title === title);
}

/** `09:00`, `09:00:00` and `9:00 a.m.` all parse; anything else does not. */
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?m\.?)?$/;

export function parseTimeToMinutes(time: string): number {
  const match = time.trim().toLowerCase().match(CLOCK_PATTERN);
  if (!match) return 0;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];

  if (meridiem === 'p' && hours !== 12) hours += 12;
  if (meridiem === 'a' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export function formatTimeDisplay(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return time;

  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours < 12 ? 'a.m.' : 'p.m.';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;

  return `${displayHour}:${minutes} ${period}`;
}

/** Coerces `HH:MM:SS` and `h:MM a.m.` into `HH:MM`; anything unparseable is left alone. */
export function normalizeClockTime(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (!CLOCK_PATTERN.test(trimmed.toLowerCase())) return value;

  const minutes = parseTimeToMinutes(trimmed);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function weekdayOfIsoDate(isoDate: string): ClassDay {
  const [year, month, day] = isoDate.split('-').map(Number);
  return dayOrder[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** The next date (on or after `reference`) whose weekday reads `day` in `timeZone`. */
function nextOccurrenceIsoDate(day: ClassDay, timeZone: string, reference: Date): string {
  const referenceIso = isoDateInTimeZone(reference, timeZone);
  const delta = (dayOrder.indexOf(day) - dayOrder.indexOf(weekdayOfIsoDate(referenceIso)) + 7) % 7;
  return addDaysToIsoDate(referenceIso, delta);
}

export interface WeeklyClassTime {
  day: ClassDay;
  startTime: string;
  endTime: string;
}

/**
 * Re-expresses a weekly `day` + `start`/`end` pair from `fromTimeZone` in
 * `toTimeZone`, shifting the weekday when the conversion crosses midnight.
 *
 * The conversion is anchored on the occurrence nearest `reference`, so a
 * recurring session read far from today can sit an hour off across a daylight
 * saving boundary. That matches how the rest of the weekly grid behaves.
 */
export function shiftWeeklyClassTime(
  time: WeeklyClassTime,
  fromTimeZone: string | null | undefined,
  toTimeZone: string,
  reference = new Date()
): WeeklyClassTime {
  const startTime = normalizeClockTime(time.startTime);
  const endTime = normalizeClockTime(time.endTime);
  const source = (fromTimeZone ?? '').trim();
  const target = normalizeTimeZone(toTimeZone);

  // No stored zone means a floating time: it reads the same wherever you are.
  if (!source || normalizeTimeZone(source) === target) return { day: time.day, startTime, endTime };
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { day: time.day, startTime, endTime };
  }

  const occurrence = nextOccurrenceIsoDate(time.day, normalizeTimeZone(source), reference);
  const startInstant = zonedDateTimeToUtc(occurrence, startTime, source);
  const endInstant = zonedDateTimeToUtc(occurrence, endTime, source);
  const startIso = isoDateInTimeZone(startInstant, target);
  const endIso = isoDateInTimeZone(endInstant, target);

  return {
    day: weekdayOfIsoDate(startIso),
    startTime: timeInTimeZone(startInstant, target),
    // A block that spills past midnight locally has nowhere to go on a weekly
    // grid keyed by weekday, so it stops at the end of the day it starts on.
    endTime: endIso === startIso ? timeInTimeZone(endInstant, target) : '23:59',
  };
}

export interface StoredClassSessionTime {
  day: ClassDay;
  startTime: string;
  endTime: string;
  timeZone?: string | null;
}

/** Stored day/times of a session, i.e. how they read in the session's own zone. */
export function scheduledClassTime(session: ClassSession): WeeklyClassTime & { timeZone?: string } {
  return {
    day: session.scheduledDay ?? session.day,
    startTime: normalizeClockTime(session.scheduledStartTime ?? session.startTime),
    endTime: normalizeClockTime(session.scheduledEndTime ?? session.endTime),
    timeZone: session.timeZone,
  };
}

type LocalizedClassSession<T> = Omit<T, 'timeZone'> &
  Pick<
    ClassSession,
    'day' | 'startTime' | 'endTime' | 'timeZone' | 'scheduledDay' | 'scheduledStartTime' | 'scheduledEndTime'
  >;

/** Adds the viewer-zone `day`/`startTime`/`endTime` a stored session is displayed with. */
export function localizeClassSession<T extends StoredClassSessionTime>(
  session: T,
  viewerTimeZone = getBrowserTimeZone(),
  reference = new Date()
): LocalizedClassSession<T> {
  const scheduledDay = session.day;
  const scheduledStartTime = normalizeClockTime(session.startTime);
  const scheduledEndTime = normalizeClockTime(session.endTime);
  const timeZone = session.timeZone?.trim() || undefined;
  const viewed = shiftWeeklyClassTime(
    { day: scheduledDay, startTime: scheduledStartTime, endTime: scheduledEndTime },
    timeZone,
    viewerTimeZone,
    reference
  );

  return {
    ...session,
    day: viewed.day,
    startTime: viewed.startTime,
    endTime: viewed.endTime,
    timeZone,
    scheduledDay,
    scheduledStartTime,
    scheduledEndTime,
  };
}

/** True when the session is stored in a zone other than the one being viewed in. */
export function isClassSessionRezoned(session: ClassSession, viewerTimeZone = getBrowserTimeZone()): boolean {
  if (!session.timeZone) return false;
  return normalizeTimeZone(session.timeZone) !== normalizeTimeZone(viewerTimeZone);
}

/** How the session reads where it is held, e.g. `Friday 9:00 a.m. - 10:15 a.m. EST`. */
export function scheduledClassTimeLabel(session: ClassSession): string | null {
  if (!session.timeZone) return null;
  const scheduled = scheduledClassTime(session);
  const range = `${formatTimeDisplay(scheduled.startTime)} - ${formatTimeDisplay(scheduled.endTime)}`;
  return `${dayLabels[scheduled.day]} ${range} ${timeZoneAbbreviation(session.timeZone)}`;
}

/** Sessions derived from imported academic calendar events are read-only on the schedule page. */
export function isImportedClassSession(session: ClassSession): boolean {
  return session.id.startsWith('academic-event:');
}

export interface ClassFocus {
  session: ClassSession;
  course?: Course;
  status: 'current' | 'next';
}

export function getTodayClassFocus(
  sessions: ClassSession[],
  courses: Course[],
  now = new Date()
): ClassFocus | null {
  const day = todayDayName(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todaysSessions = sessions
    .filter((session) => session.day === day)
    .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

  const current = todaysSessions.find((session) => {
    const start = parseTimeToMinutes(session.startTime);
    const end = parseTimeToMinutes(session.endTime);
    return nowMinutes >= start && nowMinutes < end;
  });

  if (current) {
    return {
      session: current,
      course: courses.find((course) => course.id === current.courseId),
      status: 'current',
    };
  }

  const next = todaysSessions.find((session) => parseTimeToMinutes(session.startTime) >= nowMinutes);
  if (!next) return null;

  return {
    session: next,
    course: courses.find((course) => course.id === next.courseId),
    status: 'next',
  };
}
