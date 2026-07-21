import { Router, type Request, type Response } from 'express';
import { importBrightspaceRows, normalizeBrightspaceImportRows } from '../brightspaceImport';
import { pool } from '../db';
import { ApiError } from '../errors';
import { requestUserId } from '../auth';
import { syncNotificationInstancesForUser } from '../notifications';

export const brightspaceCalendarRouter = Router();

brightspaceCalendarRouter.post('/import', async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const userId = requestUserId(req, req.body ?? {});
    const rows = normalizeBrightspaceImportRows(req.body?.rows);

    await client.query('BEGIN');
    const result = await importBrightspaceRows(client, userId, rows);
    await client.query('COMMIT');
    await syncNotificationInstancesForUser(userId);

    return res.json(result);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    const status = err instanceof ApiError ? err.status : 400;
    return res.status(status).json({ error: { message } });
  } finally {
    client.release();
  }
});
