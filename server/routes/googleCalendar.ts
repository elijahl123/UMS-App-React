import { Router, type Request, type Response } from 'express';
import { authenticatedFirebaseUser } from '../auth';
import { config } from '../config';
import { ApiError } from '../errors';
import {
  buildGoogleCalendarAuthUrl,
  disconnectGoogleCalendar,
  getOwnedGoogleCalendars,
  getGoogleCalendarStatus,
  handleGoogleCalendarCallback,
  runGoogleCalendarSync,
  previewGoogleCalendarImport,
  updateGoogleCalendarSettings,
} from '../googleCalendarSync';
import { requireContentReadAccess, requireFullWriteAccess } from '../access';

export const googleCalendarRouter = Router();
export const googleCalendarOAuthRouter = Router();

function redirectToAccount(res: Response, params: Record<string, string>) {
  const url = new URL(`${config.appBaseUrl.replace(/\/+$/, '')}/`);
  url.hash = `/account?${new URLSearchParams(params).toString()}`;
  res.redirect(url.toString());
}

googleCalendarOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    const error = String(req.query.error ?? '');

    if (error) {
      return redirectToAccount(res, { googleCalendar: 'error', message: error });
    }
    if (!code || !state) {
      throw new ApiError('Missing Google Calendar OAuth callback data.', 400);
    }

    await handleGoogleCalendarCallback(code, state);
    return redirectToAccount(res, { googleCalendar: 'connected' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google Calendar connection failed.';
    return redirectToAccount(res, { googleCalendar: 'error', message });
  }
});

googleCalendarRouter.get('/status', async (req, res) => {
  try {
    const user = await authenticatedFirebaseUser(req);
    return res.json(await getGoogleCalendarStatus(user.uid));
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    return res.status(status).json({ error: { message } });
  }
});

googleCalendarRouter.post('/connect', async (req, res) => {
  try {
    const user = await authenticatedFirebaseUser(req);
    return res.json({ authorizationUrl: await buildGoogleCalendarAuthUrl(user.uid) });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    return res.status(status).json({ error: { message } });
  }
});

googleCalendarRouter.get('/calendars', requireContentReadAccess, async (req, res) => {
  try {
    const user = await authenticatedFirebaseUser(req);
    return res.json(await getOwnedGoogleCalendars(user.uid));
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    return res.status(status).json({ error: { message } });
  }
});

googleCalendarRouter.post('/preview', requireFullWriteAccess, async (req, res) => {
  try {
    const user = await authenticatedFirebaseUser(req);
    const calendarIds = Array.isArray(req.body?.calendarIds)
      ? req.body.calendarIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    return res.json(await previewGoogleCalendarImport(user.uid, calendarIds, Number(req.body?.historyMonths)));
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    return res.status(status).json({ error: { message } });
  }
});

googleCalendarRouter.put('/settings', requireFullWriteAccess, async (req, res) => {
  try {
    const user = await authenticatedFirebaseUser(req);
    const calendarIds = Array.isArray(req.body?.calendarIds)
      ? req.body.calendarIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const historyMonths = Number(req.body?.historyMonths);
    return res.json(await updateGoogleCalendarSettings(user.uid, calendarIds, historyMonths));
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    return res.status(status).json({ error: { message } });
  }
});

googleCalendarRouter.post('/sync', requireFullWriteAccess, async (req, res) => {
  try {
    const user = await authenticatedFirebaseUser(req);
    const result = await runGoogleCalendarSync(user.uid, { forceFull: Boolean(req.body?.forceFull) });
    return res.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    return res.status(status).json({ error: { message } });
  }
});

googleCalendarRouter.delete('/connection', async (req, res) => {
  try {
    const user = await authenticatedFirebaseUser(req);
    await disconnectGoogleCalendar(user.uid);
    return res.json({ ok: true });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'SERVER_ERROR';
    return res.status(status).json({ error: { message } });
  }
});
