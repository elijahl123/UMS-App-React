export type StudyDifficulty = 'light' | 'medium' | 'heavy';
export type StudyPhase = 'learn' | 'practice' | 'recall';

export type ScheduleTopic = {
  id: string;
  title: string;
  difficulty: StudyDifficulty;
};

export type ScheduleAvailability = {
  weekday: number;
  minutes: number;
};

export type ScheduleJob = {
  topicId: string;
  topicTitle: string;
  phase: StudyPhase;
  minutes: number;
};

export type ScheduledTask = ScheduleJob & {
  scheduledDate: string;
  title: string;
  sequence: number;
};

export class StudyPlanCapacityError extends Error {
  requiredMinutes: number;
  availableMinutes: number;

  constructor(requiredMinutes: number, availableMinutes: number) {
    super('INSUFFICIENT_STUDY_CAPACITY');
    this.requiredMinutes = requiredMinutes;
    this.availableMinutes = availableMinutes;
  }
}

export const PHASE_MINUTES: Record<StudyDifficulty, Record<StudyPhase, number>> = {
  light: { learn: 30, practice: 15, recall: 15 },
  medium: { learn: 60, practice: 45, recall: 15 },
  heavy: { learn: 90, practice: 60, recall: 30 },
};

const PHASE_LABELS: Record<StudyPhase, string> = {
  learn: 'Learn & review',
  practice: 'Practice',
  recall: 'Recall',
};

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function enumerateStudyDates(
  startDate: string,
  examDate: string,
  availability: ScheduleAvailability[]
): Array<{ date: string; minutes: number }> {
  const minutesByWeekday = new Map(availability.map((entry) => [entry.weekday, Math.floor(entry.minutes / 15) * 15]));
  const cursor = parseIsoDate(startDate);
  const end = parseIsoDate(examDate);
  const dates: Array<{ date: string; minutes: number }> = [];

  while (cursor < end) {
    const minutes = minutesByWeekday.get(cursor.getUTCDay()) ?? 0;
    if (minutes > 0) {
      dates.push({ date: toIsoDate(cursor), minutes });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function buildStudyJobs(topics: ScheduleTopic[]): ScheduleJob[] {
  const phases: StudyPhase[] = ['learn', 'practice', 'recall'];
  return phases.flatMap((phase) =>
    topics.map((topic) => ({
      topicId: topic.id,
      topicTitle: topic.title,
      phase,
      minutes: PHASE_MINUTES[topic.difficulty][phase],
    }))
  );
}

function dailyQuotas(capacities: number[], requiredMinutes: number): number[] {
  const totalCapacity = capacities.reduce((sum, value) => sum + value, 0);
  let allocated = 0;
  let cumulativeCapacity = 0;

  return capacities.map((capacity, index) => {
    cumulativeCapacity += capacity;
    const isLast = index === capacities.length - 1;
    const cumulativeTarget = isLast
      ? requiredMinutes
      : Math.round(((requiredMinutes * cumulativeCapacity) / totalCapacity) / 15) * 15;
    const quota = Math.min(capacity, Math.max(0, cumulativeTarget - allocated));
    allocated += quota;
    return quota;
  });
}

export function scheduleStudyJobs(
  startDate: string,
  examDate: string,
  availability: ScheduleAvailability[],
  jobs: ScheduleJob[]
): ScheduledTask[] {
  const studyDates = enumerateStudyDates(startDate, examDate, availability);
  const requiredMinutes = jobs.reduce((sum, job) => sum + job.minutes, 0);
  const availableMinutes = studyDates.reduce((sum, day) => sum + day.minutes, 0);

  if (requiredMinutes > availableMinutes) {
    throw new StudyPlanCapacityError(requiredMinutes, availableMinutes);
  }

  if (requiredMinutes === 0) return [];

  const quotas = dailyQuotas(
    studyDates.map((day) => day.minutes),
    requiredMinutes
  );
  const tasks: ScheduledTask[] = [];
  let jobIndex = 0;
  let jobRemaining = jobs[0]?.minutes ?? 0;
  let sequence = 0;

  studyDates.forEach((day, dayIndex) => {
    let dayRemaining = quotas[dayIndex];

    while (dayRemaining > 0 && jobIndex < jobs.length) {
      const job = jobs[jobIndex];
      const allocated = Math.min(dayRemaining, jobRemaining);
      const previous = tasks[tasks.length - 1];

      if (
        previous &&
        previous.scheduledDate === day.date &&
        previous.topicId === job.topicId &&
        previous.phase === job.phase
      ) {
        previous.minutes += allocated;
      } else {
        tasks.push({
          ...job,
          minutes: allocated,
          scheduledDate: day.date,
          title: `${PHASE_LABELS[job.phase]}: ${job.topicTitle}`,
          sequence,
        });
        sequence += 1;
      }

      dayRemaining -= allocated;
      jobRemaining -= allocated;
      if (jobRemaining === 0) {
        jobIndex += 1;
        jobRemaining = jobs[jobIndex]?.minutes ?? 0;
      }
    }
  });

  return tasks;
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
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

export type EvenWorkTask = {
  scheduledDate: string;
  minutes: number;
  sequence: number;
};

export type EvenWorkSchedule = {
  tasks: EvenWorkTask[];
  scheduledMinutes: number;
  unscheduledMinutes: number;
  availableMinutes: number;
  explanation: string;
  schedulerVersion: number;
};

export function scheduleEvenWork(params: {
  startDate: string;
  dueDate: string;
  estimatedMinutes: number;
  availableWeekdays: number[];
  maximumMinutesPerDay: number;
}): EvenWorkSchedule {
  const weekdays = new Set(params.availableWeekdays);
  const days: string[] = [];
  const cursor = parseIsoDate(params.startDate);
  const due = parseIsoDate(params.dueDate);
  while (cursor < due) {
    if (weekdays.has(cursor.getUTCDay())) days.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const capUnits = Math.floor(params.maximumMinutesPerDay / 15);
  const requestedUnits = Math.floor(params.estimatedMinutes / 15);
  const availableUnits = days.length * capUnits;
  const scheduledUnits = Math.min(requestedUnits, availableUnits);
  const baseUnits = days.length > 0 ? Math.floor(scheduledUnits / days.length) : 0;
  let remainder = days.length > 0 ? scheduledUnits % days.length : 0;
  const tasks = days.flatMap((date, index) => {
    const units = baseUnits + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return units > 0 ? [{ scheduledDate: date, minutes: units * 15, sequence: index }] : [];
  });
  const scheduledMinutes = scheduledUnits * 15;
  return {
    tasks,
    scheduledMinutes,
    unscheduledMinutes: params.estimatedMinutes - scheduledMinutes,
    availableMinutes: availableUnits * 15,
    explanation: 'Work is divided evenly across selected weekdays before the due date in 15-minute units; rounding remainder is assigned to earlier days.',
    schedulerVersion: 2,
  };
}
