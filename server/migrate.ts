import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db';

type AppliedMigrationRow = {
  filename: string;
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(currentDir, '..', 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<AppliedMigrationRow>(`
    SELECT filename
    FROM schema_migrations
    ORDER BY filename;
  `);

  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(filename: string, sql: string) {
  console.log(`[migrate] applying ${filename}`);
  await pool.query('BEGIN');

  try {
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [filename]);
    await pool.query('COMMIT');
    console.log(`[migrate] applied ${filename}`);
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`[migrate] skipping ${filename}`);
      continue;
    }

    const filePath = path.resolve(migrationsDir, filename);
    const sql = await readFile(filePath, 'utf8');
    await applyMigration(filename, sql);
  }

  console.log('[migrate] complete');
}

main()
  .catch((err) => {
    console.error('[migrate] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
