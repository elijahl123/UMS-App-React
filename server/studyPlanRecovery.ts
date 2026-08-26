import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from './errors';
import {
  planStudyRecovery,
  todayInTimeZone,
  type RecoveryTaskInput,
  type StudyPhase,
  type StudyRecoveryPlan,
} from './studyPlanScheduler';

type Queryable = Pick<PoolClient, 'query'>;

type RecoveryPlanRow = {
  id: string;
  target_date: string;
  timezone: string;
  unscheduled_minutes: number;
};

type RecoveryTaskRow = {
  id: string;
  topic_id: string;
  topic_title: string;
  topic_position: number;
  phase: StudyPhase;
  title: string;
  title_override: string | null;
  scheduled_date: string;
  estimated_minutes: number;
  sequence: number;
  manually_edited_at: string | null;
};

type RecoveryState = {
  plan: RecoveryPlanRow;
  availability: Array<{ weekday: number; minutes: number }>;
  capacityOverrides: Array<{ date: string; minutes: number }>;
  tasks: RecoveryTaskInput[];
};

type RecoverySnapshotTask = {
  topicId: string;
  phase: StudyPhase;
  titleOverride: string | null;
  scheduledDate: string;
  minutes: number;
  sequence: number;
};

function phaseCode(phase: StudyPhase): number {
  return phase === 'learn' ? 0 : phase === 'practice' ? 1 : phase === 'recall' ? 2 : 3;
}

function recoveryError(code: string, status: number, details: Record<string, unknown> = {}): ApiError {
  return new ApiError(JSON.stringify({ code, ...details }), status);
}

function normalizeOmissionIds(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ApiError('omittedGroupIds must be an array of strings', 400);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].sort();
}

function normalizeAdditionalMinutes(value: unknown): number {
  const minutes = value == null ? 0 : Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 720 || minutes % 15 !== 0) {
    throw new ApiError('additionalMinutesPerDay must be a multiple of 15 between 0 and 720', 400);
  }
  return minutes;
}

async function loadRecoveryState(
  client: Queryable,
  userId: string,
  planId: string,
  lock = false
): Promise<RecoveryState> {
  const plan = await client.query<RecoveryPlanRow>(
    `
      SELECT p.id::text, COALESCE(p.target_date, p.exam_date)::text AS target_date,
             p.timezone, p.unscheduled_minutes
      FROM study_plans p
      JOIN courses c ON c.id = p.course_id
      WHERE p.id = $1::bigint AND c.user_id = $2
      ${lock ? 'FOR UPDATE OF p' : ''};
    `,
    [planId, userId]
  );
  if (!plan.rows[0]) throw new ApiError('Study plan not found', 404);

  const [availability, capacityOverrides, taskRows, fallbackTopic] = await Promise.all([
    client.query<{ weekday: number; minutes: number }>(
      'SELECT weekday, minutes FROM study_plan_availability WHERE plan_id = $1::bigint ORDER BY weekday',
      [planId]
    ),
    client.query<{ date: string; minutes: number }>(
      'SELECT study_date::text AS date, minutes FROM study_plan_capacity_overrides WHERE plan_id = $1::bigint ORDER BY study_date',
      [planId]
    ),
    client.query<RecoveryTaskRow>(
      `
        SELECT task.id::text, task.topic_id::text, topic.title AS topic_title,
               topic.position AS topic_position,
               CASE task.phase WHEN 0 THEN 'learn' WHEN 1 THEN 'practice' WHEN 2 THEN 'recall' ELSE 'review' END AS phase,
               COALESCE(
                 task.title_override,
                 CASE task.phase WHEN 0 THEN 'Learn & review' WHEN 1 THEN 'Practice' WHEN 2 THEN 'Recall' ELSE 'Review' END
                   || ': ' || topic.title
               ) AS title,
               task.title_override,
               task.scheduled_date::text,
               task.estimated_minutes,
               task.sequence,
               task.manually_edited_at::text
        FROM study_tasks task
        JOIN study_topics topic ON topic.id = task.topic_id
        WHERE task.plan_id = $1::bigint AND task.completed_at IS NULL
        ORDER BY task.scheduled_date, task.sequence, task.id
        ${lock ? 'FOR UPDATE OF task' : ''};
      `,
      [planId]
    ),
    client.query<{ id: string; title: string; position: number }>(
      `SELECT id::text, title, position FROM study_topics WHERE plan_id = $1::bigint AND active ORDER BY position, id LIMIT 1`,
      [planId]
    ),
  ]);

  const tasks: RecoveryTaskInput[] = taskRows.rows.map((task) => ({
    id: String(task.id),
    topicId: String(task.topic_id),
    topicTitle: task.topic_title,
    topicPosition: Number(task.topic_position),
    phase: task.phase,
    title: task.title,
    titleOverride: task.title_override,
    scheduledDate: String(task.scheduled_date),
    minutes: Number(task.estimated_minutes),
    sequence: Number(task.sequence),
    manuallyEdited: Boolean(task.manually_edited_at),
  }));

  if (Number(plan.rows[0].unscheduled_minutes) > 0 && !tasks.some((task) => !task.manuallyEdited)) {
    const topic = fallbackTopic.rows[0];
    if (topic) {
      tasks.push({
        id: 'unscheduled',
        topicId: String(topic.id),
        topicTitle: topic.title,
        topicPosition: Number(topic.position),
        phase: 'learn',
        title: `Work on: ${topic.title}`,
        titleOverride: `Work on: ${topic.title}`,
        scheduledDate: plan.rows[0].target_date,
        minutes: 0,
        sequence: Number.MAX_SAFE_INTEGER,
        manuallyEdited: false,
      });
    }
  }

  return {
    plan: { ...plan.rows[0], unscheduled_minutes: Number(plan.rows[0].unscheduled_minutes) },
    availability: availability.rows.map((entry) => ({ weekday: Number(entry.weekday), minutes: Number(entry.minutes) })),
    capacityOverrides: capacityOverrides.rows.map((entry) => ({ date: String(entry.date), minutes: Number(entry.minutes) })),
    tasks,
  };
}

