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
import { assertContentReadAccess, assertFullWriteAccess } from '../access';
import { runNoteAction } from '../notes';
import { claimMutation, completeMutation, readClientMutationId, releaseMutation } from '../mutationReceipts';

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
  // Offline clients keep a queued write until its response arrives, so a lost
  // response makes them send it again. The receipt lets a retry return the
  // original result instead of writing a second row.
  const clientMutationId = req.params.name.startsWith('load') ? null : readClientMutationId(req.body);
  let claimed = false;

  try {
    if (req.auth?.uid) {
      if (req.params.name.startsWith('load')) {
        await assertContentReadAccess(req.auth.uid);
      } else {
        await assertFullWriteAccess(req.auth.uid);
      }
    }

    if (req.auth?.uid && clientMutationId) {
      const { replayOf } = await claimMutation(req.auth.uid, clientMutationId, req.params.name);
      if (replayOf) return res.json(replayOf);
      claimed = true;
    }
    const params = req.auth ? { ...(req.body ?? {}), userId: req.auth.uid } : (req.body ?? {});
    const noteResult = await runNoteAction(req.params.name, params);
    if (noteResult) {
      if (req.auth?.uid && clientMutationId) await completeMutation(req.auth.uid, clientMutationId, noteResult);
      return res.json(noteResult);
    }
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
      const recurringResult = (
        await mutateRecurringGoogleOccurrence(
          req.auth.uid,
          req.params.name === 'deleteEvent' ? 'delete' : 'update',
          {
            recurringSeriesId,
            recurrenceOriginalStart,
            title: typeof req.body?.title === 'string' ? req.body.title : undefined,
            date: typeof req.body?.date === 'string' ? req.body.date : undefined,
            endDate: typeof req.body?.endDate === 'string' ? req.body.endDate : null,
            time: typeof req.body?.time === 'string' ? req.body.time : null,
            endTime: typeof req.body?.endTime === 'string' ? req.body.endTime : null,
            timeZone: typeof req.body?.timeZone === 'string' ? req.body.timeZone : undefined,
            description: typeof req.body?.description === 'string' ? req.body.description : null,
            courseId: typeof req.body?.courseId === 'string' ? req.body.courseId : null,
            academicKind: req.body?.academicKind === 'class' ? 'class' : null,
          }
        )
      ) as unknown[];
      if (clientMutationId) await completeMutation(req.auth.uid, clientMutationId, recurringResult);
      return res.json(recurringResult);
    }
    const beforeDelete =
      req.auth?.uid && req.params.name === 'deleteEvent' && req.body?.id
        ? await readEventBeforeDelete(req.auth.uid, String(req.body.id))
        : null;
    const query = getActionQuery(req.params.name, params);
    if (!query) {
      if (claimed && req.auth?.uid && clientMutationId) {
        await releaseMutation(req.auth.uid, clientMutationId).catch(() => undefined);
      }
      return res.status(404).json({ error: { message: 'UNKNOWN_ACTION' } });
    }

    const result = await pool.query(query.text, query.values ?? []);
    if (req.auth?.uid && req.params.name === 'createCourse' && result.rows.length > 0) {
      await pool.query(
        `
          INSERT INTO launch_onboarding (user_id, first_course_at)
          VALUES ($1, NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            first_course_at = COALESCE(launch_onboarding.first_course_at, NOW()),
            updated_at = NOW();
        `,
        [req.auth.uid]
      );
      await pool.query(
        `
          UPDATE launch_onboarding
          SET completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
          WHERE user_id = $1
            AND institution_verified_at IS NOT NULL
            AND first_course_at IS NOT NULL
            AND dashboard_opened_at IS NOT NULL;
        `,
        [req.auth.uid]
      );
    }
    if (req.auth?.uid && ['createEvent', 'updateEvent', 'deleteEvent'].includes(req.params.name)) {
      await syncEventMutationToGoogle(req.auth.uid, req.params.name, result.rows, beforeDelete);
    }
    if (req.auth?.uid && notificationMutationActions.has(req.params.name)) {
      await syncNotificationInstancesForUser(req.auth.uid);
    }
    if (req.auth?.uid && clientMutationId) await completeMutation(req.auth.uid, clientMutationId, result.rows);
    return res.json(result.rows);
  } catch (err) {
    // Free the claim so the client's next attempt is not answered with an
    // empty receipt for a write that never happened.
    if (claimed && req.auth?.uid && clientMutationId) {
      await releaseMutation(req.auth.uid, clientMutationId).catch(() => undefined);
    }
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    const status = err instanceof ApiError ? err.status : 500;
    return res.status(status).json({ error: { message } });
  }
});
