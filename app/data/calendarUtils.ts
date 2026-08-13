import type {
  Assignment,
  CalendarEvent,
  ClassSession,
  Course,
  StudyCalendarData,
  StudyDay,
  StudyPlanSummary,
} from '@/app/data/types';
import { getCourseColor, type CourseColor } from '@/app/data/courseColors';
import { groupStudyDays } from '@/app/data/studyPlans';

export type CalendarItemType = 'assignment' | 'class' | 'event' | 'study' | 'exam';
export type CalendarSegmentPosition = 'single' | 'start' | 'middle' | 'end';

export const CALENDAR_ITEM_TYPES: CalendarItemType[] = ['assignment', 'class', 'study', 'exam', 'event'];

export const CALENDAR_TYPE_LABELS: Record<CalendarItemType, string> = {
  assignment: 'Assignment',
  class: 'Course time',
  event: 'Event',
  study: 'Study plan',
  exam: 'Exam',
};

export interface CalendarItem {
  id: string;
  sourceId: string;
  type: CalendarItemType;
  typeLabel: string;
  title: string;
  date: string;
  time?: string;
  color: string;
  textColor: string;
  borderColor: string;
  course?: Course;
  rangeId: string;
  rangeStart: string;
  rangeEnd: string;
  segmentPosition: CalendarSegmentPosition;
  isMultiDay: boolean;
  raw: Assignment | ClassSession | CalendarEvent | StudyDay | StudyPlanSummary;
}

const dayNames: ClassSession['day'][] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const eventColors: CourseColor = {
  bg: 'var(--calendar-event-bg)',
  text: 'var(--calendar-event-text)',
  border: 'var(--calendar-event-border)',
};
const typeOrder: Record<CalendarItemType, number> = {
  exam: 0,
  event: 1,
  assignment: 2,
  study: 3,
  class: 4,
};

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addIsoDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getMonthGridDates(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) =>
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
  );
}

function segmentPosition(date: string, start: string, end: string): CalendarSegmentPosition {
  if (start === end) return 'single';
  if (date === start) return 'start';
  if (date === end) return 'end';
  return 'middle';
}

function datesInRange(start: string, end: string, visibleStart: string, visibleEnd: string): string[] {
  const clippedStart = start < visibleStart ? visibleStart : start;
  const clippedEnd = end > visibleEnd ? visibleEnd : end;
  if (clippedStart > clippedEnd) return [];
  const dates: string[] = [];
  for (let date = clippedStart; date <= clippedEnd; date = addIsoDays(date, 1)) dates.push(date);
  return dates;
}

function sortItems(items: CalendarItem[]): CalendarItem[] {
  return items.sort((a, b) => {
    if (a.isMultiDay !== b.isMultiDay) return a.isMultiDay ? -1 : 1;
    if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
    return `${a.time ?? '99:99'} ${a.title} ${a.id}`.localeCompare(`${b.time ?? '99:99'} ${b.title} ${b.id}`);
  });
}