function stateHash(state: RecoveryState): string {
  const canonical = {
    targetDate: state.plan.target_date,
    timezone: state.plan.timezone,
    unscheduledMinutes: state.plan.unscheduled_minutes,
    availability: state.availability.map((entry) => [entry.weekday, entry.minutes]),
    capacityOverrides: state.capacityOverrides.map((entry) => [entry.date, entry.minutes]),
    tasks: state.tasks
      .filter((task) => task.id !== 'unscheduled')
      .map((task) => [
        task.id, task.topicId, task.phase, task.titleOverride, task.scheduledDate,
        task.minutes, task.sequence, task.manuallyEdited,
      ]),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function buildPreview(
  state: RecoveryState,
  omittedGroupIds: string[],
  additionalMinutesPerDay = 0
): StudyRecoveryPlan & { stateToken: string; planId: string } {
  const preview = planStudyRecovery({
    today: todayInTimeZone(state.plan.timezone),
    targetDate: state.plan.target_date,
    availability: state.availability,
    tasks: state.tasks,
    unscheduledMinutes: state.plan.unscheduled_minutes,
    omittedGroupIds,
    capacityOverrides: state.capacityOverrides,
    additionalMinutesPerDay,
  });
  const validIds = new Set(preview.omissionGroups.map((group) => group.id));
  const invalid = omittedGroupIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) throw new ApiError(`Unknown recovery omission group: ${invalid[0]}`, 400);
  return { ...preview, stateToken: stateHash(state), planId: state.plan.id };
}

function snapshotFlexibleTasks(state: RecoveryState): RecoverySnapshotTask[] {
  return state.tasks
    .filter((task) => !task.manuallyEdited && task.id !== 'unscheduled' && task.minutes > 0)
    .map((task) => ({
      topicId: task.topicId,
      phase: task.phase,
      titleOverride: task.titleOverride,
      scheduledDate: task.scheduledDate,
      minutes: task.minutes,
      sequence: task.sequence,
    }));
}

async function insertSnapshotTasks(client: Queryable, planId: string, tasks: RecoverySnapshotTask[]) {
  if (tasks.length === 0) return;
  await client.query(
    `
      INSERT INTO study_tasks (
        plan_id, topic_id, phase, title_override, scheduled_date, estimated_minutes, sequence
      )
      SELECT $1::bigint, item.topic_id::bigint, item.phase, item.title_override,
             item.scheduled_date::date, item.estimated_minutes, item.sequence
      FROM jsonb_to_recordset($2::jsonb) AS item(
        topic_id TEXT, phase SMALLINT, title_override TEXT,
        scheduled_date TEXT, estimated_minutes SMALLINT, sequence INTEGER
      );
    `,
    [
      planId,
      JSON.stringify(tasks.map((task) => ({
        topic_id: task.topicId,
        phase: phaseCode(task.phase),
        title_override: task.titleOverride,
        scheduled_date: task.scheduledDate,
        estimated_minutes: task.minutes,
        sequence: task.sequence,
      }))),
    ]
  );
}

export async function previewStudyPlanRecovery(
  client: Queryable,
  userId: string,
  planId: string,
  omittedGroupIdsValue: unknown = [],
  additionalMinutesPerDayValue: unknown = 0
) {
  const omittedGroupIds = normalizeOmissionIds(omittedGroupIdsValue);
  const additionalMinutesPerDay = normalizeAdditionalMinutes(additionalMinutesPerDayValue);
  const state = await loadRecoveryState(client, userId, planId);
  return buildPreview(state, omittedGroupIds, additionalMinutesPerDay);
}

export async function loadStudyPlanRecoveryStatus(client: Queryable, userId: string, planId: string) {
  const state = await loadRecoveryState(client, userId, planId);
  const preview = buildPreview(state, []);
  const revision = await client.query<{
    id: string;
    applied_at: string;
    after_state_hash: string;
  }>(
    `
      SELECT id::text, applied_at::text, after_state_hash
      FROM study_plan_recovery_revisions
      WHERE plan_id = $1::bigint AND undone_at IS NULL
      ORDER BY applied_at DESC, id DESC
      LIMIT 1;
    `,
    [planId]
  );
  const latest = revision.rows[0];
  return {
    planId,
    needsRecovery: preview.needsRecovery,
    reasons: preview.reasons,
    overdueMinutes: preview.totals.before.overdueMinutes,
    overCapacityMinutes: preview.totals.before.overCapacityMinutes,
    unscheduledMinutes: preview.totals.before.unscheduledMinutes,
    unresolvedTasks: preview.unresolvedTasks,
    latestRevision: latest ? {
      id: String(latest.id),
      appliedAt: String(latest.applied_at),
      undoAvailable: latest.after_state_hash === stateHash(state),
    } : null,
  };
}

async function applyRecovery(
  client: Queryable,
  userId: string,
  planId: string,
  expectedStateToken: string,
  omittedGroupIds: string[],
  additionalMinutesPerDay: number,
  legacy = false
) {
  const beforeState = await loadRecoveryState(client, userId, planId, true);
  const beforeHash = stateHash(beforeState);
  if (expectedStateToken !== beforeHash) {
    throw recoveryError('RECOVERY_PREVIEW_STALE', 409);
  }
  const preview = buildPreview(beforeState, omittedGroupIds, additionalMinutesPerDay);
  if (preview.shortfallMinutes > 0) {
    throw recoveryError('RECOVERY_OMISSIONS_REQUIRED', 409, {
      missingMinutes: preview.shortfallMinutes,
      requiredOmissionMinutes: preview.requiredOmissionMinutes,
    });
  }
  if (legacy && preview.unresolvedTasks.length > 0) {
    throw recoveryError('RECOVERY_PREVIEW_REQUIRED', 409, {
      unresolvedTaskCount: preview.unresolvedTasks.length,
    });
  }
  if (!preview.needsRecovery) return { planId, recovered: false, revisionId: null, preview };
  if (!preview.canConfirm) {
    throw recoveryError('RECOVERY_NO_MOVABLE_WORK', 409, {
      unresolvedTaskCount: preview.unresolvedTasks.length,
    });
  }

  const beforeTasks = snapshotFlexibleTasks(beforeState);
  await client.query(
    `DELETE FROM study_tasks WHERE plan_id = $1::bigint AND completed_at IS NULL AND manually_edited_at IS NULL`,
    [planId]
  );
  await insertSnapshotTasks(client, planId, preview.scheduledTasks.map((task) => ({
    topicId: task.topicId,
    phase: task.phase,
    titleOverride: task.titleOverride,
    scheduledDate: task.scheduledDate,
    minutes: task.minutes,
    sequence: task.sequence,
  })));
  if (preview.capacityChanges.length > 0) {
    await client.query(
      `
        INSERT INTO study_plan_capacity_overrides (plan_id, study_date, minutes)
        SELECT $1::bigint, item.study_date::date, item.minutes
        FROM jsonb_to_recordset($2::jsonb) AS item(study_date TEXT, minutes INTEGER)
        ON CONFLICT (plan_id, study_date) DO UPDATE
        SET minutes = EXCLUDED.minutes, updated_at = NOW();
      `,
      [
        planId,
        JSON.stringify(preview.capacityChanges.map((change) => ({ study_date: change.date, minutes: change.afterMinutes }))),
      ]
    );
  }
  await client.query(
    `UPDATE study_plans SET unscheduled_minutes = $2, updated_at = NOW() WHERE id = $1::bigint`,
    [planId, preview.totals.after.unscheduledMinutes]
  );

  const afterState = await loadRecoveryState(client, userId, planId);
  const afterHash = stateHash(afterState);
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO study_plan_recovery_revisions (
        plan_id, before_tasks, after_tasks,
        before_capacity_overrides, after_capacity_overrides,
        before_unscheduled_minutes, after_unscheduled_minutes,
        before_state_hash, after_state_hash, summary
      )
      VALUES ($1::bigint, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10::jsonb)
      RETURNING id::text;
    `,
    [
      planId,
      JSON.stringify(beforeTasks),
      JSON.stringify(snapshotFlexibleTasks(afterState)),
      JSON.stringify(beforeState.capacityOverrides),
      JSON.stringify(afterState.capacityOverrides),
      beforeState.plan.unscheduled_minutes,
      preview.totals.after.unscheduledMinutes,
      beforeHash,
      afterHash,
      JSON.stringify({
        movedMinutes: preview.totals.movedMinutes,
        omittedMinutes: preview.selectedOmissionMinutes,
        addedCapacityMinutes: preview.capacityChanges.reduce((sum, change) => sum + change.addedMinutes, 0),
        unresolvedTaskCount: preview.unresolvedTasks.length,
      }),
    ]
  );
  return { planId, recovered: true, revisionId: String(inserted.rows[0].id), preview };
}

export async function confirmStudyPlanRecovery(
  client: Queryable,
  userId: string,
  planId: string,
  value: { stateToken?: unknown; omittedGroupIds?: unknown; additionalMinutesPerDay?: unknown }
) {
  const stateToken = typeof value.stateToken === 'string' ? value.stateToken : '';
  if (!/^[a-f0-9]{64}$/.test(stateToken)) throw new ApiError('A valid recovery state token is required', 400);
  return applyRecovery(
    client,
    userId,
    planId,
    stateToken,
    normalizeOmissionIds(value.omittedGroupIds),
    normalizeAdditionalMinutes(value.additionalMinutesPerDay)
  );
}

export async function legacyRefreshStudyPlan(client: Queryable, userId: string, planId: string) {
  const state = await loadRecoveryState(client, userId, planId, true);
  const preview = buildPreview(state, []);
  if (preview.shortfallMinutes > 0 || preview.unresolvedTasks.length > 0) {
    throw recoveryError('RECOVERY_PREVIEW_REQUIRED', 409, {
      missingMinutes: preview.shortfallMinutes,
      unresolvedTaskCount: preview.unresolvedTasks.length,
    });
  }
  return applyRecovery(client, userId, planId, stateHash(state), [], 0, true);
}

export async function undoStudyPlanRecovery(client: Queryable, userId: string, planId: string) {
  const state = await loadRecoveryState(client, userId, planId, true);
  const revision = await client.query<{
    id: string;
    before_tasks: RecoverySnapshotTask[];
    before_capacity_overrides: Array<{ date: string; minutes: number }>;
    before_unscheduled_minutes: number;
    after_state_hash: string;
  }>(
    `
      SELECT revision.id::text, revision.before_tasks, revision.before_capacity_overrides,
             revision.before_unscheduled_minutes, revision.after_state_hash
      FROM study_plan_recovery_revisions revision
      WHERE revision.plan_id = $1::bigint AND revision.undone_at IS NULL
      ORDER BY revision.applied_at DESC, revision.id DESC
      LIMIT 1
      FOR UPDATE;
    `,
    [planId]
  );
  const latest = revision.rows[0];
  if (!latest) throw recoveryError('RECOVERY_UNDO_NOT_AVAILABLE', 409);
  if (stateHash(state) !== latest.after_state_hash) {
    throw recoveryError('RECOVERY_UNDO_UNSAFE', 409);
  }

  await client.query(
    `DELETE FROM study_tasks WHERE plan_id = $1::bigint AND completed_at IS NULL AND manually_edited_at IS NULL`,
    [planId]
  );
  await insertSnapshotTasks(client, planId, latest.before_tasks);
  await client.query('DELETE FROM study_plan_capacity_overrides WHERE plan_id = $1::bigint', [planId]);
  if (latest.before_capacity_overrides.length > 0) {
    await client.query(
      `
        INSERT INTO study_plan_capacity_overrides (plan_id, study_date, minutes)
        SELECT $1::bigint, item.study_date::date, item.minutes
        FROM jsonb_to_recordset($2::jsonb) AS item(study_date TEXT, minutes INTEGER);
      `,
      [
        planId,
        JSON.stringify(latest.before_capacity_overrides.map((entry) => ({ study_date: entry.date, minutes: entry.minutes }))),
      ]
    );
  }
  await client.query(
    `UPDATE study_plans SET unscheduled_minutes = $2, updated_at = NOW() WHERE id = $1::bigint`,
    [planId, Number(latest.before_unscheduled_minutes)]
  );
  await client.query(
    `UPDATE study_plan_recovery_revisions SET undone_at = NOW() WHERE id = $1::bigint`,
    [latest.id]
  );
  return { planId, undone: true, revisionId: String(latest.id) };
}
