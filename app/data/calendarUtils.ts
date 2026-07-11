import type { Assignment, CalendarEvent, ClassSession, Course } from '@/app/data/types';
import { getCourseColor, type CourseColor } from '@/app/data/courseColors';

export interface CalendarItem {
  id: string;
  type: 'assignment' | 'class' | 'event';
  title: string;
  date: string; // ISO date (yyyy-mm-dd)
  time?: string;
  color: string;
  textColor: string;
  borderColor: string;
  course?: Course;
  raw: Assignment | ClassSession | CalendarEvent;
}

const dayNames: ClassSession['day'][] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMonthGridDates(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    dates.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return dates;
}

export function buildCalendarItems(
  year: number,
  month: number,
  assignments: Assignment[],
  classSessions: ClassSession[],
  events: CalendarEvent[],
  courses: Course[]
): Map<string, CalendarItem[]> {
  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);
  const map = new Map<string, CalendarItem[]>();

  const addItem = (dateIso: string, item: CalendarItem) => {
    const existing = map.get(dateIso) ?? [];
    existing.push(item);
    map.set(dateIso, existing);
  };

  assignments.forEach((a) => {
    const course = getCourse(a.courseId);
    const colors = getCourseColor(course?.color);
    addItem(a.dueDate, {
      id: `assignment-${a.id}`,
      type: 'assignment',
      title: `${course ? `${course.code}: ` : ''}${a.name}`,
      date: a.dueDate,
      time: a.dueTime,
      color: colors.bg,
      textColor: colors.text,
      borderColor: colors.border,
      course,
      raw: a,
    });
  });

  events.forEach((e) => {
    const colors: CourseColor = { bg: 'var(--course-blue)', text: '#1F3A66', border: '#9fb6e6' };
    addItem(e.date, {
      id: `event-${e.id}`,
      type: 'event',
      title: e.title,
      date: e.date,
      time: e.time,
      color: colors.bg,
      textColor: colors.text,
      borderColor: colors.border,
      raw: e,
    });
  });

  const gridDates = getMonthGridDates(year, month);
  gridDates.forEach((date) => {
    const dayName = dayNames[date.getDay()];
    const iso = toIsoDate(date);
    classSessions
      .filter((s) => s.day === dayName)
      .forEach((s) => {
        const course = getCourse(s.courseId);
        const colors = getCourseColor(course?.color);
        addItem(iso, {
          id: `class-${s.id}-${iso}`,
          type: 'class',
          title: `${course ? course.code : 'Class'}`,
          date: iso,
          time: s.startTime,
          color: colors.bg,
          textColor: colors.text,
          borderColor: colors.border,
          course,
          raw: s,
        });
      });
  });

  return map;
}
