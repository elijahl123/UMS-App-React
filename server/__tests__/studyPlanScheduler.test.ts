import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildStudyJobs,
  enumerateStudyDates,
  PHASE_MINUTES,
  planStudyRecovery,
  scheduleStudyJobs,
  scheduleEvenWork,
  StudyPlanCapacityError,
  todayInTimeZone,
} from '../studyPlanScheduler';
import {
  createStudyPlan,
  loadStudyPlanCalendar,
  loadStudyPlanDashboard,
  loadStudyPlanTasks,
  normalizeStudyPlanInput,
  normalizeStudyTaskRange,
  openStudyTaskNote,
  rebuildStudyPlan,
  TASK_NOTE_INITIAL_CONTENT,
  type StudyPlanInput,
} from '../studyPlans';

describe('study plan scheduling', () => {
  it('builds the planned three-stage workload for each difficulty', () => {
    const jobs = buildStudyJobs([
      { id: '1', title: 'Light topic', difficulty: 'light' },
      { id: '2', title: 'Medium topic', difficulty: 'medium' },
      { id: '3', title: 'Heavy topic', difficulty: 'heavy' },
    ]);

    expect(jobs.filter((job) => job.topicId === '1').reduce((sum, job) => sum + job.minutes, 0)).toBe(60);
    expect(jobs.filter((job) => job.topicId === '2').reduce((sum, job) => sum + job.minutes, 0)).toBe(120);
    expect(jobs.filter((job) => job.topicId === '3').reduce((sum, job) => sum + job.minutes, 0)).toBe(180);
    expect(PHASE_MINUTES.medium).toEqual({ learn: 60, practice: 45, recall: 15 });
  });

  it('spreads work over available days without using exam day or exceeding capacity', () => {
    const availability = [
      { weekday: 1, minutes: 60 },
      { weekday: 3, minutes: 90 },
      { weekday: 5, minutes: 60 },
    ];
    const jobs = buildStudyJobs([
      { id: '1', title: 'Graphs', difficulty: 'medium' },
      { id: '2', title: 'Complexity', difficulty: 'light' },
    ]);
    const tasks = scheduleStudyJobs('2026-07-20', '2026-07-31', availability, jobs);
    const dates = enumerateStudyDates('2026-07-20', '2026-07-31', availability);
    const capacity = new Map(dates.map((day) => [day.date, day.minutes]));

    expect(tasks.reduce((sum, task) => sum + task.minutes, 0)).toBe(180);
    expect(tasks.every((task) => task.scheduledDate < '2026-07-31')).toBe(true);
    expect(tasks.every((task) => task.minutes % 15 === 0)).toBe(true);
    for (const date of new Set(tasks.map((task) => task.scheduledDate))) {
      const scheduled = tasks.filter((task) => task.scheduledDate === date).reduce((sum, task) => sum + task.minutes, 0);
      expect(scheduled).toBeLessThanOrEqual(capacity.get(date) ?? 0);
    }
    expect(tasks.map((task) => task.phase)).toEqual([...tasks.map((task) => task.phase)].sort((a, b) => ['learn', 'practice', 'recall'].indexOf(a) - ['learn', 'practice', 'recall'].indexOf(b)));
  });

  it('returns a structured capacity failure instead of overloading days', () => {
    expect(() =>
      scheduleStudyJobs(
        '2026-07-20',
        '2026-07-22',
        [{ weekday: 1, minutes: 30 }],
        buildStudyJobs([{ id: '1', title: 'Graphs', difficulty: 'heavy' }])
      )
    ).toThrow(StudyPlanCapacityError);
  });

  it('uses the plan timezone when deciding today', () => {
    const now = new Date('2026-07-25T01:00:00.000Z');
    expect(todayInTimeZone('America/Los_Angeles', now)).toBe('2026-07-24');
    expect(todayInTimeZone('Europe/Dublin', now)).toBe('2026-07-25');
  });

  it('recovers overdue flexible work without moving pinned tasks or using the target date', () => {
    const result = planStudyRecovery({
      today: '2026-08-24',
      targetDate: '2026-08-28',
      availability: [1, 2, 3, 4].map((weekday) => ({ weekday, minutes: 60 })),
      unscheduledMinutes: 0,
      tasks: [
        {
          id: 'flex', topicId: '1', topicTitle: 'Graphs', topicPosition: 0, phase: 'learn',
          title: 'Learn & review: Graphs', titleOverride: null, scheduledDate: '2026-08-22',
          minutes: 60, sequence: 0, manuallyEdited: false,
        },
        {
          id: 'pinned', topicId: '1', topicTitle: 'Graphs', topicPosition: 0, phase: 'practice',
          title: 'Practice: Graphs', titleOverride: null, scheduledDate: '2026-08-23',
          minutes: 30, sequence: 1, manuallyEdited: true,
        },
      ],
    });

    expect(result.needsRecovery).toBe(true);
    expect(result.canConfirm).toBe(true);
    expect(result.scheduledTasks.every((task) => task.scheduledDate >= '2026-08-24' && task.scheduledDate < '2026-08-28')).toBe(true);
    expect(result.totals.after.overdueMinutes).toBe(30);
    expect(result.unresolvedTasks).toEqual([expect.objectContaining({ id: 'pinned', reason: 'pinned_overdue' })]);
  });

  it('subtracts pinned work from capacity and reports pinned overloads', () => {
    const result = planStudyRecovery({
      today: '2026-08-24',
      targetDate: '2026-08-25',
      availability: [{ weekday: 1, minutes: 60 }],
      unscheduledMinutes: 0,
      tasks: [
        {
          id: 'pinned', topicId: '1', topicTitle: 'Graphs', topicPosition: 0, phase: 'learn',
          title: 'Pinned Graphs', titleOverride: 'Pinned Graphs', scheduledDate: '2026-08-24',
          minutes: 90, sequence: 0, manuallyEdited: true,
        },
        {
          id: 'flex', topicId: '1', topicTitle: 'Graphs', topicPosition: 0, phase: 'practice',
          title: 'Practice: Graphs', titleOverride: null, scheduledDate: '2026-08-23',
          minutes: 30, sequence: 1, manuallyEdited: false,
        },
      ],
    });

    expect(result.requiredOmissionMinutes).toBe(30);
    expect(result.unresolvedTasks).toContainEqual(expect.objectContaining({ id: 'pinned', reason: 'pinned_over_capacity' }));
    expect(result.totals.after.overCapacityMinutes).toBe(30);
  });

  it('requires dependency-safe omissions and cascades later phases', () => {
    const tasks = [
      ['learn', 60], ['practice', 45], ['recall', 15],
    ].map(([phase, minutes], sequence) => ({
      id: String(sequence + 1), topicId: '1', topicTitle: 'Graphs', topicPosition: 0,
      phase: phase as 'learn' | 'practice' | 'recall', title: `${phase}: Graphs`, titleOverride: null,
      scheduledDate: '2026-08-23', minutes: Number(minutes), sequence, manuallyEdited: false,
    }));
    const initial = planStudyRecovery({
      today: '2026-08-24', targetDate: '2026-08-26',
      availability: [{ weekday: 1, minutes: 30 }, { weekday: 2, minutes: 30 }],
      unscheduledMinutes: 0, tasks,
    });
    const selected = planStudyRecovery({
      today: '2026-08-24', targetDate: '2026-08-26',
      availability: [{ weekday: 1, minutes: 30 }, { weekday: 2, minutes: 30 }],
      unscheduledMinutes: 0, tasks, omittedGroupIds: ['1:practice'],
    });

    expect(initial.requiredOmissionMinutes).toBe(60);
    expect(initial.canConfirm).toBe(false);
    expect(selected.effectiveOmittedGroupIds).toEqual(['1:practice', '1:recall']);
    expect(selected.selectedOmissionMinutes).toBe(60);
    expect(selected.shortfallMinutes).toBe(0);
    expect(selected.canConfirm).toBe(true);
  });

  it('adds only the per-day capacity needed to schedule a recovery shortfall', () => {
    const tasks = [{
      id: '1', topicId: '1', topicTitle: 'Graphs', topicPosition: 0, phase: 'learn' as const,
      title: 'Learn & review: Graphs', titleOverride: null, scheduledDate: '2026-08-23',
      minutes: 120, sequence: 0, manuallyEdited: false,
    }];
    const initial = planStudyRecovery({
      today: '2026-08-24', targetDate: '2026-08-25',
      availability: [{ weekday: 1, minutes: 60 }], unscheduledMinutes: 0, tasks,
    });
    const expanded = planStudyRecovery({
      today: '2026-08-24', targetDate: '2026-08-25',
      availability: [{ weekday: 1, minutes: 60 }], unscheduledMinutes: 0, tasks,
      additionalMinutesPerDay: 720,
    });

    expect(initial.shortfallMinutes).toBe(60);
    expect(initial.recommendedOmittedGroupIds).toEqual(['1:learn']);
    expect(expanded.shortfallMinutes).toBe(0);
    expect(expanded.canConfirm).toBe(true);
    expect(expanded.capacityChanges).toEqual([{
      date: '2026-08-24', beforeMinutes: 60, afterMinutes: 120, addedMinutes: 60,
    }]);
    expect(expanded.scheduledTasks.reduce((sum, task) => sum + task.minutes, 0)).toBe(120);
  });

  it('evenly distributes added capacity across the remaining study days', () => {
    const expanded = planStudyRecovery({
      today: '2026-08-24', targetDate: '2026-08-28',
      availability: [
        { weekday: 1, minutes: 30 },
        { weekday: 2, minutes: 30 },
        { weekday: 3, minutes: 30 },
        { weekday: 4, minutes: 30 },
      ],
      unscheduledMinutes: 0,
      additionalMinutesPerDay: 720,
      tasks: [{
        id: '1', topicId: '1', topicTitle: 'Graphs', topicPosition: 0, phase: 'learn',
        title: 'Learn & review: Graphs', titleOverride: null, scheduledDate: '2026-08-23',
        minutes: 240, sequence: 0, manuallyEdited: false,
      }],
    });

    expect(expanded.shortfallMinutes).toBe(0);
    expect(expanded.canConfirm).toBe(true);
    expect(expanded.capacityChanges).toEqual([
      { date: '2026-08-24', beforeMinutes: 30, afterMinutes: 60, addedMinutes: 30 },
      { date: '2026-08-25', beforeMinutes: 30, afterMinutes: 60, addedMinutes: 30 },
      { date: '2026-08-26', beforeMinutes: 30, afterMinutes: 60, addedMinutes: 30 },
      { date: '2026-08-27', beforeMinutes: 30, afterMinutes: 60, addedMinutes: 30 },
    ]);
  });

  it('honors persisted per-date recovery capacity on later previews', () => {
    const result = planStudyRecovery({
      today: '2026-08-24', targetDate: '2026-08-25',
      availability: [{ weekday: 1, minutes: 60 }],
      capacityOverrides: [{ date: '2026-08-24', minutes: 105 }],
      unscheduledMinutes: 0,
      tasks: [{
        id: '1', topicId: '1', topicTitle: 'Graphs', topicPosition: 0, phase: 'learn',
        title: 'Learn & review: Graphs', titleOverride: null, scheduledDate: '2026-08-23',
        minutes: 105, sequence: 0, manuallyEdited: false,
      }],
    });

    expect(result.requiredOmissionMinutes).toBe(0);
    expect(result.capacityChanges).toEqual([]);
    expect(result.totals.after.scheduledMinutes).toBe(105);
  });

  it('keeps recovery deterministic when no days remain before the target', () => {
    const params = {
      today: '2026-08-24',
      targetDate: '2026-08-24',
      availability: [{ weekday: 1, minutes: 120 }],
      unscheduledMinutes: 0,
      tasks: [{
        id: '1', topicId: '1', topicTitle: 'Graphs', topicPosition: 0, phase: 'learn' as const,
        title: 'Learn & review: Graphs', titleOverride: null, scheduledDate: '2026-08-23',
        minutes: 60, sequence: 0, manuallyEdited: false,
      }],
    };
    expect(planStudyRecovery(params)).toEqual(planStudyRecovery(params));
    expect(planStudyRecovery(params).shortfallMinutes).toBe(60);
    expect(planStudyRecovery(params).scheduledTasks).toEqual([]);
  });

  it('spreads assignment work evenly and gives 15-minute rounding remainder to earlier days', () => {
    const result = scheduleEvenWork({
      startDate: '2026-09-01',
      dueDate: '2026-09-05',
      estimatedMinutes: 150,
      availableWeekdays: [2, 3, 4, 5],
      maximumMinutesPerDay: 60,
    });
    expect(result.tasks.map((task) => task.minutes)).toEqual([45, 45, 30, 30]);
    expect(result.tasks.every((task) => task.scheduledDate < '2026-09-05')).toBe(true);
    expect(result.unscheduledMinutes).toBe(0);
    expect(scheduleEvenWork({
      startDate: '2026-09-01', dueDate: '2026-09-05', estimatedMinutes: 150,
      availableWeekdays: [2, 3, 4, 5], maximumMinutesPerDay: 60,
    })).toEqual(result);
  });

  it('reports unscheduled minutes instead of discarding work, including due-today targets', () => {
    const short = scheduleEvenWork({
      startDate: '2026-09-01', dueDate: '2026-09-03', estimatedMinutes: 180,
      availableWeekdays: [2, 3], maximumMinutesPerDay: 45,
    });
    expect(short.scheduledMinutes).toBe(90);
    expect(short.unscheduledMinutes).toBe(90);
    const dueToday = scheduleEvenWork({
      startDate: '2026-09-01', dueDate: '2026-09-01', estimatedMinutes: 60,
      availableWeekdays: [2], maximumMinutesPerDay: 60,
    });
    expect(dueToday.tasks).toEqual([]);
    expect(dueToday.unscheduledMinutes).toBe(60);
  });

  it('normalizes valid inputs and rejects invalid plan definitions', () => {
    const normalized = normalizeStudyPlanInput({
      courseId: '1',
      examType: 'final',
      examDate: '2026-08-20',
      startDate: '2026-07-25',
      timeZone: 'America/Los_Angeles',
      availability: [{ weekday: 1, minutes: 60 }],
      topics: [{ title: '  Graph   algorithms  ', difficulty: 'medium' }],
    });
    expect(normalized.topics[0].title).toBe('Graph algorithms');
    expect(() => normalizeStudyPlanInput({ ...normalized, startDate: normalized.examDate })).toThrow(
      /start before the exam/i
    );
  });

  it('defaults topics without a difficulty to light', () => {
    const normalized = normalizeStudyPlanInput({
      courseId: '1',
      examType: 'final',
      examDate: '2026-08-15',
      startDate: '2026-08-01',
      timeZone: 'America/Los_Angeles',
      availability: [{ weekday: 1, minutes: 60 }],
      topics: [{ title: 'Graph algorithms' }],
    });

    expect(normalized.topics[0].difficulty).toBe('light');
  });

  it('keeps a 100-topic, 12-month schedule deterministic and within the exam boundary', () => {
    const topics = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
      title: `Topic ${index + 1}`,
      difficulty: 'heavy' as const,
    }));
    const availability = Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: 120 }));
    const jobs = buildStudyJobs(topics);
    const first = scheduleStudyJobs('2026-08-01', '2027-08-01', availability, jobs);
    const second = scheduleStudyJobs('2026-08-01', '2027-08-01', availability, jobs);

    expect(first).toEqual(second);
    expect(first.every((task) => task.scheduledDate < '2027-08-01')).toBe(true);
    expect(first.reduce((sum, task) => sum + task.minutes, 0)).toBe(18_000);
    topics.forEach((topic) => {
      expect(first.filter((task) => task.topicId === topic.id).reduce((sum, task) => sum + task.minutes, 0)).toBe(180);
    });
  });

  it('validates bounded inclusive/exclusive task windows', () => {
    expect(normalizeStudyTaskRange({ from: '2026-07-01', to: '2026-07-29' }, 28)).toEqual({
      from: '2026-07-01',
      to: '2026-07-29',
    });
    expect(() => normalizeStudyTaskRange({ from: '2026-07-01', to: '2026-07-30' }, 28)).toThrow(
      /cannot exceed 28 days/i
    );
    expect(() => normalizeStudyTaskRange({ from: '2026-07-01', to: '2026-07-01' }, 28)).toThrow(
      /after from/i
    );
    expect(() => normalizeStudyTaskRange({ from: '2026-07-01' }, 28)).toThrow(/to must be a valid date/i);
    expect(() => normalizeStudyTaskRange({ from: '2026-02-30', to: '2026-03-02' }, 28)).toThrow(
      /from must be a valid date/i
    );
  });

  it('uses a ranged owned-plan query for task reads', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT p.id, p.course_id')) {
          return {
            rows: [{
              id: '10',
              course_id: '2',
              exam_date: '2026-09-01',
              start_date: '2026-07-01',
              timezone: 'UTC',
            }],
          };
        }
        return { rows: [] };
      },
    };

    const result = await loadStudyPlanTasks(
      client as never,
      'owner-1',
      '10',
      { from: '2026-07-01', to: '2026-07-29' }
    );

    expect(result.tasks).toEqual([]);
    expect(calls[1].sql).toContain('scheduled_date >= $2::date');
    expect(calls[1].sql).toContain('scheduled_date < $3::date');
    expect(calls[1].sql).toContain("CASE task.phase WHEN 0 THEN 'learn'");
    expect(calls[1].sql).toContain('task.title_override');
    expect(calls[1].params).toEqual(['10', '2026-07-01', '2026-07-29']);
    expect(calls[0].params).toEqual(['10', 'owner-1']);
  });

  it('creates one course-linked bullet note for an owned study topic across all phases', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('FROM study_tasks task')) {
          return {
            rows: [{
              plan_id: '10',
              topic_id: '20',
              course_id: '2',
              title: 'Graph algorithms',
            }],
          };
        }
        if (sql.includes('INSERT INTO notes')) return { rows: [{ id: '30' }] };
        return { rows: [] };
      },
    };

    await expect(openStudyTaskNote(client as never, 'owner-1', '10', '15')).resolves.toEqual({
      noteId: '30',
      created: true,
    });
    expect(calls[0].params).toEqual(['15', '10', 'owner-1']);
    expect(calls[1].sql).toContain('ON CONFLICT (study_plan_id, study_topic_id) DO NOTHING');
    expect(calls[1].sql).not.toContain('study_phase');
    expect(calls[1].params).toEqual([
      '2',
      'Graph algorithms',
      TASK_NOTE_INITIAL_CONTENT,
      'owner-1',
      '10',
      '20',
    ]);
  });

  it('reopens an existing task note and rejects tasks owned by another user', async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('FROM study_tasks task')) {
          return {
            rows: [{
              plan_id: '10',
              topic_id: '20',
              course_id: '2',
              title: 'Graph algorithms',
            }],
          };
        }
        if (sql.includes('INSERT INTO notes')) return { rows: [] };
        if (sql.includes('FROM notes')) return { rows: [{ id: '31' }] };
        return { rows: [] };
      },
    };
    const unownedClient = { query: async () => ({ rows: [] }) };

    await expect(openStudyTaskNote(client as never, 'owner-1', '10', '15')).resolves.toEqual({
      noteId: '31',
      created: false,
    });
    await expect(openStudyTaskNote(unownedClient as never, 'other-user', '10', '15')).rejects.toMatchObject({
      message: 'Study task not found',
      status: 404,
    });
  });

  it('preserves task notes when their plan or topic is deleted', () => {
    const migration = readFileSync(
      'migrations/1783880000_add_course_homepages_and_study_task_notes.sql',
      'utf8'
    );
    expect(migration.match(/ON DELETE SET NULL/g)).toHaveLength(2);
    expect(migration).toContain('CREATE UNIQUE INDEX idx_notes_study_task');
  });

  it('migrates phase notes to one shared topic note without deleting duplicates', () => {
    const migration = readFileSync(
      'migrations/1783890000_share_study_notes_across_topic_phases.sql',
      'utf8'
    );
    expect(migration).toContain('PARTITION BY study_plan_id, study_topic_id');
    expect(migration).toContain('ORDER BY updated_at DESC, id DESC');
    expect(migration).toContain('study_plan_id = NULL');
    expect(migration).toContain('CREATE UNIQUE INDEX idx_notes_study_topic');
    expect(migration).not.toMatch(/DELETE\s+FROM notes/i);
  });

  it('scopes Dashboard and Calendar reads to active owned plans and bounded dates', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    };

    const dashboard = await loadStudyPlanDashboard(client as never, 'owner-1');
    const calendar = await loadStudyPlanCalendar(
      client as never,
      'owner-1',
      { from: '2026-07-19', to: '2026-08-30' }
    );

    expect(dashboard).toEqual({
      plans: [],
      tasks: [],
      activePlanCount: 0,
      overduePlanCount: 0,
      recoveryPlanCount: 0,
      urgentPlan: null,
      nextStudyDate: null,
    });
    expect(calendar).toEqual({
      from: '2026-07-19',
      to: '2026-08-30',
      plans: [],
      tasks: [],
    });
    expect(calls[0].sql).toContain('p.archived = FALSE');
    expect(calls[0].params).toEqual(['owner-1']);
    expect(calls[1].sql).toContain('course.user_id = $1');
    expect(calls[1].sql).toContain('plan.archived = FALSE');
    expect(calls[1].sql).toContain('course.homepage_url AS course_homepage_url');
    expect(calls[2].sql).toContain('COALESCE(plan.target_date, plan.exam_date) >= $2::date');
    expect(calls[2].params).toEqual(['owner-1', '2026-07-19', '2026-08-30']);
    expect(calls[3].sql).toContain('task.scheduled_date >= $2::date');
    expect(calls[3].sql).toContain('task.scheduled_date < $3::date');
    expect(calls[3].params).toEqual(['owner-1', '2026-07-19', '2026-08-30']);
  });

  it('returns every upcoming active plan on the dashboard without a three-plan cap', async () => {
    const summaries = Array.from({ length: 6 }, (_, index) => ({
      id: String(index + 1),
      exam_date: index === 0 ? '2026-07-24' : `2026-08-${String(index + 1).padStart(2, '0')}`,
      local_today: '2026-07-25',
      overdue_tasks: index === 1 ? 2 : 0,
      next_study_date: `2026-07-${String(index + 26).padStart(2, '0')}`,
    }));
    let queryCount = 0;
    const client = {
      query: async () => {
        queryCount += 1;
        return { rows: queryCount === 1 ? summaries : [] };
      },
    };

    const dashboard = await loadStudyPlanDashboard(client as never, 'owner-1');

    expect(dashboard.activePlanCount).toBe(6);
    expect(dashboard.plans.map((plan) => plan.id)).toEqual(['2', '3', '4', '5', '6']);
    expect(dashboard.overduePlanCount).toBe(1);
    expect(dashboard.urgentPlan?.id).toBe('2');
  });

  it('keeps create and edit query counts constant from 1 to 100 topics', async () => {
    const buildInput = (topicCount: number): StudyPlanInput => ({
      courseId: '2',
      examType: 'final',
      examDate: '2027-08-01',
      startDate: '2026-08-01',
      timeZone: 'UTC',
      availability: Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: 120 })),
      topics: Array.from({ length: topicCount }, (_, index) => ({
        title: `Topic ${index + 1}`,
        difficulty: 'heavy',
      })),
    });
    const run = async (topicCount: number, mode: 'create' | 'edit') => {
      const calls: Array<{ sql: string; params: unknown[] }> = [];
      const client = {
        query: async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params });
          if (sql.includes('INSERT INTO study_plans')) return { rows: [{ id: '10' }] };
          if (sql.includes('SELECT p.id, p.course_id')) {
            return {
              rows: [{
                id: '10',
                course_id: '2',
                exam_date: '2027-08-01',
                start_date: '2026-08-01',
                timezone: 'UTC',
              }],
            };
          }
          if (sql.includes('SELECT t.id, EXISTS')) return { rows: [] };
          if (sql.includes('SELECT topic_id, phase, SUM')) return { rows: [] };
          if (sql.includes('INSERT INTO study_topics')) {
            const inserted = JSON.parse(String(params[1])) as Array<{
              title: string;
              difficulty: 'light' | 'medium' | 'heavy';
              position: number;
            }>;
            return {
              rows: inserted.map((topic, index) => ({
                id: String(index + 1),
                ...topic,
              })),
            };
          }
          return { rows: [] };
        },
      };
      if (mode === 'create') {
        await createStudyPlan(client as never, 'owner-1', buildInput(topicCount));
      } else {
        await rebuildStudyPlan(client as never, 'owner-1', '10', buildInput(topicCount));
      }
      return calls;
    };

    const createOne = await run(1, 'create');
    const createHundred = await run(100, 'create');
    const editOne = await run(1, 'edit');
    const editHundred = await run(100, 'edit');

    expect(createHundred).toHaveLength(createOne.length);
    expect(editHundred).toHaveLength(editOne.length);
    expect(createHundred.filter((call) => call.sql.includes('INSERT INTO study_topics'))).toHaveLength(1);
    expect(editHundred.filter((call) => call.sql.includes('INSERT INTO study_topics'))).toHaveLength(1);
    expect(createHundred.filter((call) => call.sql.includes('INSERT INTO study_tasks'))).toHaveLength(1);
    expect(editHundred.filter((call) => call.sql.includes('INSERT INTO study_tasks'))).toHaveLength(1);

    const taskWrite = createHundred.find((call) => call.sql.includes('INSERT INTO study_tasks'));
    const storedTasks = JSON.parse(String(taskWrite?.params[1])) as Array<Record<string, unknown>>;
    expect(taskWrite?.sql).not.toContain('title,');
    expect(taskWrite?.sql).toContain('phase SMALLINT');
    expect(storedTasks.length).toBeGreaterThan(300);
    expect(storedTasks[0]).toEqual(expect.objectContaining({
      topic_id: '1',
      phase: 0,
      estimated_minutes: expect.any(Number),
    }));
    expect(storedTasks[0]).not.toHaveProperty('title');
  });

  it('snapshots completed derived titles before a retained topic is renamed', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT p.id, p.course_id')) {
          return {
            rows: [{
              id: '10',
              course_id: '2',
              exam_date: '2027-08-01',
              start_date: '2026-08-01',
              timezone: 'UTC',
            }],
          };
        }
        if (sql.includes('SELECT t.id, EXISTS')) return { rows: [{ id: '1', has_completed: true }] };
        return { rows: [] };
      },
    };
    const input: StudyPlanInput = {
      courseId: '2',
      examType: 'final',
      examDate: '2027-08-01',
      startDate: '2026-08-01',
      timeZone: 'UTC',
      availability: Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: 120 })),
      topics: [{ id: '1', title: 'Renamed topic', difficulty: 'light' }],
    };

    await rebuildStudyPlan(client as never, 'owner-1', '10', input);

    const rename = calls.find((call) => call.sql.includes('preserved_titles AS'));
    expect(rename?.sql).toContain('SET title_override = COALESCE');
    expect(rename?.sql).toContain('task.completed_at IS NOT NULL');
    expect(rename?.sql).toContain('existing_topic.title IS DISTINCT FROM item.title');
    expect(rename?.sql).toContain('UPDATE study_topics topic');
    expect(rename?.params[0]).toContain('Renamed topic');
  });

  it('defines a forward compact-storage migration without changing public task semantics', () => {
    const migration = readFileSync(
      `${process.cwd()}/migrations/1783840000_compact_study_tasks.sql`,
      'utf8'
    );

    expect(migration).toContain('ADD COLUMN title_override TEXT');
    expect(migration).toContain('task.title IS DISTINCT FROM');
    expect(migration).toContain('ALTER COLUMN phase TYPE SMALLINT');
    expect(migration).toContain('ALTER COLUMN estimated_minutes TYPE SMALLINT');
    expect(migration).toContain('DROP COLUMN title');
    expect(migration).toContain('DROP COLUMN created_at');
    expect(migration).toContain('DROP INDEX IF EXISTS idx_study_tasks_plan_date');
  });

  it('stores recovery snapshots under the study plan ownership cascade', () => {
    const revisionMigration = readFileSync(
      `${process.cwd()}/migrations/1783940000_add_study_plan_recovery.sql`,
      'utf8'
    );
    const capacityMigration = readFileSync(
      `${process.cwd()}/migrations/1783950000_add_study_plan_recovery_capacity.sql`,
      'utf8'
    );

    expect(revisionMigration).toContain('CREATE TABLE study_plan_recovery_revisions');
    expect(revisionMigration).toContain('REFERENCES study_plans (id) ON DELETE CASCADE');
    expect(revisionMigration).toContain('before_tasks JSONB NOT NULL');
    expect(revisionMigration).toContain('after_state_hash TEXT NOT NULL');
    expect(revisionMigration).toContain('WHERE undone_at IS NULL');
    expect(capacityMigration).toContain('CREATE TABLE IF NOT EXISTS study_plan_capacity_overrides');
    expect(capacityMigration).toContain('ADD COLUMN IF NOT EXISTS before_capacity_overrides');
    expect(capacityMigration).toContain('ADD COLUMN IF NOT EXISTS after_capacity_overrides');
  });
});
