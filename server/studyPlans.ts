import type { PoolClient } from 'pg';
import { ApiError } from './errors';
import {
  buildStudyJobs,
  scheduleStudyJobs,
  StudyPlanCapacityError,
  todayInTimeZone,
  type ScheduleAvailability,
  type ScheduleJob,
  type ScheduleTopic,
  type StudyDifficulty,
  type StudyPhase,
} from './studyPlanScheduler';

type Queryable = Pick<PoolClient, 'query'>;
export const TASK_NOTE_INITIAL_CONTENT = '<ul><li><p></p></li></ul>';

export type StudyPlanInput = {
  courseId: string;
  examType: 'midterm' | 'final';
  examDate: string;
  startDate: string;
  timeZone: string;
  availability: ScheduleAvailability[];
  topics: Array<{ id?: string; title: string; difficulty: StudyDifficulty }>;
};

export type StudyTaskRange = {
  from: string;
  to: string;
};

const PHASE_CODES: Record<StudyPhase, number> = {
  learn: 0,
  practice: 1,
  recall: 2,
};

function phaseCode(phase: StudyPhase): number {
  return PHASE_CODES[phase];
}

function phaseTextSql(taskAlias: string): string {
  return `CASE ${taskAlias}.phase WHEN 0 THEN 'learn' WHEN 1 THEN 'practice' ELSE 'recall' END`;
}

function taskTitleSql(taskAlias: string, topicAlias: string): string {
  return `COALESCE(
    ${taskAlias}.title_override,
    CASE ${taskAlias}.phase
      WHEN 0 THEN 'Learn & review'
      WHEN 1 THEN 'Practice'
      ELSE 'Recall'
    END || ': ' || ${topicAlias}.title
  )`;
}

function normalizeDate(value: unknown, label: string): string {
  const date = String(value ?? '').trim();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new ApiError(`${label} must be a valid date`, 400);
  }
  return date;
}

function normalizeTimeZone(value: unknown): string {
  const timeZone = String(value ?? '').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new ApiError('timeZone must be a valid IANA timezone', 400);
  }
  return timeZone;
}

export function normalizeStudyPlanInput(value: unknown): StudyPlanInput {
  const source = (value ?? {}) as Record<string, unknown>;
  const courseId = String(source.courseId ?? '').trim();
  const examType = source.examType;
  const examDate = normalizeDate(source.examDate, 'examDate');
  const startDate = normalizeDate(source.startDate, 'startDate');
  const timeZone = normalizeTimeZone(source.timeZone);

  if (!courseId) throw new ApiError('courseId is required', 400);
  if (examType !== 'midterm' && examType !== 'final') {
    throw new ApiError('examType must be midterm or final', 400);
  }
  if (startDate >= examDate) throw new ApiError('The study plan must start before the exam date', 400);

  if (!Array.isArray(source.availability)) throw new ApiError('availability must be an array', 400);
  const availabilityByDay = new Map<number, number>();
  source.availability.forEach((entry) => {
    const item = entry as Record<string, unknown>;
    const weekday = Number(item.weekday);
    const minutes = Number(item.minutes);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new ApiError('Availability weekday must be between 0 and 6', 400);
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 720 || minutes % 15 !== 0) {
      throw new ApiError('Availability minutes must be a multiple of 15 between 0 and 720', 400);
    }
    availabilityByDay.set(weekday, minutes);
  });
  const availability = [...availabilityByDay.entries()]
    .map(([weekday, minutes]) => ({ weekday, minutes }))
    .sort((a, b) => a.weekday - b.weekday);
  if (!availability.some((entry) => entry.minutes > 0)) {
    throw new ApiError('At least one study day needs available time', 400);
  }

  if (!Array.isArray(source.topics) || source.topics.length < 1 || source.topics.length > 100) {
    throw new ApiError('A plan needs between 1 and 100 topics', 400);
  }
  const topics = source.topics.map((entry) => {
    const item = entry as Record<string, unknown>;
    const title = String(item.title ?? '').trim().replace(/\s+/g, ' ');
    const difficulty = item.difficulty ?? 'light';
    const id = item.id ? String(item.id) : undefined;
    if (!title || title.length > 200) throw new ApiError('Topic titles must be between 1 and 200 characters', 400);
    if (difficulty !== 'light' && difficulty !== 'medium' && difficulty !== 'heavy') {
      throw new ApiError('Topic difficulty must be light, medium, or heavy', 400);
    }
    return { id, title, difficulty: difficulty as StudyDifficulty };
  });

  return { courseId, examType, examDate, startDate, timeZone, availability, topics };
}

