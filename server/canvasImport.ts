import type { PoolClient } from 'pg';

export const CANVAS_SOURCE_PROVIDER = 'canvas_ics';
const DEFAULT_COURSE_COLOR = 'course-gray';
const MAX_IMPORT_ROWS = 2_000;

export type CanvasImportRow = {
  sourceUid: string;
  title: string;
  courseCode: string;
  courseName: string;
  entryKind: 'homework' | 'event';
  date: string;
  time?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  timezone: string;
  description?: string;
  sourceUrl?: string;
};

export type CanvasImportResponse = {
  createdCourses: number;
  createdAssignments: number;
  createdEvents: number;
  skippedDuplicates: number;
  errors: string[];
};

type Queryable = Pick<PoolClient, 'query'>;

function text(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, maxLength);
}

function date(value: unknown): string {
  const result = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`Invalid import date: ${result || 'missing date'}`);
  return result;
}

function time(value: unknown): string | null {
  const result = text(value, 8);
  if (!result) return null;
  const match = result.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error(`Invalid import time: ${result}`);
  return `${match[1]}:${match[2]}`;
}

function timezone(value: unknown): string {
  const result = text(value, 100) || 'America/Los_Angeles';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: result }).format(new Date());
  } catch {
    throw new Error(`Unsupported timezone: ${result}`);
  }
  return result;
}

function httpsUrl(value: unknown): string | undefined {
  const result = text(value, 1_024);
  if (!result) return undefined;
  try {
    const url = new URL(result);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizeCanvasImportRows(value: unknown): CanvasImportRow[] {
  if (!Array.isArray(value) || value.length > MAX_IMPORT_ROWS) throw new Error(`rows must contain no more than ${MAX_IMPORT_ROWS.toLocaleString()} items`);
  return value.map((candidateValue, index) => {
    const candidate = candidateValue as Partial<CanvasImportRow>;
    const sourceUid = text(candidate.sourceUid, 512);
    const title = text(candidate.title, 300);
    const courseCode = text(candidate.courseCode, 80).toUpperCase();
    const courseName = text(candidate.courseName, 200) || courseCode;
    const entryKind = candidate.entryKind;
    const startDate = date(candidate.date);
    const startTime = time(candidate.time);
    const endDate = candidate.endDate ? date(candidate.endDate) : null;
    const endTime = time(candidate.endTime);
    const eventTimezone = timezone(candidate.timezone);
    if (!sourceUid || !title) throw new Error(`Row ${index + 1} is missing a Canvas UID or title`);
    if (entryKind !== 'homework' && entryKind !== 'event') throw new Error(`Row ${index + 1} has an unsupported entry kind`);
    if (entryKind === 'homework' && !courseCode) throw new Error(`Row ${index + 1} needs a course before it can be imported as homework`);
    if (endDate && endDate < startDate) throw new Error(`Row ${index + 1} ends before it starts`);
    if (endTime && !startTime) throw new Error(`Row ${index + 1} needs a start time when an end time is present`);
    return {
      sourceUid,
      title,
      courseCode,
      courseName,
      entryKind,
      date: startDate,
      time: startTime,
      endDate,
      endTime,
      timezone: eventTimezone,
      description: text(candidate.description, 4_000),
      sourceUrl: httpsUrl(candidate.sourceUrl),
    };
  });
}

async function upsertCourse(client: Queryable, userId: string, row: CanvasImportRow) {
  if (!row.courseCode) return { id: null, created: false };
  const result = await client.query<{ id: string; created: boolean }>(
    `
      WITH inserted AS (
        INSERT INTO courses (code, name, color, user_id)
        VALUES ($2, $3, $4, $1)
        ON CONFLICT (user_id, code) WHERE user_id IS NOT NULL DO NOTHING
        RETURNING id, TRUE AS created
      )
      SELECT id, created FROM inserted
      UNION ALL
      SELECT id, FALSE AS created FROM courses
      WHERE user_id = $1 AND code = $2 AND NOT EXISTS (SELECT 1 FROM inserted)
      LIMIT 1;
    `,
    [userId, row.courseCode, row.courseName, DEFAULT_COURSE_COLOR]
  );
  if (!result.rows[0]) throw new Error(`Could not create or find course ${row.courseCode}`);
  return result.rows[0];
}

function sourceDescription(row: CanvasImportRow): string | null {
  return [row.description, row.sourceUrl ? `Canvas: ${row.sourceUrl}` : ''].filter(Boolean).join('\n\n') || null;
}

export async function importCanvasRows(client: Queryable, userId: string, rows: CanvasImportRow[]): Promise<CanvasImportResponse> {
  const response: CanvasImportResponse = { createdCourses: 0, createdAssignments: 0, createdEvents: 0, skippedDuplicates: 0, errors: [] };
  const createdCourseCodes = new Set<string>();
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [userId]);
  for (const row of rows) {
    try {
      if (row.entryKind === 'homework') {
        const existing = await client.query(
          `
            SELECT a.id
            FROM assignments a
            JOIN courses c ON c.id = a.course_id
            WHERE c.user_id = $1 AND a.source_provider = $2 AND a.source_key = $3
            LIMIT 1;
          `,
          [userId, CANVAS_SOURCE_PROVIDER, row.sourceUid]
        );
        if (existing.rowCount) {
          response.skippedDuplicates += 1;
          continue;
        }
      }
      const course = await upsertCourse(client, userId, row);
      if (course.created && !createdCourseCodes.has(row.courseCode)) {
        createdCourseCodes.add(row.courseCode);
        response.createdCourses += 1;
      }
      if (row.entryKind === 'homework') {
        const result = await client.query(
          `
            INSERT INTO assignments (
              course_id, name, due_date, due_time, due_timezone, status, description, source_provider, source_key
            )
            VALUES ($1::bigint, $2, $3::date, $4::time, $5, 'upcoming', $6, $7, $8)
            ON CONFLICT (course_id, source_provider, source_key)
              WHERE source_provider IS NOT NULL AND source_key IS NOT NULL DO NOTHING
            RETURNING id;
          `,
          [course.id, row.title, row.date, row.time, row.timezone, sourceDescription(row), CANVAS_SOURCE_PROVIDER, row.sourceUid]
        );
        if (result.rowCount === 1) response.createdAssignments += 1;
        else response.skippedDuplicates += 1;
      } else {
        const result = await client.query(
          `
            INSERT INTO events (
              title, event_date, end_date, event_time, end_time, event_timezone, description,
              user_id, source_provider, source_key, course_id
            )
            VALUES ($1, $2::date, $3::date, $4::time, $5::time, $6, $7, $8, $9, $10, $11::bigint)
            ON CONFLICT (user_id, source_provider, source_key)
              WHERE user_id IS NOT NULL AND source_provider IS NOT NULL AND source_key IS NOT NULL DO NOTHING
            RETURNING id;
          `,
          [row.title, row.date, row.endDate, row.time, row.endTime, row.timezone, sourceDescription(row), userId, CANVAS_SOURCE_PROVIDER, row.sourceUid, course.id]
        );
        if (result.rowCount === 1) response.createdEvents += 1;
        else response.skippedDuplicates += 1;
      }
    } catch (err) {
      response.errors.push(`${row.title}: ${err instanceof Error ? err.message : 'Import row failed'}`);
    }
  }
  if (response.createdCourses > 0) {
    await client.query(
      `
        INSERT INTO launch_onboarding (user_id, first_course_at)
        VALUES ($1, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          first_course_at = COALESCE(launch_onboarding.first_course_at, NOW()), updated_at = NOW();
      `,
      [userId]
    );
  }
  return response;
}
