import cors from 'cors';
import express from 'express';
import { requireAppAuthentication, requireStagingAccess } from './auth';
import { config } from './config';
import { createCorsOptions } from './cors';
import { actionsRouter } from './routes/actions';
import { authSessionRouter } from './routes/authSession';
import { billingRouter, billingWebhookRouter, publicBillingRouter } from './routes/billing';
import { appleBillingWebhookRouter } from './routes/appleBilling';
import { brightspaceCalendarRouter } from './routes/brightspaceCalendar';
import { canvasCalendarRouter } from './routes/canvasCalendar';
import { emailRouter, publicEmailRouter } from './routes/email';
import { googleCalendarOAuthRouter, googleCalendarRouter } from './routes/googleCalendar';
import { stagingAccessRouter } from './routes/stagingAccess';
import { notificationsRouter } from './notifications';
import { studyPlansRouter } from './routes/studyPlans';
import { launchRouter } from './routes/launch';
import { accessRouter } from './routes/access';
import { accountRouter } from './routes/account';
import { telemetryRouter } from './routes/telemetry';
import { onboardingRouter } from './routes/onboarding';
import { noteImagesRouter } from './routes/noteImages';

export function createApp() {
  const app = express();
  app.set('trust proxy', 'loopback');

  app.use(cors(createCorsOptions(config.appOrigins)));
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookRouter);
  // The raw .ics file never reaches this route; the larger cap accommodates up to
  // 2,000 reviewed normalized rows produced from a client-side 5 MiB calendar.
  app.use('/api/canvas-calendar', express.json({ limit: '6mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/staging-access/config', (_req, res) => {
    res.json({ enabled: config.stagingAccessControlEnabled });
  });
  app.use('/api/auth', authSessionRouter);
  app.use('/api/email', publicEmailRouter);
  app.use('/api/google-calendar/oauth', googleCalendarOAuthRouter);
  app.use('/api/launch', launchRouter);
  app.use('/api/billing', publicBillingRouter);
  app.use('/api/billing/apple-webhook', appleBillingWebhookRouter);

  app.use('/api', requireStagingAccess);
  app.use('/api/staging-access', stagingAccessRouter);
  app.use('/api', requireAppAuthentication);
  app.use('/api/access', accessRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/telemetry', telemetryRouter);
  app.use('/api/onboarding', onboardingRouter);
  app.use('/api/actions', actionsRouter);
  app.use('/api/note-images', noteImagesRouter);
  app.use('/api/brightspace-calendar', brightspaceCalendarRouter);
  app.use('/api/canvas-calendar', canvasCalendarRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/email', emailRouter);
  app.use('/api/google-calendar', googleCalendarRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/study-plans', studyPlansRouter);

  return app;
}
