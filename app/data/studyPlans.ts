import type { StudyDay, StudyPlanSummary, StudyTask } from './types';

export const STUDY_PHASE_MINUTES = {
  light: { learn: 30, practice: 15, recall: 15, review: 60 },
  medium: { learn: 60, practice: 45, recall: 15, review: 120 },
  heavy: { learn: 90, practice: 60, recall: 30, review: 180 },
} as const;

export function todayForTimeZone(timeZone: string, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isStudyPlanBehind(plan: StudyPlanSummary, today = todayForTimeZone(plan.timeZone)): boolean {
  return plan.targetDate > today && plan.overdueTasks > 0;
}

export function studyPlanProgress(plan: StudyPlanSummary): { completed: number; total: number; percent: number } {
  const completed = plan.completedTasks;
  const total = plan.totalTasks;
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}

export function groupStudyDays(plan: Pick<StudyPlanSummary, 'id' | 'courseId'> & { tasks: StudyTask[] }): StudyDay[] {
  const grouped = new Map<string, StudyTask[]>();
  plan.tasks.forEach((task) => grouped.set(task.scheduledDate, [...(grouped.get(task.scheduledDate) ?? []), task]));
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tasks]) => ({
      planId: plan.id,
      courseId: plan.courseId,
      date,
      estimatedMinutes: tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
      tasks,
    }));
}

export function formatStudyMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatStudyDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', options ?? {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function availableStudyMinutes(
  startDate: string,
  examDate: string,
  availability: Array<{ weekday: number; minutes: number }>
): number {
  const byWeekday = new Map(availability.map((item) => [item.weekday, item.minutes]));
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${examDate}T00:00:00Z`);
  let total = 0;
  while (cursor < end) {
    total += byWeekday.get(cursor.getUTCDay()) ?? 0;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}
