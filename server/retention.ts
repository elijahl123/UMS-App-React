import { pool } from './db';

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function runRetentionCleanup() {
  await pool.query(`DELETE FROM product_events WHERE occurred_at < NOW() - INTERVAL '13 months';`);
  await pool.query(`DELETE FROM campaign_attributions WHERE last_seen_at < NOW() - INTERVAL '13 months';`);
  await pool.query(`DELETE FROM google_calendar_sync_runs WHERE COALESCE(finished_at, started_at) < NOW() - INTERVAL '30 days';`);
  await pool.query(`DELETE FROM deletion_tombstones WHERE purge_after <= NOW();`);
  await pool.query(`
    DELETE FROM waitlist_subscriptions
    WHERE CURRENT_DATE >= DATE '2027-04-01'
       OR unsubscribed_at IS NOT NULL;
  `);
}

export function startRetentionCleanup() {
  void runRetentionCleanup().catch((err) => console.error('[retention] initial cleanup failed', err));
  const timer = setInterval(() => {
    void runRetentionCleanup().catch((err) => console.error('[retention] scheduled cleanup failed', err));
  }, RETENTION_INTERVAL_MS);
  timer.unref();
  return timer;
}