export function normalizeStudyTaskRange(
  value: Record<string, unknown>,
  maximumDays: number
): StudyTaskRange {
  const from = normalizeDate(value.from, 'from');
  const to = normalizeDate(value.to, 'to');
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
  if (days < 1) throw new ApiError('to must be after from', 400);
  if (days > maximumDays) throw new ApiError(`Date range cannot exceed ${maximumDays} days`, 400);
  return { from, to };
}

async function writeTasks(client: Queryable, planId: string, tasks: ReturnType<typeof scheduleStudyJobs>) {
  if (tasks.length === 0) return;
  await client.query(
    `
      INSERT INTO study_tasks (
        plan_id, topic_id, phase, scheduled_date, estimated_minutes, sequence
      )
      SELECT
        $1::bigint,
        task.topic_id::bigint,
        task.phase,
        task.scheduled_date::date,
        task.estimated_minutes,
        task.sequence
      FROM jsonb_to_recordset($2::jsonb) AS task(
        topic_id TEXT,
        phase SMALLINT,
        scheduled_date TEXT,
        estimated_minutes SMALLINT,
        sequence INTEGER
      );
    `,
    [
      planId,
      JSON.stringify(
        tasks.map((task) => ({
          topic_id: task.topicId,
          phase: phaseCode(task.phase),
          scheduled_date: task.scheduledDate,
          estimated_minutes: task.minutes,
          sequence: task.sequence,
        }))
      ),
    ]
  );
}

async function insertTopics(
  client: Queryable,
  planId: string,
  topics: Array<{ title: string; difficulty: StudyDifficulty; position: number }>
): Promise<ScheduleTopic[]> {
  if (topics.length === 0) return [];
  const result = await client.query<{
    id: string;
    title: string;
    difficulty: StudyDifficulty;
    position: number;
  }>(
    `
      INSERT INTO study_topics (plan_id, title, difficulty, position)
      SELECT $1::bigint, item.title, item.difficulty, item.position
      FROM jsonb_to_recordset($2::jsonb) AS item(
        title TEXT,
        difficulty TEXT,
        position INTEGER
      )
      RETURNING id, title, difficulty, position;
    `,
    [planId, JSON.stringify(topics)]
  );
  return result.rows
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((topic) => ({ id: String(topic.id), title: topic.title, difficulty: topic.difficulty }));
}

async function writeAvailability(client: Queryable, planId: string, availability: ScheduleAvailability[]) {
  await client.query('DELETE FROM study_plan_availability WHERE plan_id = $1::bigint', [planId]);
  const active = availability.filter((entry) => entry.minutes > 0);
  if (active.length === 0) return;
  await client.query(
    `
      INSERT INTO study_plan_availability (plan_id, weekday, minutes)
      SELECT $1::bigint, item.weekday, item.minutes
      FROM jsonb_to_recordset($2::jsonb) AS item(weekday INTEGER, minutes INTEGER);
    `,
    [planId, JSON.stringify(active)]
  );
}

function phaseOrder(phase: StudyPhase): number {
  return phase === 'learn' ? 0 : phase === 'practice' ? 1 : 2;
}

function remainingJobs(
  topics: ScheduleTopic[],
  completedRows: Array<{ topic_id: string | number; phase: StudyPhase; completed_minutes: number }>
): ScheduleJob[] {
  const completed = new Map(
    completedRows.map((row) => [`${row.topic_id}:${row.phase}`, Number(row.completed_minutes)])
  );
  return buildStudyJobs(topics)
    .map((job) => ({
      ...job,
      minutes: Math.max(0, job.minutes - (completed.get(`${job.topicId}:${job.phase}`) ?? 0)),
    }))
    .filter((job) => job.minutes > 0);
}

