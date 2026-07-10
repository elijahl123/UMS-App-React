import { Router, type Request, type Response } from 'express';
import { getActionQuery } from '../actions';
import { pool } from '../db';
import { ApiError } from '../errors';

export const actionsRouter = Router();

actionsRouter.post('/:name', async (req: Request<{ name: string }>, res: Response) => {
  try {
    const query = getActionQuery(req.params.name, req.body ?? {});
    if (!query) {
      return res.status(404).json({ error: { message: 'UNKNOWN_ACTION' } });
    }

    const result = await pool.query(query.text, query.values ?? []);
    return res.json(result.rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    const status = err instanceof ApiError ? err.status : 500;
    return res.status(status).json({ error: { message } });
  }
});
