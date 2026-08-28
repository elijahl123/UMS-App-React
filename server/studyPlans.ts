import type { PoolClient } from 'pg';
import { ApiError } from './errors';
import {
  buildStudyJobs,
  PHASE_LABELS,
  scheduleStudyJobs,
  StudyPlanCapacityError,
  todayInTimeZone,
  type ScheduleAvailability,
  type ScheduleJob,
  type ScheduleTopic,
  type StudyDifficulty,
  type StudyPhase,
  type StudyPlanMode,
  type PhasePreset,
  scheduleEvenWork,
} from './studyPlanScheduler';

type Queryable = Pick<PoolClient, 'query'>;
export const TASK_NOTE_INITIAL_CONTENT = '<ul><li><p></p></li></ul>';

export type StudyTargetType = 'exam' | 'assignment' | 'project' | 'general';
const TARGET_TYPES: StudyTargetType[] = ['exam', 'assignment', 'project', 'general'];

export type StudyPlanInput = {
  courseId: string;
  targetType?: StudyTargetType;
  targetTitle?: string;
  targetDate?: string;
  targetTime?: string | null;
  targetAssignmentId?: string | null;
  estimatedMinutes?: number | null;
  dailyCapMinutes?: number | null;
  partialPlanAcknowledged?: boolean;
  examType: 'midterm' | 'final';
  examDate: string;
  startDate: string;
  timeZone: string;
  availability: ScheduleAvailability[];
  topics: Array<{ id?: string; title: string; difficulty: StudyDifficulty }>;
  topicMode?: StudyPlanMode;
  phasePreset?: PhasePreset;
};

export type StudyTaskRange = {
  from: string;
  to: string;
};

const PHASE_CODES: Record<StudyPhase, number> = {
  learn: 0,
  practice: 1,
  recall: 2,
  review: 3,
};

function phaseCode(phase: StudyPhase): number {
  return PHASE_CODES[phase];
}

function phaseTextSql(taskAlias: string): string {
  return `CASE ${taskAlias}.phase WHEN 0 THEN 'learn' WHEN 1 THEN 'practice' WHEN 2 THEN 'recall' ELSE 'review' END`;
}

/**
 * Task titles are derived rather than stored, so the phase preset chosen at
 * creation has to reach every read query. `presetExpr` is either a joined
 * `study_plans.phase_preset` column or a bind parameter.
 */
function taskTitleSql(taskAlias: string, topicAlias: string, presetExpr: string): string {
  const labels = (preset: PhasePreset) => `CASE ${taskAlias}.phase
        WHEN 0 THEN '${PHASE_LABELS[preset].learn.replace(/'/g, "''")}'
        WHEN 1 THEN '${PHASE_LABELS[preset].practice.replace(/'/g, "''")}'
        WHEN 2 THEN '${PHASE_LABELS[preset].recall.replace(/'/g, "''")}'
        ELSE '${PHASE_LABELS[preset].review.replace(/'/g, "''")}'
      END`;
  return `COALESCE(
    ${taskAlias}.title_override,
    CASE WHEN ${presetExpr} = 'general'
      THEN ${labels('general')}
      ELSE ${labels('study')}
    END || ': ' || ${topicAlias}.title
  )`;
}

