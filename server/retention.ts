import { pool } from './db';
import { deleteNoteImageObject, noteImageStorageConfigured } from './noteImageStorage';

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STORAGE_RETENTION_INTERVAL_MS = 60 * 60 * 1000;

export async function drainObjectDeletionQueue() {
  if (!noteImageStorageConfigured()) return { deleted: 0, failed: 0 };
  const queued = await pool.query<{ object_key: string; attempts: number }>(`
    SELECT object_key, attempts
    FROM object_storage_deletion_queue
    WHERE next_attempt_at <= NOW()
    ORDER BY created_at
    LIMIT 50;
  `);
  let deleted = 0;
  let failed = 0;
  for (const row of queued.rows) {
    try {
      await deleteNoteImageObject(row.object_key);
      await pool.query(`DELETE FROM object_storage_deletion_queue WHERE object_key = $1;`, [row.object_key]);
      deleted += 1;
    } catch (err) {
      failed += 1;
      const nextAttempts = row.attempts + 1;
      const delaySeconds = Math.min(24 * 60 * 60, 60 * (2 ** Math.min(nextAttempts, 10)));
      const message = err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 500) : 'OBJECT_DELETE_FAILED';
      await pool.query(
        `
          UPDATE object_storage_deletion_queue
          SET attempts = $2,
              next_attempt_at = NOW() + ($3 * INTERVAL '1 second'),
              last_error = $4,
              updated_at = NOW()
          WHERE object_key = $1;
        `,
        [row.object_key, nextAttempts, delaySeconds, message]
      );
    }
  }
  return { deleted, failed };
}

export function requestObjectDeletionQueueDrain() {
  void drainObjectDeletionQueue().catch((err) => {
    console.error('[retention] requested object cleanup failed', err);
  });
}

export async function runRetentionCleanup() {
  await pool.query(`DELETE FROM note_images WHERE note_id IS NULL AND created_at < NOW() - INTERVAL '24 hours';`);
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
  void runRetentionCleanup()
    .then(() => drainObjectDeletionQueue())
    .catch((err) => console.error('[retention] initial cleanup failed', err));
  const timer = setInterval(() => {
    void runRetentionCleanup().catch((err) => console.error('[retention] scheduled cleanup failed', err));
  }, RETENTION_INTERVAL_MS);
  timer.unref();
  const storageTimer = setInterval(() => {
    void drainObjectDeletionQueue().catch((err) => console.error('[retention] object cleanup failed', err));
  }, STORAGE_RETENTION_INTERVAL_MS);
  storageTimer.unref();
  return { timer, storageTimer };
}
