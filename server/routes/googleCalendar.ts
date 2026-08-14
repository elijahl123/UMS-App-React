import { Router, type Request, type Response } from 'express';
import { authenticatedFirebaseUser } from '../auth';
import { config } from '../config';
import { isCorsOriginAllowed } from '../cors';
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
  verifyGoogleCalendarStateDetails,
} from '../googleCalendarSync';
import { requireContentReadAccess, requireFullWriteAccess } from '../access';

export const googleCalendarRouter = Router();
export const googleCalendarOAuthRouter = Router();

function approvedWebOrigin(origin: string | undefined): string | undefined {
  if (!origin || !isCorsOriginAllowed(origin, config.appOrigins)) return undefined;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function redirectToAccount(res: Response, params: Record<string, string>, returnOrigin?: string) {
  const baseUrl = approvedWebOrigin(returnOrigin) ?? config.appBaseUrl;
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/`);
  url.hash = `/account?${new URLSearchParams(params).toString()}`;
  res.redirect(url.toString());
}

googleCalendarOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  let returnOrigin: string | undefined;
  try {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    const error = String(req.query.error ?? '');

    if (state) {
      returnOrigin = verifyGoogleCalendarStateDetails(state).returnOrigin;
    }

    if (error) {
      return redirectToAccount(res, { googleCalendar: 'error', message: error }, returnOrigin);
    }
    if (!code || !state) {
      throw new ApiError('Missing Google Calendar OAuth callback data.', 400);
    }

    const result = await handleGoogleCalendarCallback(code, state);
    return redirectToAccount(res, { googleCalendar: 'connected' }, result.returnOrigin);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google Calendar connection failed.';
    return redirectToAccount(res, { googleCalendar: 'error', message }, returnOrigin);
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
    const requestedReturnOrigin = typeof req.body?.returnOrigin === 'string' ? req.body.returnOrigin : undefined;
    const returnOrigin = approvedWebOrigin(req.get('origin')) ?? approvedWebOrigin(requestedReturnOrigin);
    return res.json({ authorizationUrl: await buildGoogleCalendarAuthUrl(user.uid, returnOrigin) });
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
