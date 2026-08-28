export type StudyDifficulty = 'light' | 'medium' | 'heavy';
export type StudyPhase = 'learn' | 'practice' | 'recall' | 'review';
export type StudyPlanMode = 'phases' | 'single';
export type PhasePreset = 'study' | 'general';

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
  light: { learn: 30, practice: 15, recall: 15, review: 60 },
  medium: { learn: 60, practice: 45, recall: 15, review: 120 },
  heavy: { learn: 90, practice: 60, recall: 30, review: 180 },
};

export const PHASE_LABELS: Record<PhasePreset, Record<StudyPhase, string>> = {
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

export function studyTaskTitle(phase: StudyPhase, topicTitle: string, preset: PhasePreset = 'study'): string {
  return `${PHASE_LABELS[preset][phase]}: ${topicTitle}`;
}

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

export function buildStudyJobs(topics: ScheduleTopic[], mode: StudyPlanMode = 'phases'): ScheduleJob[] {
  const phases: StudyPhase[] = mode === 'single' ? ['review'] : ['learn', 'practice', 'recall'];
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

export type ScheduleStudyJobsOptions = {
  preset?: PhasePreset;
  /**
   * Schedule as much as fits and leave the rest unscheduled instead of throwing.
   * The caller reports the shortfall as the plan's unscheduled minutes.
   */
  allowPartial?: boolean;
};

export function scheduleStudyJobs(
  startDate: string,
  examDate: string,
  availability: ScheduleAvailability[],
  jobs: ScheduleJob[],
  options: ScheduleStudyJobsOptions = {}
): ScheduledTask[] {
  const preset = options.preset ?? 'study';
  const studyDates = enumerateStudyDates(startDate, examDate, availability);
  const totalJobMinutes = jobs.reduce((sum, job) => sum + job.minutes, 0);
  const availableMinutes = studyDates.reduce((sum, day) => sum + day.minutes, 0);

  if (totalJobMinutes > availableMinutes && !options.allowPartial) {
    throw new StudyPlanCapacityError(totalJobMinutes, availableMinutes);
  }

  const requiredMinutes = Math.min(totalJobMinutes, availableMinutes);
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
          title: studyTaskTitle(job.phase, job.topicTitle, preset),
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

export type RecoveryTaskInput = {
  id: string;
  topicId: string;
  topicTitle: string;
  topicPosition: number;
  phase: StudyPhase;
  title: string;
  titleOverride: string | null;
  scheduledDate: string;
  minutes: number;
  sequence: number;
  manuallyEdited: boolean;
};

export type RecoveryScheduledTask = {
  groupId: string;
  topicId: string;
  phase: StudyPhase;
  title: string;
  titleOverride: string | null;
  scheduledDate: string;
  minutes: number;
  sequence: number;
};

export type RecoveryOmissionGroup = {
  id: string;
  topicId: string;
  phase: StudyPhase;
  title: string;
  minutes: number;
  cascadesTo: string[];
};

export type RecoveryUnresolvedTask = {
  id: string;
  title: string;
  scheduledDate: string;
  minutes: number;
  reason: 'pinned_overdue' | 'pinned_over_capacity';
};

export type RecoveryDayChange = {
  date: string;
  capacityMinutes: number;
  beforeMinutes: number;
  afterMinutes: number;
};

export type RecoveryCapacityChange = {
  date: string;
  beforeMinutes: number;
  afterMinutes: number;
  addedMinutes: number;
};

export type RecoveryTaskChange = {
  groupId: string;
  title: string;
  minutes: number;
  fromDates: string[];
  toDates: string[];
  status: 'moved' | 'unchanged' | 'unscheduled';
};

export type StudyRecoveryPlan = {
  needsRecovery: boolean;
  canConfirm: boolean;
  reasons: Array<'overdue' | 'over_capacity' | 'unscheduled'>;
  requiredOmissionMinutes: number;
  shortfallMinutes: number;
  selectedOmissionMinutes: number;
  additionalMinutesPerDay: number;
  effectiveOmittedGroupIds: string[];
  recommendedOmittedGroupIds: string[];
  omissionGroups: RecoveryOmissionGroup[];
  scheduledTasks: RecoveryScheduledTask[];
  unresolvedTasks: RecoveryUnresolvedTask[];
  capacityChanges: RecoveryCapacityChange[];
  dayChanges: RecoveryDayChange[];
  taskChanges: RecoveryTaskChange[];
  totals: {
    before: {
      scheduledMinutes: number;
      overdueMinutes: number;
      overCapacityMinutes: number;
      unscheduledMinutes: number;
    };
    after: {
      scheduledMinutes: number;
      overdueMinutes: number;
      overCapacityMinutes: number;
      unscheduledMinutes: number;
    };
    movedMinutes: number;
  };
};

type RecoveryGroup = {
  id: string;
  topicId: string;
  topicPosition: number;
  phase: StudyPhase;
  title: string;
  titleOverride: string | null;
  minutes: number;
  beforeByDate: Map<string, number>;
};

function recoveryGroupId(topicId: string, phase: StudyPhase): string {
  return `${topicId}:${phase}`;
}

function recoveryPhaseOrder(phase: StudyPhase): number {
  return phase === 'learn' ? 0 : phase === 'practice' ? 1 : phase === 'recall' ? 2 : 3;
}

function recoveryQuotas(capacities: number[], requestedMinutes: number): number[] {
  const available = capacities.reduce((sum, value) => sum + value, 0);
  const scheduled = Math.min(available, requestedMinutes);
  if (available === 0 || scheduled === 0) return capacities.map(() => 0);
  let allocated = 0;
  let cumulativeCapacity = 0;
  return capacities.map((capacity, index) => {
    cumulativeCapacity += capacity;
    const isLast = index === capacities.length - 1;
    const target = isLast
      ? scheduled
      : Math.round(((scheduled * cumulativeCapacity) / available) / 15) * 15;
    const quota = Math.min(capacity, Math.max(0, target - allocated));
    allocated += quota;
    return quota;
  });
}

function minutesByDate(tasks: Array<{ scheduledDate: string; minutes: number }>): Map<string, number> {
  const result = new Map<string, number>();
  tasks.forEach((task) => result.set(task.scheduledDate, (result.get(task.scheduledDate) ?? 0) + task.minutes));
  return result;
}

/**
 * Builds a deterministic, previewable recovery schedule. Completed work is intentionally
 * absent from the input; manually edited work is present and treated as pinned.
 */
export function planStudyRecovery(params: {
  today: string;
  targetDate: string;
  availability: ScheduleAvailability[];
  tasks: RecoveryTaskInput[];
  unscheduledMinutes: number;
  omittedGroupIds?: string[];
  capacityOverrides?: Array<{ date: string; minutes: number }>;
  additionalMinutesPerDay?: number;
}): StudyRecoveryPlan {
  const availabilityByWeekday = new Map(params.availability.map((entry) => [entry.weekday, entry.minutes]));
  const pinned = params.tasks.filter((task) => task.manuallyEdited);
  const flexible = params.tasks.filter((task) => !task.manuallyEdited);
  const groupsById = new Map<string, RecoveryGroup>();

  flexible.forEach((task) => {
    const id = recoveryGroupId(task.topicId, task.phase);
    const current = groupsById.get(id) ?? {
      id,
      topicId: task.topicId,
      topicPosition: task.topicPosition,
      phase: task.phase,
      title: task.title,
      titleOverride: task.titleOverride,
      minutes: 0,
      beforeByDate: new Map<string, number>(),
    };
    current.minutes += task.minutes;
    current.beforeByDate.set(task.scheduledDate, (current.beforeByDate.get(task.scheduledDate) ?? 0) + task.minutes);
    groupsById.set(id, current);
  });

  const groups = [...groupsById.values()].sort(
    (a, b) => recoveryPhaseOrder(a.phase) - recoveryPhaseOrder(b.phase)
      || a.topicPosition - b.topicPosition
      || a.id.localeCompare(b.id)
  );
  if (params.unscheduledMinutes > 0 && groups.length > 0) {
    groups[groups.length - 1].minutes += params.unscheduledMinutes;
  }

  const omissionGroups: RecoveryOmissionGroup[] = groups.map((group) => ({
    id: group.id,
    topicId: group.topicId,
    phase: group.phase,
    title: group.title,
    minutes: group.minutes,
    cascadesTo: groups
      .filter((candidate) => candidate.topicId === group.topicId && recoveryPhaseOrder(candidate.phase) > recoveryPhaseOrder(group.phase))
      .map((candidate) => candidate.id),
  }));
  const validIds = new Set(groups.map((group) => group.id));
  const requestedOmissions = new Set((params.omittedGroupIds ?? []).filter((id) => validIds.has(id)));
  const effectiveOmissions = new Set(requestedOmissions);
  groups.forEach((group) => {
    if (!requestedOmissions.has(group.id)) return;
    groups.forEach((candidate) => {
      if (candidate.topicId === group.topicId && recoveryPhaseOrder(candidate.phase) > recoveryPhaseOrder(group.phase)) {
        effectiveOmissions.add(candidate.id);
      }
    });
  });

  const overrideByDate = new Map((params.capacityOverrides ?? []).map((entry) => [entry.date, entry.minutes]));
  const additionalMinutesPerDay = Math.max(0, Math.min(720, params.additionalMinutesPerDay ?? 0));
  const dates: Array<{
    date: string;
    beforeCapacityMinutes: number;
    capacityMinutes: number;
    pinnedMinutes: number;
    remainingMinutes: number;
  }> = [];
  const cursor = parseIsoDate(params.today);
  const target = parseIsoDate(params.targetDate);
  while (cursor < target) {
    const date = toIsoDate(cursor);
    const weeklyMinutes = availabilityByWeekday.get(cursor.getUTCDay()) ?? 0;
    const capacityMinutes = overrideByDate.get(date) ?? weeklyMinutes;
    const pinnedMinutes = pinned
      .filter((task) => task.scheduledDate === date)
      .reduce((sum, task) => sum + task.minutes, 0);
    dates.push({
      date,
      beforeCapacityMinutes: capacityMinutes,
      capacityMinutes,
      pinnedMinutes,
      remainingMinutes: Math.max(0, capacityMinutes - pinnedMinutes),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const totalFlexibleMinutes = groups.reduce((sum, group) => sum + group.minutes, 0);
  const selectedOmissionMinutes = groups
    .filter((group) => effectiveOmissions.has(group.id))
    .reduce((sum, group) => sum + group.minutes, 0);
  const remainingGroups = groups.filter((group) => !effectiveOmissions.has(group.id));
  const remainingMinutes = remainingGroups.reduce((sum, group) => sum + group.minutes, 0);
  let extraNeeded = Math.max(0, remainingMinutes - dates.reduce((sum, day) => sum + day.remainingMinutes, 0));
  const capacityChanges: RecoveryCapacityChange[] = [];
  if (additionalMinutesPerDay > 0 && extraNeeded > 0) {
    const eligibleDays = dates
      .filter((day) => day.beforeCapacityMinutes > 0 && day.beforeCapacityMinutes < 720)
      .map((day) => ({
        day,
        addedMinutes: 0,
        maximumAddedMinutes: Math.min(additionalMinutesPerDay, 720 - day.beforeCapacityMinutes),
      }));

    // Add one scheduler-sized block to each study day per pass. This keeps the
    // extra time balanced while retaining chronological, deterministic output.
    let addedInPass = true;
    while (extraNeeded > 0 && addedInPass) {
      addedInPass = false;
      eligibleDays.forEach((entry) => {
        if (extraNeeded <= 0 || entry.addedMinutes >= entry.maximumAddedMinutes) return;
        const addedMinutes = Math.min(
          15,
          extraNeeded,
          entry.maximumAddedMinutes - entry.addedMinutes,
        );
        entry.addedMinutes += addedMinutes;
        extraNeeded -= addedMinutes;
        addedInPass = true;
      });
    }

    eligibleDays.forEach(({ day, addedMinutes }) => {
      if (addedMinutes <= 0) return;
      day.capacityMinutes += addedMinutes;
      day.remainingMinutes = Math.max(0, day.capacityMinutes - day.pinnedMinutes);
      capacityChanges.push({
        date: day.date,
        beforeMinutes: day.beforeCapacityMinutes,
        afterMinutes: day.capacityMinutes,
        addedMinutes,
      });
    });
  }
  const availableFlexibleMinutes = dates.reduce((sum, day) => sum + day.remainingMinutes, 0);
  const requiredOmissionMinutes = Math.max(0, totalFlexibleMinutes - availableFlexibleMinutes);
  const shortfallMinutes = Math.max(0, remainingMinutes - availableFlexibleMinutes);
  const scheduledMinuteTarget = Math.min(remainingMinutes, availableFlexibleMinutes);
  const quotas = recoveryQuotas(dates.map((day) => day.remainingMinutes), scheduledMinuteTarget);
  const scheduledTasks: RecoveryScheduledTask[] = [];
  let groupIndex = 0;
  let groupRemaining = remainingGroups[0]?.minutes ?? 0;
  let sequence = 0;
  dates.forEach((day, dateIndex) => {
    let dayRemaining = quotas[dateIndex];
    while (dayRemaining > 0 && groupIndex < remainingGroups.length) {
      const group = remainingGroups[groupIndex];
      const minutes = Math.min(dayRemaining, groupRemaining);
      scheduledTasks.push({
        groupId: group.id,
        topicId: group.topicId,
        phase: group.phase,
        title: group.title,
        titleOverride: group.titleOverride,
        scheduledDate: day.date,
        minutes,
        sequence,
      });
      sequence += 1;
      dayRemaining -= minutes;
      groupRemaining -= minutes;
      if (groupRemaining === 0) {
        groupIndex += 1;
        groupRemaining = remainingGroups[groupIndex]?.minutes ?? 0;
      }
    }
  });

  const beforeByDate = minutesByDate(params.tasks);
  const afterByDate = minutesByDate([
    ...pinned.map((task) => ({ scheduledDate: task.scheduledDate, minutes: task.minutes })),
    ...scheduledTasks,
  ]);
  const overCapacityFor = (byDate: Map<string, number>, useBeforeCapacity = false) => dates.reduce(
    (sum, day) => sum + Math.max(0, (byDate.get(day.date) ?? 0) - (useBeforeCapacity ? day.beforeCapacityMinutes : day.capacityMinutes)),
    0
  );
  const beforeOverCapacityMinutes = overCapacityFor(beforeByDate, true);
  const afterOverCapacityMinutes = overCapacityFor(afterByDate);
  const beforeOverdueMinutes = params.tasks
    .filter((task) => task.scheduledDate < params.today)
    .reduce((sum, task) => sum + task.minutes, 0);
  const afterOverdueMinutes = pinned
    .filter((task) => task.scheduledDate < params.today)
    .reduce((sum, task) => sum + task.minutes, 0);

  const unresolvedByKey = new Map<string, RecoveryUnresolvedTask>();
  pinned.filter((task) => task.scheduledDate < params.today).forEach((task) => {
    unresolvedByKey.set(`${task.id}:overdue`, {
      id: task.id, title: task.title, scheduledDate: task.scheduledDate, minutes: task.minutes, reason: 'pinned_overdue',
    });
  });
  dates.forEach((day) => {
    const dayPinned = pinned.filter((task) => task.scheduledDate === day.date);
    if (dayPinned.reduce((sum, task) => sum + task.minutes, 0) <= day.capacityMinutes) return;
    dayPinned.forEach((task) => unresolvedByKey.set(`${task.id}:capacity`, {
      id: task.id, title: task.title, scheduledDate: task.scheduledDate, minutes: task.minutes, reason: 'pinned_over_capacity',
    }));
  });

  const afterByGroup = new Map<string, Map<string, number>>();
  scheduledTasks.forEach((task) => {
    const byDate = afterByGroup.get(task.groupId) ?? new Map<string, number>();
    byDate.set(task.scheduledDate, (byDate.get(task.scheduledDate) ?? 0) + task.minutes);
    afterByGroup.set(task.groupId, byDate);
  });
  let unchangedFlexibleMinutes = 0;
  groups.forEach((group) => {
    const after = afterByGroup.get(group.id) ?? new Map<string, number>();
    group.beforeByDate.forEach((minutes, date) => {
      unchangedFlexibleMinutes += Math.min(minutes, after.get(date) ?? 0);
    });
  });
  const movedMinutes = Math.max(0, scheduledTasks.reduce((sum, task) => sum + task.minutes, 0) - unchangedFlexibleMinutes);
  const taskChanges: RecoveryTaskChange[] = groups.map((group) => {
    const after = afterByGroup.get(group.id) ?? new Map<string, number>();
    const omitted = effectiveOmissions.has(group.id);
    const unchanged = !omitted
      && group.minutes === [...after.values()].reduce((sum, value) => sum + value, 0)
      && [...new Set([...group.beforeByDate.keys(), ...after.keys()])].every(
        (date) => (group.beforeByDate.get(date) ?? 0) === (after.get(date) ?? 0)
      );
    return {
      groupId: group.id,
      title: group.title,
      minutes: group.minutes,
      fromDates: [...group.beforeByDate.keys()].sort(),
      toDates: [...after.keys()].sort(),
      status: omitted ? 'unscheduled' : unchanged ? 'unchanged' : 'moved',
    };
  });

  const allDates = [...new Set([...dates.map((day) => day.date), ...beforeByDate.keys(), ...afterByDate.keys()])].sort();
  const capacityByDate = new Map(dates.map((day) => [day.date, day.capacityMinutes]));
  const dayChanges = allDates
    .map((date) => ({
      date,
      capacityMinutes: capacityByDate.get(date) ?? 0,
      beforeMinutes: beforeByDate.get(date) ?? 0,
      afterMinutes: afterByDate.get(date) ?? 0,
    }))
    .filter((day) => day.beforeMinutes !== day.afterMinutes || day.beforeMinutes > day.capacityMinutes || day.afterMinutes > day.capacityMinutes);

  const reasons: StudyRecoveryPlan['reasons'] = [];
  if (beforeOverdueMinutes > 0) reasons.push('overdue');
  if (beforeOverCapacityMinutes > 0) reasons.push('over_capacity');
  if (params.unscheduledMinutes > 0) reasons.push('unscheduled');
  const needsRecovery = beforeOverdueMinutes > 0 || beforeOverCapacityMinutes > 0;
  const hasUsefulChange = taskChanges.some((change) => change.status !== 'unchanged')
    || params.unscheduledMinutes !== selectedOmissionMinutes + shortfallMinutes
    || capacityChanges.length > 0;

  const recommendedOmittedGroupIds: string[] = [];
  const recommendedEffective = new Set<string>();
  let recommendedMinutes = 0;
  for (const group of [...groups].reverse()) {
    if (recommendedMinutes >= requiredOmissionMinutes) break;
    if (recommendedEffective.has(group.id)) continue;
    recommendedOmittedGroupIds.push(group.id);
    recommendedEffective.add(group.id);
    omissionGroups.find((candidate) => candidate.id === group.id)?.cascadesTo.forEach((id) => recommendedEffective.add(id));
    recommendedMinutes = groups
      .filter((candidate) => recommendedEffective.has(candidate.id))
      .reduce((sum, candidate) => sum + candidate.minutes, 0);
  }

  return {
    needsRecovery,
    canConfirm: needsRecovery && shortfallMinutes === 0 && hasUsefulChange,
    reasons,
    requiredOmissionMinutes,
    shortfallMinutes,
    selectedOmissionMinutes,
    additionalMinutesPerDay,
    effectiveOmittedGroupIds: [...effectiveOmissions].sort(),
    recommendedOmittedGroupIds,
    omissionGroups,
    scheduledTasks,
    unresolvedTasks: [...unresolvedByKey.values()],
    capacityChanges,
    dayChanges,
    taskChanges,
    totals: {
      before: {
        scheduledMinutes: params.tasks.reduce((sum, task) => sum + task.minutes, 0),
        overdueMinutes: beforeOverdueMinutes,
        overCapacityMinutes: beforeOverCapacityMinutes,
        unscheduledMinutes: params.unscheduledMinutes,
      },
      after: {
        scheduledMinutes: pinned.reduce((sum, task) => sum + task.minutes, 0)
          + scheduledTasks.reduce((sum, task) => sum + task.minutes, 0),
        overdueMinutes: afterOverdueMinutes,
        overCapacityMinutes: afterOverCapacityMinutes,
        unscheduledMinutes: selectedOmissionMinutes + shortfallMinutes,
      },
      movedMinutes,
    },
  };
}
