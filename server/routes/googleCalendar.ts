import { Router, type Request, type Response } from 'express';
import { authenticatedFirebaseUser } from '../auth';
import { config } from '../config';
import { ApiError } from '../errors';
import {
  buildGoogleCalendarAuthUrl,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  handleGoogleCalendarCallback,
  runGoogleCalendarSync,
} from '../googleCalendarSync';

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

    const result = await handleGoogleCalendarCallback(code, state);
    runGoogleCalendarSync(result.userId).catch((err) => {
      console.error('[google-calendar] Initial sync failed:', err);
    });
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

googleCalendarRouter.post('/sync', async (req, res) => {
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
