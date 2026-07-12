import cors from 'cors';
import express from 'express';
import { requireStagingAccess } from './auth';
import { config } from './config';
import { actionsRouter } from './routes/actions';
import { billingRouter, billingWebhookRouter } from './routes/billing';
import { emailRouter } from './routes/email';
import { stagingAccessRouter } from './routes/stagingAccess';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.appOrigin,
    })
  );
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookRouter);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/staging-access/config', (_req, res) => {
    res.json({ enabled: config.stagingAccessControlEnabled });
  });

  app.use('/api', requireStagingAccess);
  app.use('/api/staging-access', stagingAccessRouter);
  app.use('/api/actions', actionsRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/email', emailRouter);

  return app;
}
