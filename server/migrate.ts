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

async function seedBaselineMigrations() {
  const migrationCount = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM schema_migrations;'
  );
  if (Number(migrationCount.rows[0]?.count ?? 0) > 0) {
    return;
  }

  const legacySchema = await pool.query<{
    courses: string | null;
    assignments: string | null;
    events: string | null;
    classSessions: string | null;
    notes: string | null;
    courseLinks: string | null;
    users: string | null;
  }>(`
    SELECT
      to_regclass('public.courses')::text AS courses,
      to_regclass('public.assignments')::text AS assignments,
      to_regclass('public.events')::text AS events,
      to_regclass('public.class_sessions')::text AS "classSessions",
      to_regclass('public.notes')::text AS notes,
      to_regclass('public.course_links')::text AS "courseLinks",
      to_regclass('public.users')::text AS users;
  `);
  const legacyTables = legacySchema.rows[0];
  if (
    !legacyTables?.courses
    || !legacyTables.assignments
    || !legacyTables.events
    || !legacyTables.classSessions
    || !legacyTables.notes
    || !legacyTables.courseLinks
    || !legacyTables.users
  ) {
    return;
  }

  console.log('[migrate] detected a legacy schema; recording baseline migrations');
  const appliedTxtPath = path.resolve(currentDir, '..', 'migrations', 'applied.txt');
  const appliedTxt = await readFile(appliedTxtPath, 'utf8');
  const filenames = appliedTxt
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter((line: string) => /^\d+_/.test(line))
    .map((line: string) => {
      const token = line.split(/\s+/)[0];
      return token.endsWith('.sql') ? token : `${token}.sql`;
    });

  for (const filename of filenames) {
    await pool.query(
      `
        INSERT INTO schema_migrations (filename)
        VALUES ($1)
        ON CONFLICT (filename) DO NOTHING;
      `,
      [filename]
    );
  }
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<AppliedMigrationRow>(`
    SELECT filename
    FROM schema_migrations
    ORDER BY filename;
  `);

  return new Set(result.rows.map((row: { filename: any; }) => row.filename));
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
  await seedBaselineMigrations();
  const applied = await getAppliedMigrations();
  const files = (await readdir(migrationsDir))
    .filter((file: string) => file.endsWith('.sql'))
    .sort((a: string, b: any) => a.localeCompare(b, 'en'));

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
