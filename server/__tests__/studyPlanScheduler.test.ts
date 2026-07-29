import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildStudyJobs,
  enumerateStudyDates,
  PHASE_MINUTES,
  scheduleStudyJobs,
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

  it('creates a course-linked bullet note for an owned logical study task', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('FROM study_tasks task')) {
          return {
            rows: [{
              plan_id: '10',
              topic_id: '20',
              phase: 1,
              course_id: '2',
              title: 'Practice: Graph algorithms',
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
    expect(calls[1].sql).toContain('ON CONFLICT (study_plan_id, study_topic_id, study_phase) DO NOTHING');
    expect(calls[1].params).toEqual([
      '2',
      'Practice: Graph algorithms',
      TASK_NOTE_INITIAL_CONTENT,
      'owner-1',
      '10',
      '20',
      1,
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
              phase: 0,
              course_id: '2',
              title: 'Learn & review: Graph algorithms',
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
    expect(calls[2].sql).toContain('plan.exam_date >= $2::date');
    expect(calls[2].params).toEqual(['owner-1', '2026-07-19', '2026-08-30']);
    expect(calls[3].sql).toContain('task.scheduled_date >= $2::date');
    expect(calls[3].sql).toContain('task.scheduled_date < $3::date');
    expect(calls[3].params).toEqual(['owner-1', '2026-07-19', '2026-08-30']);
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
});
