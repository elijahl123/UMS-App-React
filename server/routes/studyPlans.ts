import { Router, type Request, type Response } from 'express';
import { requestUserId } from '../auth';
import { pool } from '../db';
import { ApiError } from '../errors';
import {
  createStudyPlan,
  loadStudyPlanCalendar,
  loadStudyPlanDashboard,
  loadStudyPlanDefinition,
  loadStudyPlanSummaries,
  loadStudyPlanTasks,
  normalizeStudyPlanInput,
  normalizeStudyTaskRange,
  openStudyTaskNote,
  rebuildStudyPlan,
} from '../studyPlans';
import {
  confirmStudyPlanRecovery,
  legacyRefreshStudyPlan,
  loadStudyPlanRecoveryStatus,
  previewStudyPlanRecovery,
  undoStudyPlanRecovery,
} from '../studyPlanRecovery';
import { requireContentReadAccess, requireFullWriteAccess } from '../access';

export const studyPlansRouter = Router();

studyPlansRouter.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return requireContentReadAccess(req, res, next);
  return requireFullWriteAccess(req, res, next);
});

function errorResponse(err: unknown, res: Response) {
  let message = err instanceof Error ? err.message : 'SERVER_ERROR';
  let details: unknown;
  if (message.startsWith('{')) {
    try {
      details = JSON.parse(message);
      message = (details as { code?: string }).code ?? message;
    } catch {
      // Keep the original message.
    }
  }
  const status = err instanceof ApiError ? err.status : 500;
  return res.status(status).json({ error: { message, details } });
}

studyPlansRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = requestUserId(req, req.query as Record<string, unknown>);
    const result = await loadStudyPlanSummaries(pool, userId, req.query.courseId ? String(req.query.courseId) : undefined);
    return res.json(result);
  } catch (err) {
    return errorResponse(err, res);
  }
});

studyPlansRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const userId = requestUserId(req, req.query as Record<string, unknown>);
    return res.json(await loadStudyPlanDashboard(pool, userId));
  } catch (err) {
    return errorResponse(err, res);
  }
});

studyPlansRouter.get('/calendar', async (req: Request, res: Response) => {
  try {
    const userId = requestUserId(req, req.query as Record<string, unknown>);
    const range = normalizeStudyTaskRange(req.query as Record<string, unknown>, 42);
    return res.json(await loadStudyPlanCalendar(pool, userId, range));
  } catch (err) {
    return errorResponse(err, res);
  }
});

studyPlansRouter.get('/:planId/recovery', async (req: Request<{ planId: string }>, res: Response) => {
  try {
    const userId = requestUserId(req, req.query as Record<string, unknown>);
    return res.json(await loadStudyPlanRecoveryStatus(pool, userId, req.params.planId));
  } catch (err) {
    return errorResponse(err, res);
  }
});

studyPlansRouter.post('/:planId/recovery/preview', async (req: Request<{ planId: string }>, res: Response) => {
  try {
    const userId = requestUserId(req, req.body ?? {});
    return res.json(await previewStudyPlanRecovery(
      pool,
      userId,
      req.params.planId,
      req.body?.omittedGroupIds,
      req.body?.additionalMinutesPerDay
    ));
  } catch (err) {
    return errorResponse(err, res);
  }
});

studyPlansRouter.post('/:planId/recovery/confirm', async (req: Request<{ planId: string }>, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = requestUserId(req, req.body ?? {});
    await client.query('BEGIN');
    const result = await confirmStudyPlanRecovery(client, userId, req.params.planId, req.body ?? {});
    await client.query('COMMIT');
    return res.json(result);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse(err, res);
  } finally {
    client.release();
  }
});

studyPlansRouter.post('/:planId/recovery/undo', async (req: Request<{ planId: string }>, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = requestUserId(req, req.body ?? {});
    await client.query('BEGIN');
    const result = await undoStudyPlanRecovery(client, userId, req.params.planId);
    await client.query('COMMIT');
    return res.json(result);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse(err, res);
  } finally {
    client.release();
  }
});

studyPlansRouter.get('/:planId/tasks', async (req: Request<{ planId: string }>, res: Response) => {
  try {
    const userId = requestUserId(req, req.query as Record<string, unknown>);
    const range = normalizeStudyTaskRange(req.query as Record<string, unknown>, 28);
    return res.json(await loadStudyPlanTasks(pool, userId, req.params.planId, range));
  } catch (err) {
    return errorResponse(err, res);
  }
});

studyPlansRouter.get('/:planId', async (req: Request<{ planId: string }>, res: Response) => {
  try {
    const userId = requestUserId(req, req.query as Record<string, unknown>);
    return res.json(await loadStudyPlanDefinition(pool, userId, req.params.planId));
  } catch (err) {
    return errorResponse(err, res);
  }
});

studyPlansRouter.post(
  '/:planId/tasks/:taskId/note',
  async (req: Request<{ planId: string; taskId: string }>, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = requestUserId(req, req.body ?? {});
      await client.query('BEGIN');
      const result = await openStudyTaskNote(client, userId, req.params.planId, req.params.taskId);
      await client.query('COMMIT');
      return res.status(result.created ? 201 : 200).json(result);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      return errorResponse(err, res);
    } finally {
      client.release();
    }
  }
);

