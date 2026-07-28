import { createApp } from './app';
import { ensureBillingTables } from './billing';
import { config } from './config';
import { pool } from './db';

await ensureBillingTables();

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`UMS API listening on http://localhost:${config.port}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Stop the other UMS API process or set PORT to another value.`);
    process.exit(1);
  }

  throw err;
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[shutdown] received ${signal}; closing HTTP server`);

  const forcedExit = setTimeout(() => {
    console.error('[shutdown] timed out; forcing exit');
    process.exit(1);
  }, 10_000);
  forcedExit.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    await pool.end();
    clearTimeout(forcedExit);
    console.log('[shutdown] complete');
    process.exit(0);
  } catch (err) {
    console.error('[shutdown] failed:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
