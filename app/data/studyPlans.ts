import type {
  ExamType,
  PhasePreset,
  StudyDay,
  StudyDifficulty,
  StudyPhase,
  StudyPlanMode,
  StudyPlanSummary,
  StudyTargetType,
  StudyTask,
} from './types';

export const STUDY_PHASE_MINUTES = {
  light: { learn: 30, practice: 15, recall: 15, review: 60 },
  medium: { learn: 60, practice: 45, recall: 15, review: 120 },
  heavy: { learn: 90, practice: 60, recall: 30, review: 180 },
} as const;

// Mirrors PHASE_LABELS in server/studyPlanScheduler.ts, which is where task
// titles are actually derived. Keep the two in step.
export const STUDY_PHASE_LABELS: Record<PhasePreset, Record<StudyPhase, string>> = {
  study: {
    learn: 'Learn & review',
    practice: 'Practice',
    recall: 'Recall',
    review: 'Review',
  },
  general: {
    learn: 'First pass',
    practice: 'Deepen',
    recall: 'Review',
    review: 'Work through',
  },
};

export function studyPhaseLabel(phase: StudyPhase, preset: PhasePreset = 'study'): string {
  return STUDY_PHASE_LABELS[preset]?.[phase] ?? STUDY_PHASE_LABELS.study[phase];
}

export const STUDY_DIFFICULTIES: StudyDifficulty[] = ['light', 'medium', 'heavy'];

/** Total time one topic is given, across all of its tasks. */
export function topicWorkloadMinutes(difficulty: StudyDifficulty, mode: StudyPlanMode = 'phases'): number {
  const phases = STUDY_PHASE_MINUTES[difficulty];
  return mode === 'single' ? phases.review : phases.learn + phases.practice + phases.recall;
}

const TOPIC_LIST_MARKER = /^(?:[-*•]\s+|\d+[.)]\s+)/;
// A section prefix only counts when something follows it: a separator plus text,
// a period plus a space, or plain whitespace. "Section 2.1: Limits" therefore
// stays whole rather than collapsing to "1: Limits".
const TOPIC_SECTION_PREFIX =
  /^(?:week|topic|module|chapter|part|section|day|unit)\s+\d+(?:\s*[:\-–—]\s*|\s*\.\s+|\s+)/i;

/**
 * Turns pasted outlines into topic titles. "Week 1: Graph algorithms" becomes
 * "Graph algorithms", while a line that is only a section prefix ("Chapter 1")
 * is kept whole, since that is the name the student meant to use.
 */
export function parseStudyTopics(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => {
      const withoutMarker = line.trim().replace(TOPIC_LIST_MARKER, '').trim();
      const withoutPrefix = withoutMarker.replace(TOPIC_SECTION_PREFIX, '').trim();
      return withoutPrefix || withoutMarker;
    })
    .filter(Boolean)
    .slice(0, 100);
}

export function targetTypeLabel(targetType: StudyTargetType, examType?: ExamType): string {
  if (targetType === 'exam') return examType === 'midterm' ? 'Midterm' : 'Final exam';
  if (targetType === 'assignment') return 'Assignment';
  if (targetType === 'project') return 'Project';
  return 'Plan';
}

export function targetDateLabel(targetType: StudyTargetType): string {
  if (targetType === 'exam') return 'Exam';
  if (targetType === 'general') return 'Target';
  return 'Due';
}

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
  targetDate: string,
  availability: Array<{ weekday: number; minutes: number }>
): number {
  const byWeekday = new Map(availability.map((item) => [item.weekday, item.minutes]));
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${targetDate}T00:00:00Z`);
  let total = 0;
  while (cursor < end) {
    total += byWeekday.get(cursor.getUTCDay()) ?? 0;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}
