import cors from 'cors';
import express from 'express';
import { requireStagingAccess } from './auth';
import { config } from './config';
import { createCorsOptions } from './cors';
import { actionsRouter } from './routes/actions';
import { authSessionRouter } from './routes/authSession';
import { billingRouter, billingWebhookRouter } from './routes/billing';
import { brightspaceCalendarRouter } from './routes/brightspaceCalendar';
import { emailRouter, publicEmailRouter } from './routes/email';
import { stagingAccessRouter } from './routes/stagingAccess';
import { notificationsRouter } from './notifications';

export function createApp() {
  const app = express();

  app.use(cors(createCorsOptions(config.appOrigins)));
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookRouter);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/staging-access/config', (_req, res) => {
    res.json({ enabled: config.stagingAccessControlEnabled });
  });
  app.use('/api/auth', authSessionRouter);
  app.use('/api/email', publicEmailRouter);
  app.use('/api/auth', authSessionRouter);

  app.use('/api', requireStagingAccess);
  app.use('/api/staging-access', stagingAccessRouter);
  app.use('/api/actions', actionsRouter);
  app.use('/api/brightspace-calendar', brightspaceCalendarRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/email', emailRouter);
  app.use('/api/notifications', notificationsRouter);

  return app;
}
