import { reapplyDeletionTombstones } from './accountDeletion';
import { pool } from './db';

reapplyDeletionTombstones()
  .then((result) => {
    console.log(`[deletion-tombstones] purged ${result.usersPurged} restored users and ${result.emailsPurged} restored email records`);
  })
  .catch((err) => {
    console.error('[deletion-tombstones] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
