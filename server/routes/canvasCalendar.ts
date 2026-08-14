import { Router, type Request, type Response } from 'express';
import { requireFullWriteAccess } from '../access';
import { requestUserId } from '../auth';
import { importCanvasRows, normalizeCanvasImportRows } from '../canvasImport';
import { pool } from '../db';
import { ApiError } from '../errors';
import { syncNotificationInstancesForUser } from '../notifications';

export const canvasCalendarRouter = Router();
canvasCalendarRouter.use(requireFullWriteAccess);

canvasCalendarRouter.post('/import', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = requestUserId(req, req.body ?? {});
    const rows = normalizeCanvasImportRows(req.body?.rows);
    await client.query('BEGIN');
    const result = await importCanvasRows(client, userId, rows);
    await client.query('COMMIT');
    await syncNotificationInstancesForUser(userId);
    return res.json(result);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    return res.status(err instanceof ApiError ? err.status : 400).json({ error: { message } });
  } finally {
    client.release();
  }
});
