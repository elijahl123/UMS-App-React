import type { ClassSession, Course, Note } from '@/app/data/types';

export const dayLabels: Record<ClassSession['day'], string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

export function todayDayName(date = new Date()): ClassSession['day'] {
  const days: ClassSession['day'][] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
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

export function parseTimeToMinutes(time: string): number {
  const normalized = time.trim().toLowerCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?m\.?)?$/);
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