function rethrowCapacity(err: unknown): never {
  if (err instanceof StudyPlanCapacityError) {
    throw new ApiError(
      JSON.stringify({
        code: 'INSUFFICIENT_STUDY_CAPACITY',
        requiredMinutes: err.requiredMinutes,
        availableMinutes: err.availableMinutes,
        missingMinutes: err.requiredMinutes - err.availableMinutes,
      }),
      409
    );
  }
  throw err;
}

export async function createStudyPlan(client: Queryable, userId: string, input: StudyPlanInput): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO study_plans (course_id, exam_type, exam_date, start_date, timezone)
      SELECT c.id, $2, $3::date, $4::date, $5
      FROM courses c
      WHERE c.id = $1::bigint AND c.user_id = $6
      RETURNING id;
    `,
    [input.courseId, input.examType, input.examDate, input.startDate, input.timeZone, userId]
  );
  const planId = inserted.rows[0]?.id;
  if (!planId) throw new ApiError('Course not found', 404);

  await writeAvailability(client, planId, input.availability);
  const topics = await insertTopics(
    client,
    planId,
    input.topics.map((topic, position) => ({ ...topic, position }))
  );

  try {
    const tasks = scheduleStudyJobs(input.startDate, input.examDate, input.availability, buildStudyJobs(topics));
    await writeTasks(client, planId, tasks);
  } catch (err) {
    rethrowCapacity(err);
  }
  return planId;
}

async function ownedPlan(
  client: Queryable,
  userId: string,
  planId: string
): Promise<{ id: string; course_id: string; exam_date: string; start_date: string; timezone: string }> {
  const result = await client.query<{
    id: string;
    course_id: string;
    exam_date: string;
    start_date: string;
    timezone: string;
  }>(
    `
      SELECT p.id, p.course_id, p.exam_date::text, p.start_date::text, p.timezone
      FROM study_plans p
      JOIN courses c ON c.id = p.course_id
      WHERE p.id = $1::bigint AND c.user_id = $2;
    `,
    [planId, userId]
  );
  if (!result.rows[0]) throw new ApiError('Study plan not found', 404);
  return result.rows[0];
}

export async function rebuildStudyPlan(
  client: Queryable,
  userId: string,
  planId: string,
  input: StudyPlanInput
) {
  const plan = await ownedPlan(client, userId, planId);
  if (plan.course_id !== input.courseId) throw new ApiError('A study plan cannot be moved to another course', 400);

  await client.query(
    `
      UPDATE study_plans
      SET exam_type = $1, exam_date = $2::date, start_date = $3::date, timezone = $4, updated_at = NOW()
      WHERE id = $5::bigint;
    `,
    [input.examType, input.examDate, input.startDate, input.timeZone, planId]
  );
  await writeAvailability(client, planId, input.availability);

  const existing = await client.query<{ id: string; has_completed: boolean }>(
    `
      SELECT t.id, EXISTS (
        SELECT 1 FROM study_tasks task WHERE task.topic_id = t.id AND task.completed_at IS NOT NULL
      ) AS has_completed
      FROM study_topics t
      WHERE t.plan_id = $1::bigint;
    `,
    [planId]
  );
  const existingIds = new Set(existing.rows.map((row) => String(row.id)));
  const retainedIds = new Set<string>();
  const retained = input.topics
    .map((topic, position) => ({ ...topic, position }))
    .filter((topic): topic is typeof topic & { id: string } => Boolean(topic.id && existingIds.has(topic.id)));
  retained.forEach((topic) => retainedIds.add(topic.id));

  if (retained.length > 0) {
    await client.query(
      `
        WITH retained_topics AS MATERIALIZED (
          SELECT item.id, item.title, item.difficulty, item.position
          FROM jsonb_to_recordset($1::jsonb) AS item(
            id TEXT,
            title TEXT,
            difficulty TEXT,
            position INTEGER
          )
        ),
        preserved_titles AS (
          UPDATE study_tasks task
          SET title_override = ${taskTitleSql('task', 'existing_topic')}
          FROM study_topics existing_topic
          JOIN retained_topics item ON item.id::bigint = existing_topic.id
          WHERE task.topic_id = existing_topic.id
            AND task.plan_id = $2::bigint
            AND task.completed_at IS NOT NULL
            AND task.title_override IS NULL
            AND existing_topic.title IS DISTINCT FROM item.title
          RETURNING task.id
        )
        UPDATE study_topics topic
        SET title = item.title,
            difficulty = item.difficulty,
            position = item.position,
            active = TRUE
        FROM retained_topics item
        WHERE topic.id = item.id::bigint
          AND topic.plan_id = $2::bigint
          AND (SELECT COUNT(*) FROM preserved_titles) >= 0;
      `,
      [JSON.stringify(retained), planId]
    );
  }

  const insertedTopics = await insertTopics(
    client,
    planId,
    input.topics
      .map((topic, position) => ({ ...topic, position }))
      .filter((topic) => !topic.id || !existingIds.has(topic.id))
  );
  const insertedByPosition = new Map(
    input.topics
      .map((topic, position) => ({ topic, position }))
      .filter(({ topic }) => !topic.id || !existingIds.has(topic.id))
      .map(({ position }, index) => [position, insertedTopics[index]])
  );
  const topics: ScheduleTopic[] = input.topics.map((topic, position) => {
    if (topic.id && retainedIds.has(topic.id)) {
      return { id: topic.id, title: topic.title, difficulty: topic.difficulty };
    }
    const inserted = insertedByPosition.get(position);
    if (!inserted) throw new ApiError('Unable to save study topic', 500);
    return inserted;
  });

  const removedWithHistory = existing.rows
    .filter((topic) => !retainedIds.has(String(topic.id)) && topic.has_completed)
    .map((topic) => String(topic.id));
  const removedWithoutHistory = existing.rows
    .filter((topic) => !retainedIds.has(String(topic.id)) && !topic.has_completed)
    .map((topic) => String(topic.id));
  if (removedWithHistory.length > 0) {
    await client.query(
      'UPDATE study_topics SET active = FALSE WHERE plan_id = $1::bigint AND id = ANY($2::bigint[])',
      [planId, removedWithHistory]
    );
  }
  if (removedWithoutHistory.length > 0) {
    await client.query(
      'DELETE FROM study_topics WHERE plan_id = $1::bigint AND id = ANY($2::bigint[])',
      [planId, removedWithoutHistory]
    );
  }

  const completed = await client.query<{ topic_id: string; phase: StudyPhase; completed_minutes: number }>(
    `
      SELECT
        task.topic_id,
        ${phaseTextSql('task')} AS phase,
        SUM(task.estimated_minutes)::integer AS completed_minutes
      FROM study_tasks task
      WHERE task.plan_id = $1::bigint AND task.completed_at IS NOT NULL
      GROUP BY task.topic_id, task.phase;
    `,
    [planId]
  );
  await client.query('DELETE FROM study_tasks WHERE plan_id = $1::bigint AND completed_at IS NULL', [planId]);

  const scheduleStart = [input.startDate, todayInTimeZone(input.timeZone)].sort().at(-1) as string;
  try {
    const tasks = scheduleStudyJobs(
      scheduleStart,
      input.examDate,
      input.availability,
      remainingJobs(topics, completed.rows)
    );
    await writeTasks(client, planId, tasks);
  } catch (err) {
    rethrowCapacity(err);
  }
}

export async function refreshStudyPlan(client: Queryable, userId: string, planId: string) {
  const plan = await ownedPlan(client, userId, planId);
  const availability = await client.query<ScheduleAvailability>(
    'SELECT weekday, minutes FROM study_plan_availability WHERE plan_id = $1::bigint ORDER BY weekday',
    [planId]
  );
  const pending = await client.query<{
    topic_id: string;
    title: string;
    position: number;
    phase: StudyPhase;
    minutes: number;
  }>(
    `
      SELECT
        t.id AS topic_id,
        t.title,
        t.position,
        ${phaseTextSql('task')} AS phase,
        SUM(task.estimated_minutes)::integer AS minutes
      FROM study_tasks task
      JOIN study_topics t ON t.id = task.topic_id
      WHERE task.plan_id = $1::bigint AND task.completed_at IS NULL
      GROUP BY t.id, t.title, t.position, task.phase
      ORDER BY task.phase, t.position;
    `,
    [planId]
  );
  const jobs = pending.rows
    .sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase) || a.position - b.position)
    .map((row) => ({
      topicId: String(row.topic_id),
      topicTitle: row.title,
      phase: row.phase,
      minutes: Number(row.minutes),
    }));
  const scheduleStart = [plan.start_date, todayInTimeZone(plan.timezone)].sort().at(-1) as string;

  try {
    const tasks = scheduleStudyJobs(scheduleStart, plan.exam_date, availability.rows, jobs);
    await client.query('DELETE FROM study_tasks WHERE plan_id = $1::bigint AND completed_at IS NULL', [planId]);
    await writeTasks(client, planId, tasks);
    await client.query('UPDATE study_plans SET updated_at = NOW() WHERE id = $1::bigint', [planId]);
  } catch (err) {
    rethrowCapacity(err);
  }
}

type SummaryFilters = {
  courseId?: string;
  planId?: string;
  activeOnly?: boolean;
};

async function queryStudyPlanSummaries(
  client: Queryable,
  userId: string,
  filters: SummaryFilters = {}
) {
  const where = ['c.user_id = $1'];
  const values: unknown[] = [userId];
  if (filters.courseId) {
    values.push(filters.courseId);
    where.push(`c.id = $${values.length}::bigint`);
  }
  if (filters.planId) {
    values.push(filters.planId);
    where.push(`p.id = $${values.length}::bigint`);
  }
  if (filters.activeOnly) where.push('p.archived = FALSE');

  return client.query(
    `
      WITH owned_plans AS MATERIALIZED (
        SELECT
          p.id,
          p.course_id,
          p.exam_type,
          p.exam_date,
          p.start_date,
          p.timezone,
          p.archived,
          p.created_at,
          p.updated_at,
          c.code AS course_code,
          c.name AS course_name,
          c.color AS course_color,
          c.homepage_url AS course_homepage_url,
          (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date AS local_today
        FROM study_plans p
        JOIN courses c ON c.id = p.course_id
        WHERE ${where.join(' AND ')}
      ),
      task_stats AS (
        SELECT
          task.plan_id,
          COUNT(*)::integer AS total_tasks,
          COUNT(*) FILTER (WHERE task.completed_at IS NOT NULL)::integer AS completed_tasks,
          COUNT(*) FILTER (
            WHERE task.completed_at IS NULL
              AND task.scheduled_date < plan.local_today
          )::integer AS overdue_tasks,
          MIN(task.scheduled_date) FILTER (
            WHERE task.completed_at IS NULL
              AND task.scheduled_date >= plan.local_today
          )::text AS next_study_date,
          COUNT(DISTINCT task.scheduled_date) FILTER (
            WHERE task.completed_at IS NULL
              AND task.scheduled_date >= plan.local_today
          )::integer AS study_days_left
        FROM study_tasks task
        JOIN owned_plans plan ON plan.id = task.plan_id
        GROUP BY task.plan_id
      ),
      topic_stats AS (
        SELECT topic.plan_id, COUNT(*) FILTER (WHERE topic.active)::integer AS active_topics
        FROM study_topics topic
        JOIN owned_plans plan ON plan.id = topic.plan_id
        GROUP BY topic.plan_id
      )
      SELECT
        p.id,
        p.course_id,
        p.exam_type,
        p.exam_date::text,
        p.start_date::text,
        p.timezone,
        p.archived,
        p.created_at,
        p.updated_at,
        p.course_code,
        p.course_name,
        p.course_color,
        p.course_homepage_url,
        COALESCE(task_stats.total_tasks, 0) AS total_tasks,
        COALESCE(task_stats.completed_tasks, 0) AS completed_tasks,
        COALESCE(task_stats.overdue_tasks, 0) AS overdue_tasks,
        COALESCE(task_stats.study_days_left, 0) AS study_days_left,
        task_stats.next_study_date,
        COALESCE(topic_stats.active_topics, 0) AS active_topics,
        next_task.title AS next_task_title,
        p.local_today::text AS local_today
      FROM owned_plans p
      LEFT JOIN task_stats ON task_stats.plan_id = p.id
      LEFT JOIN topic_stats ON topic_stats.plan_id = p.id
      LEFT JOIN LATERAL (
        SELECT ${taskTitleSql('task', 'topic')} AS title
        FROM study_tasks task
        JOIN study_topics topic ON topic.id = task.topic_id
        WHERE task.plan_id = p.id AND task.completed_at IS NULL
        ORDER BY task.scheduled_date, task.sequence, task.id
        LIMIT 1
      ) next_task ON TRUE
      ORDER BY p.exam_date, p.id;
    `,
    values
  );
}

export async function loadStudyPlanSummaries(client: Queryable, userId: string, courseId?: string) {
  const result = await queryStudyPlanSummaries(client, userId, { courseId });
  return { plans: result.rows };
}

export async function loadStudyPlanDefinition(client: Queryable, userId: string, planId: string) {
  const summaries = await queryStudyPlanSummaries(client, userId, { planId });
  const plan = summaries.rows[0];
  if (!plan) throw new ApiError('Study plan not found', 404);
  const availability = await client.query(
    'SELECT plan_id, weekday, minutes FROM study_plan_availability WHERE plan_id = $1::bigint ORDER BY weekday',
    [planId]
  );
  const topics = await client.query(
    `
      SELECT
        topic.id,
        topic.plan_id,
        topic.title,
        topic.difficulty,
        topic.position,
        topic.active,
        COUNT(task.id)::integer AS total_tasks,
        COUNT(task.id) FILTER (WHERE task.completed_at IS NOT NULL)::integer AS completed_tasks
      FROM study_topics topic
      LEFT JOIN study_tasks task ON task.topic_id = topic.id
      WHERE topic.plan_id = $1::bigint
      GROUP BY topic.id
      ORDER BY topic.position;
    `,
    [planId]
  );
  return { plan, availability: availability.rows, topics: topics.rows };
}

export async function loadStudyPlanTasks(
  client: Queryable,
  userId: string,
  planId: string,
  range: StudyTaskRange
) {
  await ownedPlan(client, userId, planId);
  const tasks = await client.query(
    `
      SELECT
        task.id,
        task.plan_id,
        task.topic_id,
        ${phaseTextSql('task')} AS phase,
        ${taskTitleSql('task', 'topic')} AS title,
        task.scheduled_date::text,
        task.estimated_minutes,
        task.completed_at,
        task.sequence
      FROM study_tasks task
      JOIN study_topics topic ON topic.id = task.topic_id
      WHERE task.plan_id = $1::bigint
        AND task.scheduled_date >= $2::date
        AND task.scheduled_date < $3::date
      ORDER BY task.scheduled_date, task.sequence, task.id;
    `,
    [planId, range.from, range.to]
  );
  return { ...range, tasks: tasks.rows };
}

export async function openStudyTaskNote(
  client: Queryable,
  userId: string,
  planId: string,
  taskId: string
): Promise<{ noteId: string; created: boolean }> {
  const task = await client.query<{
    plan_id: string;
    topic_id: string;
    course_id: string;
    title: string;
  }>(
    `
      SELECT
        task.plan_id,
        task.topic_id,
        plan.course_id,
        topic.title
      FROM study_tasks task
      JOIN study_topics topic ON topic.id = task.topic_id
      JOIN study_plans plan ON plan.id = task.plan_id
      JOIN courses course ON course.id = plan.course_id
      WHERE task.id = $1::bigint
        AND task.plan_id = $2::bigint
        AND course.user_id = $3
      FOR SHARE OF task;
    `,
    [taskId, planId, userId]
  );
  const ownedTask = task.rows[0];
  if (!ownedTask) throw new ApiError('Study task not found', 404);

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO notes (
        course_id,
        title,
        content,
        user_id,
        study_plan_id,
        study_topic_id
      )
      VALUES ($1::bigint, $2, $3, $4, $5::bigint, $6::bigint)
      ON CONFLICT (study_plan_id, study_topic_id) DO NOTHING
      RETURNING id;
    `,
    [
      ownedTask.course_id,
      ownedTask.title,
      TASK_NOTE_INITIAL_CONTENT,
      userId,
      ownedTask.plan_id,
      ownedTask.topic_id,
    ]
  );
  if (inserted.rows[0]) {
    return { noteId: String(inserted.rows[0].id), created: true };
  }

  const existing = await client.query<{ id: string }>(
    `
      SELECT id
      FROM notes
      WHERE study_plan_id = $1::bigint
        AND study_topic_id = $2::bigint
        AND user_id = $3
      LIMIT 1;
    `,
    [ownedTask.plan_id, ownedTask.topic_id, userId]
  );
  if (!existing.rows[0]) throw new ApiError('Unable to open the study task note', 409);
  return { noteId: String(existing.rows[0].id), created: false };
}