studyPlansRouter.post('/', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = requestUserId(req, req.body ?? {});
    const input = normalizeStudyPlanInput(req.body);
    await client.query('BEGIN');
    const planId = await createStudyPlan(client, userId, input);
    await client.query('COMMIT');
    return res.status(201).json({ planId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse(err, res);
  } finally {
    client.release();
  }
});

studyPlansRouter.put('/:planId', async (req: Request<{ planId: string }>, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = requestUserId(req, req.body ?? {});
    const input = normalizeStudyPlanInput(req.body);
    await client.query('BEGIN');
    await rebuildStudyPlan(client, userId, req.params.planId, input);
    await client.query('COMMIT');
    return res.json({ planId: req.params.planId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse(err, res);
  } finally {
    client.release();
  }
});

studyPlansRouter.post('/:planId/refresh', async (req: Request<{ planId: string }>, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = requestUserId(req, req.body ?? {});
    await client.query('BEGIN');
    await legacyRefreshStudyPlan(client, userId, req.params.planId);
    await client.query('COMMIT');
    return res.json({ planId: req.params.planId, refreshed: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse(err, res);
  } finally {
    client.release();
  }
});

studyPlansRouter.patch(
  '/:planId/tasks/:taskId',
  async (req: Request<{ planId: string; taskId: string }>, res: Response) => {
    try {
      const userId = requestUserId(req, req.body ?? {});
      const completed = typeof req.body?.completed === 'boolean' ? req.body.completed : null;
      const title = typeof req.body?.title === 'string' ? req.body.title.trim().replace(/\s+/g, ' ') : null;
      const scheduledDate = typeof req.body?.scheduledDate === 'string' ? req.body.scheduledDate : null;
      const estimatedMinutes = req.body?.estimatedMinutes == null ? null : Number(req.body.estimatedMinutes);
      const manualEdit = title !== null || scheduledDate !== null || estimatedMinutes !== null;
      if (title !== null && (!title || title.length > 200)) throw new ApiError('Task title must be between 1 and 200 characters', 400);
      if (scheduledDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) throw new ApiError('Task date must be a valid date', 400);
      if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 15 || estimatedMinutes > 720 || estimatedMinutes % 15 !== 0)) {
        throw new ApiError('Task minutes must be a multiple of 15 between 15 and 720', 400);
      }
      const result = await pool.query(
        `
          UPDATE study_tasks task
          SET completed_at = CASE WHEN $1::boolean IS NULL THEN task.completed_at WHEN $1 THEN COALESCE(task.completed_at, NOW()) ELSE NULL END,
              title_override = CASE WHEN $2::text IS NULL THEN task.title_override ELSE $2 END,
              scheduled_date = COALESCE($3::date, task.scheduled_date),
              estimated_minutes = COALESCE($4::smallint, task.estimated_minutes),
              manually_edited_at = CASE WHEN $5 THEN NOW() ELSE task.manually_edited_at END
          FROM study_plans plan
          JOIN courses course ON course.id = plan.course_id
          WHERE task.id = $6::bigint
            AND task.plan_id = $7::bigint
            AND task.plan_id = plan.id
            AND course.user_id = $8
            AND ($3::date IS NULL OR $3::date < COALESCE(plan.target_date, plan.exam_date))
          RETURNING task.id, task.completed_at, task.title_override,
                    task.scheduled_date::text, task.estimated_minutes, task.manually_edited_at;
        `,
        [completed, title, scheduledDate, estimatedMinutes, manualEdit, req.params.taskId, req.params.planId, userId]
      );
      if (!result.rows[0]) throw new ApiError('Study task not found', 404);
      return res.json({
        id: String(result.rows[0].id),
        completedAt: result.rows[0].completed_at ? String(result.rows[0].completed_at) : null,
        title: result.rows[0].title_override ? String(result.rows[0].title_override) : null,
        scheduledDate: String(result.rows[0].scheduled_date),
        estimatedMinutes: Number(result.rows[0].estimated_minutes),
        manuallyEditedAt: result.rows[0].manually_edited_at ? String(result.rows[0].manually_edited_at) : null,
      });
    } catch (err) {
      return errorResponse(err, res);
    }
  }
);

studyPlansRouter.patch('/:planId', async (req: Request<{ planId: string }>, res: Response) => {
  try {
    const userId = requestUserId(req, req.body ?? {});
    const archived = Boolean(req.body?.archived);
    const result = await pool.query(
      `
        UPDATE study_plans plan
        SET archived = $1, updated_at = NOW()
        FROM courses course
        WHERE plan.id = $2::bigint AND plan.course_id = course.id AND course.user_id = $3
        RETURNING plan.id;
      `,
      [archived, req.params.planId, userId]
    );
    if (!result.rows[0]) throw new ApiError('Study plan not found', 404);
    return res.json({ id: String(result.rows[0].id), archived });
  } catch (err) {
    return errorResponse(err, res);
  }
});

studyPlansRouter.delete('/:planId', async (req: Request<{ planId: string }>, res: Response) => {
  try {
    const userId = requestUserId(req, req.body ?? {});
    const result = await pool.query(
      `
        DELETE FROM study_plans plan
        USING courses course
        WHERE plan.id = $1::bigint AND plan.course_id = course.id AND course.user_id = $2
        RETURNING plan.id;
      `,
      [req.params.planId, userId]
    );
    if (!result.rows[0]) throw new ApiError('Study plan not found', 404);
    return res.json({ ok: true });
  } catch (err) {
    return errorResponse(err, res);
  }
});
