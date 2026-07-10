import cors from 'cors';
import express from 'express';
import { config } from './config';
import { actionsRouter } from './routes/actions';
import { billingRouter, billingWebhookRouter } from './routes/billing';
import { emailRouter } from './routes/email';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.appOrigin,
    })
  );
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookRouter);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/actions', actionsRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/email', emailRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