export function buildCalendarItems(
  year: number,
  month: number,
  assignments: Assignment[],
  classSessions: ClassSession[],
  events: CalendarEvent[],
  courses: Course[],
  studyCalendar?: StudyCalendarData
): Map<string, CalendarItem[]> {
  const getCourse = (courseId: string) => courses.find((course) => course.id === courseId);
  const map = new Map<string, CalendarItem[]>();
  const gridDates = getMonthGridDates(year, month);
  const visibleStart = toIsoDate(gridDates[0]);
  const visibleEnd = toIsoDate(gridDates[gridDates.length - 1]);

  const addItem = (
    date: string,
    base: Omit<CalendarItem, 'id' | 'date' | 'segmentPosition' | 'isMultiDay' | 'typeLabel'>
  ) => {
    const item: CalendarItem = {
      ...base,
      id: `${base.rangeId}:${date}`,
      date,
      typeLabel: CALENDAR_TYPE_LABELS[base.type],
      segmentPosition: segmentPosition(date, base.rangeStart, base.rangeEnd),
      isMultiDay: base.rangeStart !== base.rangeEnd,
    };
    map.set(date, [...(map.get(date) ?? []), item]);
  };

  assignments.forEach((assignment) => {
    const course = getCourse(assignment.courseId);
    const colors = getCourseColor(course?.color);
    addItem(assignment.dueDate, {
      sourceId: assignment.id,
      rangeId: `assignment-${assignment.id}`,
      rangeStart: assignment.dueDate,
      rangeEnd: assignment.dueDate,
      type: 'assignment',
      title: `${course ? `${course.code}: ` : ''}${assignment.name}`,
      time: assignment.dueTime,
      color: colors.bg,
      textColor: colors.text,
      borderColor: colors.border,
      course,
      raw: assignment,
    });
  });

  events.forEach((event) => {
    const rangeEnd = event.endDate && event.endDate >= event.date ? event.endDate : event.date;
    datesInRange(event.date, rangeEnd, visibleStart, visibleEnd).forEach((date) => {
      addItem(date, {
        sourceId: event.id,
        rangeId: `event-${event.id}`,
        rangeStart: event.date,
        rangeEnd,
        type: 'event',
        title: event.title,
        time: date === event.date ? event.time : undefined,
        color: eventColors.bg,
        textColor: eventColors.text,
        borderColor: eventColors.border,
        raw: event,
      });
    });
  });

  const studyPlans = studyCalendar?.plans ?? [];
  const studyTasks = studyCalendar?.tasks ?? [];
  studyPlans.filter((plan) => !plan.archived).forEach((plan) => {
    const course = getCourse(plan.courseId);
    const colors = getCourseColor(course?.color ?? plan.courseColor);
    const days = groupStudyDays({
      id: plan.id,
      courseId: plan.courseId,
      tasks: studyTasks.filter((task) => task.planId === plan.id),
    }).sort((a, b) => a.date.localeCompare(b.date));

    let sequenceStart = 0;
    days.forEach((day, index) => {
      const nextDay = days[index + 1];
      const isSequenceEnd = !nextDay || nextDay.date !== addIsoDays(day.date, 1);
      if (!isSequenceEnd) return;
      const rangeStart = days[sequenceStart].date;
      const rangeEnd = day.date;
      for (let dayIndex = sequenceStart; dayIndex <= index; dayIndex += 1) {
        const studyDay = days[dayIndex];
        addItem(studyDay.date, {
          sourceId: plan.id,
          rangeId: `study-${plan.id}-${rangeStart}`,
          rangeStart,
          rangeEnd,
          type: 'study',
          title: `${course?.code ?? plan.courseCode}: Study plan`,
          color: colors.bg,
          textColor: colors.text,
          borderColor: colors.border,
          course,
          raw: studyDay,
        });
      }
      sequenceStart = index + 1;
    });

    if (plan.targetDate >= visibleStart && plan.targetDate <= visibleEnd) {
      const targetLabel = plan.targetType === 'exam'
        ? (plan.examType === 'final' ? 'Final exam' : 'Midterm exam')
        : plan.targetTitle;
      addItem(plan.targetDate, {
        sourceId: plan.id,
        rangeId: `target-${plan.id}`,
        rangeStart: plan.targetDate,
        rangeEnd: plan.targetDate,
        type: 'exam',
        title: `${course?.code ?? plan.courseCode}: ${targetLabel}`,
        color: colors.bg,
        textColor: colors.text,
        borderColor: colors.border,
        course,
        raw: plan,
      });
    }
  });

  gridDates.forEach((date) => {
    const dayName = dayNames[date.getDay()];
    const iso = toIsoDate(date);
    classSessions.filter((session) => session.day === dayName).forEach((session) => {
      const course = getCourse(session.courseId);
      const colors = getCourseColor(course?.color);
      addItem(iso, {
        sourceId: session.id,
        rangeId: `class-${session.id}-${iso}`,
        rangeStart: iso,
        rangeEnd: iso,
        type: 'class',
        title: course?.code ?? 'Class',
        time: session.startTime,
        color: colors.bg,
        textColor: colors.text,
        borderColor: colors.border,
        course,
        raw: session,
      });
    });
  });

  map.forEach((items, date) => map.set(date, sortItems(items)));
  return map;
}