export async function loadStudyPlanDashboard(client: Queryable, userId: string) {
  const summaries = await queryStudyPlanSummaries(client, userId, { activeOnly: true });
  const activePlans = summaries.rows;
  const tasks = await client.query(
    `
      SELECT
        task.id,
        task.plan_id,
        task.topic_id,
        ${phaseTextSql('task')} AS phase,
        ${taskTitleSql('task', 'topic')} AS title,
        task.scheduled_date::text,
        task.estimated_minutes,
        task.completed_at,
        task.sequence,
        plan.course_id,
        course.code AS course_code,
        course.name AS course_name,
        course.color AS course_color
      FROM study_tasks task
      JOIN study_topics topic ON topic.id = task.topic_id
      JOIN study_plans plan ON plan.id = task.plan_id
      JOIN courses course ON course.id = plan.course_id
      WHERE course.user_id = $1
        AND plan.archived = FALSE
        AND task.completed_at IS NULL
        AND task.scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE plan.timezone)::date
      ORDER BY task.scheduled_date, plan.exam_date, task.sequence, task.id;
    `,
    [userId]
  );
  const upcomingPlans = activePlans
    .filter((plan) => String(plan.exam_date) >= String(plan.local_today))
    .slice(0, 3);
  const overduePlans = activePlans.filter((plan) => Number(plan.overdue_tasks) > 0);
  const nextStudyDate = activePlans
    .map((plan) => plan.next_study_date ? String(plan.next_study_date) : '')
    .filter(Boolean)
    .sort()[0] ?? null;
  return {
    plans: upcomingPlans,
    tasks: tasks.rows,
    activePlanCount: activePlans.length,
    overduePlanCount: overduePlans.length,
    urgentPlan: overduePlans.sort(
      (a, b) => Number(b.overdue_tasks) - Number(a.overdue_tasks) || String(a.exam_date).localeCompare(String(b.exam_date))
    )[0] ?? null,
    nextStudyDate,
  };
}

