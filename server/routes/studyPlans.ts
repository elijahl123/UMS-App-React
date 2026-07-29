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
  refreshStudyPlan,
} from '../studyPlans';

export const studyPlansRouter = Router();

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
    await refreshStudyPlan(client, userId, req.params.planId);
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
      const completed = Boolean(req.body?.completed);
      const result = await pool.query(
        `
          UPDATE study_tasks task
          SET completed_at = CASE WHEN $1 THEN COALESCE(task.completed_at, NOW()) ELSE NULL END
          FROM study_plans plan
          JOIN courses course ON course.id = plan.course_id
          WHERE task.id = $2::bigint
            AND task.plan_id = $3::bigint
            AND task.plan_id = plan.id
            AND course.user_id = $4
          RETURNING task.id, task.completed_at;
        `,
        [completed, req.params.taskId, req.params.planId, userId]
      );
      if (!result.rows[0]) throw new ApiError('Study task not found', 404);
      return res.json({
        id: String(result.rows[0].id),
        completedAt: result.rows[0].completed_at ? String(result.rows[0].completed_at) : null,
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
