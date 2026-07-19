import { Router, type Request, type Response } from 'express';
import { getActionQuery } from '../actions';
import { pool } from '../db';
import { ApiError } from '../errors';
import { syncNotificationInstancesForUser } from '../notifications';

export const actionsRouter = Router();

const notificationMutationActions = new Set([
  'createAssignment',
  'updateAssignment',
  'deleteAssignment',
  'createClassSession',
  'updateClassSession',
  'deleteClassSession',
  'createEvent',
  'updateEvent',
  'deleteEvent',
]);

actionsRouter.post('/:name', async (req: Request<{ name: string }>, res: Response) => {
  try {
    const params = req.auth ? { ...(req.body ?? {}), userId: req.auth.uid } : (req.body ?? {});
    const query = getActionQuery(req.params.name, params);
    if (!query) {
      return res.status(404).json({ error: { message: 'UNKNOWN_ACTION' } });
    }

    const result = await pool.query(query.text, query.values ?? []);
    if (req.auth?.uid && notificationMutationActions.has(req.params.name)) {
      await syncNotificationInstancesForUser(req.auth.uid);
    }
    return res.json(result.rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    const status = err instanceof ApiError ? err.status : 500;
    return res.status(status).json({ error: { message } });
  }
});