export async function loadStudyPlanCalendar(
  client: Queryable,
  userId: string,
  range: StudyTaskRange
) {
  const plans = await client.query(
    `
      SELECT
        plan.id,
        plan.course_id,
        plan.exam_type,
        plan.exam_date::text,
        plan.start_date::text,
        plan.timezone,
        plan.archived,
        plan.created_at,
        plan.updated_at,
        course.code AS course_code,
        course.name AS course_name,
        course.color AS course_color
      FROM study_plans plan
      JOIN courses course ON course.id = plan.course_id
      WHERE course.user_id = $1
        AND plan.archived = FALSE
        AND (
          (plan.exam_date >= $2::date AND plan.exam_date < $3::date)
          OR EXISTS (
            SELECT 1
            FROM study_tasks task
            WHERE task.plan_id = plan.id
              AND task.scheduled_date >= $2::date
              AND task.scheduled_date < $3::date
          )
        )
      ORDER BY plan.exam_date, plan.id;
    `,
    [userId, range.from, range.to]
  );
  const tasks = await client.query(
    `
      SELECT
        task.id,
        task.plan_id,
        task.topic_id,
        ${phaseTextSql('task')} AS phase,
        ${taskTitleSql('task', 'topic')} AS title,
        task.scheduled_date::text,
        task.estimated_minutes,
        task.completed_at,
        task.sequence
      FROM study_tasks task
      JOIN study_topics topic ON topic.id = task.topic_id
      JOIN study_plans plan ON plan.id = task.plan_id
      JOIN courses course ON course.id = plan.course_id
      WHERE course.user_id = $1
        AND plan.archived = FALSE
        AND task.scheduled_date >= $2::date
        AND task.scheduled_date < $3::date
      ORDER BY task.scheduled_date, task.sequence, task.id;
    `,
    [userId, range.from, range.to]
  );
  return { ...range, plans: plans.rows, tasks: tasks.rows };
}
