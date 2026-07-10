import cors from 'cors';
import express from 'express';
import { config } from './config';
import { actionsRouter } from './routes/actions';
import { emailRouter } from './routes/email';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.viteOrigin,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/actions', actionsRouter);
  app.use('/api/email', emailRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