function schedulerExplanationFor(mode: StudyPlanMode, preset: PhasePreset): string {
  const phases = preset === 'general' ? 'first pass, deepen, and review' : 'learn, practice, and recall';
  return mode === 'single'
    ? 'Topic work is scheduled as a single task per topic across the available days.'
    : `Topic work is scheduled in ${phases} phases across the available days.`;
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
  const requestedType = source.targetType ?? 'exam';
  if (!TARGET_TYPES.includes(requestedType as StudyTargetType)) {
    throw new ApiError('targetType must be exam, assignment, project, or general', 400);
  }
  const targetType = requestedType as StudyTargetType;
  const examType = targetType === 'exam' ? source.examType : 'final';
  const targetDate = normalizeDate(targetType === 'exam' ? source.examDate : (source.targetDate ?? source.examDate), 'targetDate');
  const examDate = targetDate;
  const startDate = normalizeDate(source.startDate, 'startDate');
  const timeZone = normalizeTimeZone(source.timeZone);
  const targetTitle = String(source.targetTitle ?? (targetType === 'exam'
    ? (examType === 'midterm' ? 'Midterm exam' : 'Final exam')
    : '')).trim().replace(/\s+/g, ' ');
  const rawTargetTime = String(source.targetTime ?? '').trim();
  const targetTime = rawTargetTime ? (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rawTargetTime) ? rawTargetTime : null) : null;
  if (rawTargetTime && !targetTime) throw new ApiError('targetTime must use HH:MM', 400);
  const targetAssignmentId = source.targetAssignmentId ? String(source.targetAssignmentId) : null;
  const partialPlanAcknowledged = source.partialPlanAcknowledged === true;
  const requestedTopicMode = source.topicMode ?? 'phases';
  if (requestedTopicMode !== 'phases' && requestedTopicMode !== 'single') {
    throw new ApiError('topicMode must be phases or single', 400);
  }
  const topicMode = requestedTopicMode as StudyPlanMode;
  const requestedPreset = source.phasePreset ?? 'study';
  if (requestedPreset !== 'study' && requestedPreset !== 'general') {
    throw new ApiError('phasePreset must be study or general', 400);
  }
  const phasePreset = requestedPreset as PhasePreset;

  if (!courseId) throw new ApiError('courseId is required', 400);
  if (targetType === 'exam' && examType !== 'midterm' && examType !== 'final') {
    throw new ApiError('examType must be midterm or final', 400);
  }
  if (startDate >= targetDate) {
    throw new ApiError('A plan needs at least one day between its start and its target date', 400);
  }
  if (!targetTitle || targetTitle.length > 200) throw new ApiError('targetTitle must be between 1 and 200 characters', 400);

  // Topics are what a plan is normally built from, but an assignment, project,
  // or general target can instead be a single body of work with a time estimate.
  // An empty topic list is the signal for that even-split path.
  const topicSource = Array.isArray(source.topics) ? source.topics : [];
  if (topicSource.length > 100) throw new ApiError('A plan needs between 1 and 100 topics', 400);
  if (targetType === 'exam' && topicSource.length < 1) {
    throw new ApiError('An exam plan needs between 1 and 100 topics', 400);
  }
  const usesTopics = topicSource.length > 0;

  const estimatedMinutes = usesTopics ? null : Number(source.estimatedMinutes);
  const dailyCapMinutes = usesTopics ? null : Number(source.dailyCapMinutes);
  if (!usesTopics) {
    if (!Number.isInteger(estimatedMinutes) || (estimatedMinutes as number) < 15 || (estimatedMinutes as number) > 10080 || (estimatedMinutes as number) % 15 !== 0) {
      throw new ApiError('estimatedMinutes must be a multiple of 15 between 15 and 10080', 400);
    }
    if (!Number.isInteger(dailyCapMinutes) || (dailyCapMinutes as number) < 15 || (dailyCapMinutes as number) > 720 || (dailyCapMinutes as number) % 15 !== 0) {
      throw new ApiError('dailyCapMinutes must be a multiple of 15 between 15 and 720', 400);
    }
  }

  const availabilitySource = !usesTopics && Array.isArray(source.availableWeekdays)
    ? source.availableWeekdays.map((weekday) => ({ weekday, minutes: dailyCapMinutes }))
    : source.availability;
  if (!Array.isArray(availabilitySource)) throw new ApiError('availability must be an array', 400);
  const availabilityByDay = new Map<number, number>();
  availabilitySource.forEach((entry) => {
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
    throw new ApiError('At least one day needs available time', 400);
  }

  const topics = topicSource.map((entry) => {
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

  return {
    courseId, targetType, targetTitle, targetDate, targetTime, targetAssignmentId,
    estimatedMinutes, dailyCapMinutes, partialPlanAcknowledged,
    examType: examType as 'midterm' | 'final', examDate, startDate, timeZone, availability, topics,
    topicMode, phasePreset,
  };
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
  return phase === 'learn' ? 0 : phase === 'practice' ? 1 : phase === 'recall' ? 2 : 3;
}

function remainingJobs(
  topics: ScheduleTopic[],
  completedRows: Array<{ topic_id: string | number; phase: StudyPhase; completed_minutes: number }>,
  mode: StudyPlanMode
): ScheduleJob[] {
  const completed = new Map(
    completedRows.map((row) => [`${row.topic_id}:${row.phase}`, Number(row.completed_minutes)])
  );
  return buildStudyJobs(topics, mode)
    .map((job) => ({
      ...job,
      minutes: Math.max(0, job.minutes - (completed.get(`${job.topicId}:${job.phase}`) ?? 0)),
    }))
    .filter((job) => job.minutes > 0);
}

function unscheduledMinutesFor(
  jobs: ScheduleJob[],
  tasks: Array<{ minutes: number }>
): number {
  const required = jobs.reduce((sum, job) => sum + job.minutes, 0);
  const scheduled = tasks.reduce((sum, task) => sum + task.minutes, 0);
  return Math.max(0, required - scheduled);
}

async function writeUnscheduledMinutes(client: Queryable, planId: string, minutes: number) {
  await client.query(
    'UPDATE study_plans SET unscheduled_minutes = $2, updated_at = NOW() WHERE id = $1::bigint',
    [planId, minutes]
  );
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

async function writeEvenWorkTasks(
  client: Queryable,
  planId: string,
  topicId: string,
  targetTitle: string,
  tasks: Array<{ scheduledDate: string; minutes: number; sequence: number }>
) {
  if (tasks.length === 0) return;
  await client.query(
    `
      INSERT INTO study_tasks (
        plan_id, topic_id, phase, scheduled_date, estimated_minutes, sequence, title_override
      )
      SELECT $1::bigint, $2::bigint, 0, item.scheduled_date::date,
             item.estimated_minutes, item.sequence, $3
      FROM jsonb_to_recordset($4::jsonb) AS item(
        scheduled_date TEXT, estimated_minutes SMALLINT, sequence INTEGER
      );
    `,
    [
      planId,
      topicId,
      `Work on: ${targetTitle}`,
      JSON.stringify(tasks.map((task) => ({
        scheduled_date: task.scheduledDate,
        estimated_minutes: task.minutes,
        sequence: task.sequence,
      }))),
    ]
  );
}

function evenScheduleForInput(input: StudyPlanInput, startDate = input.startDate) {
  return scheduleEvenWork({
    startDate,
    dueDate: input.targetDate ?? input.examDate,
    estimatedMinutes: input.estimatedMinutes ?? 0,
    availableWeekdays: input.availability.filter((entry) => entry.minutes > 0).map((entry) => entry.weekday),
    maximumMinutesPerDay: input.dailyCapMinutes ?? Math.max(...input.availability.map((entry) => entry.minutes), 0),
  });
}

function assertPartialPlanAcknowledged(input: StudyPlanInput, schedule: ReturnType<typeof scheduleEvenWork>) {
  if (schedule.unscheduledMinutes > 0 && !input.partialPlanAcknowledged) {
    throw new ApiError(JSON.stringify({
      code: 'INSUFFICIENT_STUDY_CAPACITY',
      requiredMinutes: input.estimatedMinutes,
      availableMinutes: schedule.availableMinutes,
      missingMinutes: schedule.unscheduledMinutes,
      partialAllowed: true,
    }), 409);
  }
}

/**
 * A plan with no topics is a single body of work: one flat estimate divided
 * evenly across the chosen weekdays, recorded as scheduler version 2.
 */
async function createEvenWorkStudyPlan(client: Queryable, userId: string, input: StudyPlanInput): Promise<string> {
  const targetTitle = input.targetTitle ?? 'Plan target';
  const schedule = evenScheduleForInput(input);
  assertPartialPlanAcknowledged(input, schedule);
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO study_plans (
        course_id, exam_type, exam_date, start_date, timezone,
        target_type, target_assignment_id, target_title, target_date, target_time,
        estimated_minutes, daily_cap_minutes, scheduler_version, scheduler_explanation,
        unscheduled_minutes, partial_plan_acknowledged
      )
      SELECT c.id, 'final', $3::date, $4::date, $5,
             $2, owned_assignment.id, $6, $3::date, $7::time,
             $8, $9, $10, $11, $12, $13
      FROM courses c
      LEFT JOIN LATERAL (
        SELECT a.id FROM assignments a
        WHERE a.id = NULLIF($14, '')::bigint AND a.course_id = c.id
      ) owned_assignment ON TRUE
      WHERE c.id = $1::bigint AND c.user_id = $15
      RETURNING id::text;
    `,
    [
      input.courseId, input.targetType, input.targetDate, input.startDate, input.timeZone,
      targetTitle, input.targetTime, input.estimatedMinutes, input.dailyCapMinutes,
      schedule.schedulerVersion, schedule.explanation, schedule.unscheduledMinutes,
      Boolean(input.partialPlanAcknowledged), input.targetAssignmentId ?? null, userId,
    ]
  );
  const planId = inserted.rows[0]?.id;
  if (!planId) throw new ApiError('Course not found', 404);
  await writeAvailability(client, planId, input.availability);
  const topic = await insertTopics(client, planId, [{ title: targetTitle, difficulty: 'light', position: 0 }]);
  if (!topic[0]) throw new ApiError('Unable to create the plan target', 500);
  await writeEvenWorkTasks(client, planId, topic[0].id, targetTitle, schedule.tasks);
  return planId;
}

/**
 * Topic plans are scheduled from their topics. `allowPartial` lets a plan save
 * with a visible shortfall instead of failing outright, which the setup page
 * offers behind an explicit acknowledgement.
 */
export async function createStudyPlan(client: Queryable, userId: string, input: StudyPlanInput): Promise<string> {
  if (input.topics.length === 0) return createEvenWorkStudyPlan(client, userId, input);
  const topicMode: StudyPlanMode = input.topicMode ?? 'phases';
  const phasePreset: PhasePreset = input.phasePreset ?? 'study';
  const targetType = input.targetType ?? 'exam';
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO study_plans (
        course_id, exam_type, exam_date, start_date, timezone,
        target_type, target_assignment_id, target_title, target_date, target_time,
        scheduler_version, scheduler_explanation, topic_mode, phase_preset,
        partial_plan_acknowledged
      )
      SELECT c.id, $2, $3::date, $4::date, $5,
             $9, owned_assignment.id, $10, $3::date, $11::time,
             1, $7, $8, $13, $14
      FROM courses c
      LEFT JOIN LATERAL (
        SELECT a.id FROM assignments a
        WHERE a.id = NULLIF($12, '')::bigint AND a.course_id = c.id
      ) owned_assignment ON TRUE
      WHERE c.id = $1::bigint AND c.user_id = $6
      RETURNING id;
    `,
    [
      input.courseId, input.examType, input.examDate, input.startDate, input.timeZone, userId,
      schedulerExplanationFor(topicMode, phasePreset), topicMode,
      targetType, input.targetTitle, input.targetTime, input.targetAssignmentId ?? null,
      phasePreset, Boolean(input.partialPlanAcknowledged),
    ]
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
    const jobs = buildStudyJobs(topics, topicMode);
    const tasks = scheduleStudyJobs(input.startDate, input.examDate, input.availability, jobs, {
      preset: phasePreset,
      allowPartial: Boolean(input.partialPlanAcknowledged),
    });
    await writeTasks(client, planId, tasks);
    await writeUnscheduledMinutes(client, planId, unscheduledMinutesFor(jobs, tasks));
  } catch (err) {
    rethrowCapacity(err);
  }
  return planId;
}

async function ownedPlan(
  client: Queryable,
  userId: string,
  planId: string
): Promise<{
  id: string;
  course_id: string;
  exam_date: string;
  start_date: string;
  timezone: string;
  target_type?: StudyTargetType;
  target_title?: string | null;
  target_date?: string | null;
  estimated_minutes?: number | null;
  daily_cap_minutes?: number | null;
  partial_plan_acknowledged?: boolean;
  topic_mode: StudyPlanMode;
  phase_preset: PhasePreset;
  scheduler_version: number;
}> {
  const result = await client.query<{
    id: string;
    course_id: string;
    exam_date: string;
    start_date: string;
    timezone: string;
    target_type: StudyTargetType;
    target_title: string | null;
    target_date: string | null;
    estimated_minutes: number | null;
    daily_cap_minutes: number | null;
    partial_plan_acknowledged: boolean;
    topic_mode: StudyPlanMode;
    phase_preset: PhasePreset;
    scheduler_version: number;
  }>(
    `
      SELECT p.id, p.course_id, p.exam_date::text, p.start_date::text, p.timezone,
             p.target_type, p.target_title, p.target_date::text,
             p.estimated_minutes, p.daily_cap_minutes, p.partial_plan_acknowledged, p.topic_mode,
             p.phase_preset, p.scheduler_version
      FROM study_plans p
      JOIN courses c ON c.id = p.course_id
      WHERE p.id = $1::bigint AND c.user_id = $2;
    `,
    [planId, userId]
  );
  if (!result.rows[0]) throw new ApiError('Plan not found', 404);
  return result.rows[0];
}

async function rebuildEvenWorkStudyPlan(
  client: Queryable,
  userId: string,
  planId: string,
  input: StudyPlanInput
) {
  const plan = await ownedPlan(client, userId, planId);
  if (plan.course_id !== input.courseId) throw new ApiError('A plan cannot be moved to another course', 400);
  const targetTitle = input.targetTitle ?? 'Plan target';
  const completed = await client.query<{ minutes: number }>(
    `SELECT COALESCE(SUM(estimated_minutes), 0)::integer AS minutes FROM study_tasks WHERE plan_id = $1::bigint AND completed_at IS NOT NULL`,
    [planId]
  );
  const remainingMinutes = Math.max(0, (input.estimatedMinutes ?? 0) - Number(completed.rows[0]?.minutes ?? 0));
  const scheduleStart = [input.startDate, todayInTimeZone(input.timeZone)].sort().at(-1) as string;
  const schedule = evenScheduleForInput({ ...input, estimatedMinutes: remainingMinutes }, scheduleStart);
  assertPartialPlanAcknowledged(input, schedule);

  await client.query(
    `
      UPDATE study_plans p
      SET exam_type = 'final', exam_date = $2::date, start_date = $3::date, timezone = $4,
          target_type = $5, target_assignment_id = owned_assignment.id,
          target_title = $6, target_date = $2::date, target_time = $7::time,
          estimated_minutes = $8, daily_cap_minutes = $9,
          scheduler_version = $10, scheduler_explanation = $11,
          unscheduled_minutes = $12, partial_plan_acknowledged = $13,
          updated_at = NOW()
      FROM courses c
      LEFT JOIN LATERAL (
        SELECT a.id FROM assignments a
        WHERE a.id = NULLIF($14, '')::bigint AND a.course_id = c.id
      ) owned_assignment ON TRUE
      WHERE p.id = $1::bigint AND p.course_id = c.id AND c.user_id = $15;
    `,
    [
      planId, input.targetDate, input.startDate, input.timeZone, input.targetType,
      targetTitle, input.targetTime, input.estimatedMinutes, input.dailyCapMinutes,
      schedule.schedulerVersion, schedule.explanation, schedule.unscheduledMinutes,
      Boolean(input.partialPlanAcknowledged), input.targetAssignmentId ?? null, userId,
    ]
  );
  await writeAvailability(client, planId, input.availability);
  await client.query('DELETE FROM study_tasks WHERE plan_id = $1::bigint AND completed_at IS NULL', [planId]);
  let topic = await client.query<{ id: string }>(
    `
      UPDATE study_topics SET title = $2, difficulty = 'light', active = TRUE
      WHERE id = (SELECT id FROM study_topics WHERE plan_id = $1::bigint ORDER BY position, id LIMIT 1)
      RETURNING id::text;
    `,
    [planId, targetTitle]
  );
  if (!topic.rows[0]) {
    const inserted = await insertTopics(client, planId, [{ title: targetTitle, difficulty: 'light', position: 0 }]);
    topic = { rows: inserted.map((item) => ({ id: item.id })) } as typeof topic;
  }
  await writeEvenWorkTasks(client, planId, topic.rows[0].id, targetTitle, schedule.tasks);
}

export async function rebuildStudyPlan(
  client: Queryable,
  userId: string,
  planId: string,
  input: StudyPlanInput
) {
  if (input.topics.length === 0) {
    await rebuildEvenWorkStudyPlan(client, userId, planId, input);
    return;
  }
  const plan = await ownedPlan(client, userId, planId);
  if (plan.course_id !== input.courseId) throw new ApiError('A plan cannot be moved to another course', 400);

  // A plan that previously split a flat estimate evenly (scheduler_version 2)
  // becomes a topic plan when topics are added. It never chose a task style, so
  // the one picked in the editor applies. An existing topic plan keeps its own,
  // because completed work is already tracked per phase.
  const convertsFromEvenSplit = Number(plan.scheduler_version) === 2;
  const topicMode: StudyPlanMode = convertsFromEvenSplit ? (input.topicMode ?? 'phases') : plan.topic_mode;
  const phasePreset: PhasePreset = convertsFromEvenSplit
    ? (input.phasePreset ?? 'study')
    : (plan.phase_preset ?? 'study');

  await client.query(
    `
      UPDATE study_plans
      SET exam_type = $1, exam_date = $2::date, start_date = $3::date, timezone = $4,
          target_type = $7, target_assignment_id = NULL,
          target_title = $8,
          target_date = $2::date, target_time = $9::time,
          estimated_minutes = NULL, daily_cap_minutes = NULL,
          scheduler_version = 1,
          scheduler_explanation = $6,
          topic_mode = $11, phase_preset = $12,
          unscheduled_minutes = 0, partial_plan_acknowledged = $10,
          updated_at = NOW()
      WHERE id = $5::bigint;
    `,
    [
      input.examType, input.examDate, input.startDate, input.timeZone, planId,
      schedulerExplanationFor(topicMode, phasePreset),
      input.targetType ?? 'exam', input.targetTitle, input.targetTime,
      Boolean(input.partialPlanAcknowledged), topicMode, phasePreset,
    ]
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
          SET title_override = ${taskTitleSql('task', 'existing_topic', '$3')}
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
      [JSON.stringify(retained), planId, phasePreset]
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
    const jobs = remainingJobs(topics, completed.rows, topicMode);
    const tasks = scheduleStudyJobs(scheduleStart, input.examDate, input.availability, jobs, {
      preset: phasePreset,
      allowPartial: Boolean(input.partialPlanAcknowledged),
    });
    await writeTasks(client, planId, tasks);
    await writeUnscheduledMinutes(client, planId, unscheduledMinutesFor(jobs, tasks));
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
  if (Number(plan.scheduler_version) === 2) {
    const completed = await client.query<{ minutes: number }>(
      `SELECT COALESCE(SUM(estimated_minutes), 0)::integer AS minutes FROM study_tasks WHERE plan_id = $1::bigint AND completed_at IS NOT NULL`,
      [planId]
    );
    const remainingMinutes = Math.max(0, Number(plan.estimated_minutes ?? 0) - Number(completed.rows[0]?.minutes ?? 0));
    const scheduleStart = [plan.start_date, todayInTimeZone(plan.timezone)].sort().at(-1) as string;
    const input: StudyPlanInput = {
      courseId: plan.course_id,
      targetType: plan.target_type,
      targetTitle: plan.target_title ?? 'Study target',
      targetDate: plan.target_date ?? plan.exam_date,
      targetTime: null,
      targetAssignmentId: null,
      estimatedMinutes: remainingMinutes,
      dailyCapMinutes: Number(plan.daily_cap_minutes ?? Math.max(...availability.rows.map((entry) => entry.minutes), 0)),
      partialPlanAcknowledged: Boolean(plan.partial_plan_acknowledged),
      examType: 'final',
      examDate: plan.target_date ?? plan.exam_date,
      startDate: plan.start_date,
      timeZone: plan.timezone,
      availability: availability.rows,
      topics: [{ title: plan.target_title ?? 'Study target', difficulty: 'light' }],
    };
    const schedule = evenScheduleForInput(input, scheduleStart);
    assertPartialPlanAcknowledged(input, schedule);
    const topic = await client.query<{ id: string }>(
      `SELECT id::text FROM study_topics WHERE plan_id = $1::bigint ORDER BY position, id LIMIT 1`,
      [planId]
    );
    if (!topic.rows[0]) throw new ApiError('Study target not found', 500);
    await client.query('DELETE FROM study_tasks WHERE plan_id = $1::bigint AND completed_at IS NULL', [planId]);
    await writeEvenWorkTasks(client, planId, topic.rows[0].id, input.targetTitle ?? 'Study target', schedule.tasks);
    await client.query(
      `UPDATE study_plans SET unscheduled_minutes = $2, scheduler_version = $3, scheduler_explanation = $4, updated_at = NOW() WHERE id = $1::bigint`,
      [planId, schedule.unscheduledMinutes, schedule.schedulerVersion, schedule.explanation]
    );
    return;
  }
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
    const tasks = scheduleStudyJobs(scheduleStart, plan.exam_date, availability.rows, jobs, {
      preset: plan.phase_preset ?? 'study',
    });
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
          p.target_type,
          p.target_assignment_id,
          p.target_title,
          p.target_date,
          p.target_time,
          p.estimated_minutes,
          p.daily_cap_minutes,
          p.scheduler_version,
          p.scheduler_explanation,
          p.unscheduled_minutes,
          p.partial_plan_acknowledged,
          p.topic_mode,
          p.phase_preset,
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
      ),
      daily_work AS (
        SELECT task.plan_id, task.scheduled_date,
               SUM(task.estimated_minutes)::integer AS scheduled_minutes,
               COALESCE(capacity_override.minutes, availability.minutes, 0)::integer AS capacity_minutes
        FROM study_tasks task
        JOIN owned_plans plan ON plan.id = task.plan_id
        LEFT JOIN study_plan_availability availability
          ON availability.plan_id = task.plan_id
         AND availability.weekday = EXTRACT(DOW FROM task.scheduled_date)::integer
        LEFT JOIN study_plan_capacity_overrides capacity_override
          ON capacity_override.plan_id = task.plan_id
         AND capacity_override.study_date = task.scheduled_date
        WHERE task.completed_at IS NULL AND task.scheduled_date >= plan.local_today
        GROUP BY task.plan_id, task.scheduled_date, capacity_override.minutes, availability.minutes
      ),
      recovery_stats AS (
        SELECT plan_id,
               SUM(GREATEST(0, scheduled_minutes - capacity_minutes))::integer AS over_capacity_minutes,
               COUNT(*) FILTER (WHERE scheduled_minutes > capacity_minutes)::integer AS over_capacity_days
        FROM daily_work
        GROUP BY plan_id
      )
      SELECT
        p.id,
        p.course_id,
        p.exam_type,
        p.exam_date::text,
        p.target_type,
        p.target_assignment_id,
        p.target_title,
        p.target_date::text,
        p.target_time::text,
        p.estimated_minutes,
        p.daily_cap_minutes,
        p.scheduler_version,
        p.scheduler_explanation,
        p.unscheduled_minutes,
        p.partial_plan_acknowledged,
        p.topic_mode,
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
        COALESCE(recovery_stats.over_capacity_minutes, 0) AS over_capacity_minutes,
        COALESCE(recovery_stats.over_capacity_days, 0) AS over_capacity_days,
        (
          COALESCE(task_stats.overdue_tasks, 0) > 0
          OR COALESCE(recovery_stats.over_capacity_minutes, 0) > 0
        ) AS recovery_needed,
        COALESCE(task_stats.study_days_left, 0) AS study_days_left,
        task_stats.next_study_date,
        COALESCE(topic_stats.active_topics, 0) AS active_topics,
        next_task.title AS next_task_title,
        p.local_today::text AS local_today
      FROM owned_plans p
      LEFT JOIN task_stats ON task_stats.plan_id = p.id
      LEFT JOIN topic_stats ON topic_stats.plan_id = p.id
      LEFT JOIN recovery_stats ON recovery_stats.plan_id = p.id
      LEFT JOIN LATERAL (
        SELECT ${taskTitleSql('task', 'topic', 'p.phase_preset')} AS title
        FROM study_tasks task
        JOIN study_topics topic ON topic.id = task.topic_id
        WHERE task.plan_id = p.id AND task.completed_at IS NULL
        ORDER BY task.scheduled_date, task.sequence, task.id
        LIMIT 1
      ) next_task ON TRUE
      ORDER BY COALESCE(p.target_date, p.exam_date), p.id;
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
        ${taskTitleSql('task', 'topic', 'plan.phase_preset')} AS title,
        task.scheduled_date::text,
        task.estimated_minutes,
        task.completed_at,
        task.sequence
      FROM study_tasks task
      JOIN study_topics topic ON topic.id = task.topic_id
      JOIN study_plans plan ON plan.id = task.plan_id
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
        ${taskTitleSql('task', 'topic', 'plan.phase_preset')} AS title,
        task.scheduled_date::text,
        task.estimated_minutes,
        task.completed_at,
        task.sequence,
        plan.course_id,
        course.code AS course_code,
        course.name AS course_name,
        course.color AS course_color,
        course.homepage_url AS course_homepage_url
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
    .filter((plan) => String(plan.exam_date) >= String(plan.local_today));
  const recoveryPlans = activePlans.filter((plan) =>
    Boolean(plan.recovery_needed)
      || Number(plan.overdue_tasks) > 0
      || Number(plan.over_capacity_minutes) > 0
  );
  const nextStudyDate = activePlans
    .map((plan) => plan.next_study_date ? String(plan.next_study_date) : '')
    .filter(Boolean)
    .sort()[0] ?? null;
  return {
    plans: upcomingPlans,
    tasks: tasks.rows,
    activePlanCount: activePlans.length,
    overduePlanCount: activePlans.filter((plan) => Number(plan.overdue_tasks) > 0).length,
    recoveryPlanCount: recoveryPlans.length,
    urgentPlan: recoveryPlans.sort(
      (a, b) => Number(b.overdue_tasks) - Number(a.overdue_tasks)
        || Number(b.over_capacity_minutes) - Number(a.over_capacity_minutes)
        || String(a.exam_date).localeCompare(String(b.exam_date))
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
        plan.target_type,
        plan.target_assignment_id,
        plan.target_title,
        plan.target_date::text,
        plan.target_time::text,
        plan.estimated_minutes,
        plan.daily_cap_minutes,
        plan.scheduler_version,
        plan.scheduler_explanation,
        plan.unscheduled_minutes,
        plan.partial_plan_acknowledged,
        plan.start_date::text,
        plan.timezone,
        plan.archived,
        plan.created_at,
        plan.updated_at,
        course.code AS course_code,
        course.name AS course_name,
        course.color AS course_color,
        course.homepage_url AS course_homepage_url
      FROM study_plans plan
      JOIN courses course ON course.id = plan.course_id
      WHERE course.user_id = $1
        AND plan.archived = FALSE
        AND (
          (COALESCE(plan.target_date, plan.exam_date) >= $2::date AND COALESCE(plan.target_date, plan.exam_date) < $3::date)
          OR EXISTS (
            SELECT 1
            FROM study_tasks task
            WHERE task.plan_id = plan.id
              AND task.scheduled_date >= $2::date
              AND task.scheduled_date < $3::date
          )
        )
      ORDER BY COALESCE(plan.target_date, plan.exam_date), plan.id;
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
        ${taskTitleSql('task', 'topic', 'plan.phase_preset')} AS title,
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
