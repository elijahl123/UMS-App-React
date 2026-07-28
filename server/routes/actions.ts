import { Router, type Request, type Response } from 'express';
import { getActionQuery } from '../actions';
import { pool } from '../db';
import { ApiError } from '../errors';
import {
  loadEventsForUser,
  mutateRecurringGoogleOccurrence,
  readEventBeforeDelete,
  syncEventMutationToGoogle,
} from '../googleCalendarSync';
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
    if (req.auth?.uid && req.params.name === 'loadEvents') {
      return res.json(
        await loadEventsForUser(
          req.auth.uid,
          typeof req.body?.from === 'string' ? req.body.from : undefined,
          typeof req.body?.to === 'string' ? req.body.to : undefined
        )
      );
    }
    const recurringSeriesId = typeof req.body?.recurringSeriesId === 'string' ? req.body.recurringSeriesId : null;
    const recurrenceOriginalStart =
      typeof req.body?.recurrenceOriginalStart === 'string' ? req.body.recurrenceOriginalStart : null;
    if (
      req.auth?.uid
      && recurringSeriesId
      && recurrenceOriginalStart
      && (req.params.name === 'updateEvent' || req.params.name === 'deleteEvent')
    ) {
      return res.json(
        await mutateRecurringGoogleOccurrence(
          req.auth.uid,
          req.params.name === 'deleteEvent' ? 'delete' : 'update',
          {
            recurringSeriesId,
            recurrenceOriginalStart,
            title: typeof req.body?.title === 'string' ? req.body.title : undefined,
            date: typeof req.body?.date === 'string' ? req.body.date : undefined,
            time: typeof req.body?.time === 'string' ? req.body.time : null,
            endTime: typeof req.body?.endTime === 'string' ? req.body.endTime : null,
            timeZone: typeof req.body?.timeZone === 'string' ? req.body.timeZone : undefined,
            description: typeof req.body?.description === 'string' ? req.body.description : null,
          }
        )
      );
    }
    const beforeDelete =
      req.auth?.uid && req.params.name === 'deleteEvent' && req.body?.id
        ? await readEventBeforeDelete(req.auth.uid, String(req.body.id))
        : null;
    const query = getActionQuery(req.params.name, params);
    if (!query) {
      return res.status(404).json({ error: { message: 'UNKNOWN_ACTION' } });
    }

    const result = await pool.query(query.text, query.values ?? []);
    if (req.auth?.uid && ['createEvent', 'updateEvent', 'deleteEvent'].includes(req.params.name)) {
      await syncEventMutationToGoogle(req.auth.uid, req.params.name, result.rows, beforeDelete);
    }
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
