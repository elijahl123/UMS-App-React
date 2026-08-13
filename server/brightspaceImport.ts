import type { PoolClient } from 'pg';

export const BRIGHTSPACE_SOURCE_PROVIDER = 'brightspace_pdf';
const DEFAULT_COURSE_COLOR = 'course-gray';
const IMPORT_TIME_ZONE = 'Europe/Dublin';

export type BrightspaceImportRow = {
  title: string;
  courseCode: string;
  courseName: string;
  entryKind: 'homework' | 'event';
  date: string;
  time?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  sourceLabel: string;
};

export type BrightspaceImportResponse = {
  createdCourses: number;
  createdAssignments: number;
  createdEvents: number;
  skippedDuplicates: number;
  errors: string[];
};

type Queryable = Pick<PoolClient, 'query'>;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeDate(value: unknown): string {
  const text = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Invalid import date: ${text || 'missing date'}`);
  }
  return text;
}

function normalizeTime(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    throw new Error(`Invalid import time: ${text}`);
  }
  return `${match[1]}:${match[2]}`;
}

export function buildBrightspaceSourceKey(row: BrightspaceImportRow): string {
  const parts = [row.courseCode, row.title, row.entryKind, row.date, row.time ?? ''];
  if (row.endDate || row.endTime) parts.push(row.endDate ?? '', row.endTime ?? '');
  return parts
    .map((part) => normalizeText(part).toLowerCase().replace(/\s+/g, ' '))
    .join('|');
}

export function normalizeBrightspaceImportRows(rows: unknown): BrightspaceImportRow[] {
  if (!Array.isArray(rows)) {
    throw new Error('rows must be an array');
  }

  return rows.map((row, index) => {
    const candidate = row as Partial<BrightspaceImportRow>;
    const title = normalizeText(candidate.title);
    const courseCode = normalizeText(candidate.courseCode).toUpperCase();
    const courseName = normalizeText(candidate.courseName);
    const entryKind = candidate.entryKind;
    const date = normalizeDate(candidate.date);
    const time = normalizeTime(candidate.time);
    const endDate = candidate.endDate ? normalizeDate(candidate.endDate) : null;
    const endTime = normalizeTime(candidate.endTime);
    const sourceLabel = normalizeText(candidate.sourceLabel);

    if (!title || !courseCode || !courseName || !sourceLabel) {
      throw new Error(`Row ${index + 1} is missing required import data`);
    }

    if (entryKind !== 'homework' && entryKind !== 'event') {
      throw new Error(`Row ${index + 1} has an unsupported entry kind`);
    }

    if (endDate && endDate < date) throw new Error(`Row ${index + 1} ends before it starts`);
    if (endTime && !time) throw new Error(`Row ${index + 1} needs a start time when an end time is present`);
    return { title, courseCode, courseName, entryKind, date, time, endDate, endTime, sourceLabel };
  });
}

async function upsertCourse(client: Queryable, userId: string, row: BrightspaceImportRow) {
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
      SELECT id, FALSE AS created
      FROM courses
      WHERE user_id = $1 AND code = $2
        AND NOT EXISTS (SELECT 1 FROM inserted)
      LIMIT 1;
    `,
    [userId, row.courseCode, row.courseName, DEFAULT_COURSE_COLOR]
  );

  const course = result.rows[0];
  if (!course) {
    throw new Error(`Could not create or find course ${row.courseCode}`);
  }

  return course;
}

async function insertAssignment(client: Queryable, courseId: string, row: BrightspaceImportRow, sourceKey: string): Promise<boolean> {
  const result = await client.query(
    `
      INSERT INTO assignments (
        course_id,
        name,
        due_date,
        due_time,
        due_timezone,
        status,
        description,
        source_provider,
        source_key
      )
      VALUES ($1::bigint, $2, $3::date, $4::time, $5, 'upcoming', $6, $7, $8)
      ON CONFLICT (course_id, source_provider, source_key)
        WHERE source_provider IS NOT NULL AND source_key IS NOT NULL
        DO NOTHING
      RETURNING id;
    `,
    [courseId, row.title, row.date, row.time, IMPORT_TIME_ZONE, null, BRIGHTSPACE_SOURCE_PROVIDER, sourceKey]
  );

  return result.rowCount === 1;
}

async function insertEvent(
  client: Queryable,
  userId: string,
  courseId: string,
  row: BrightspaceImportRow,
  sourceKey: string
): Promise<boolean> {
  const description = `${row.courseCode} - ${row.courseName} (${row.sourceLabel})`;
  const result = await client.query(
    `
      INSERT INTO events (
        title,
        event_date,
        end_date,
        event_time,
        end_time,
        event_timezone,
        description,
        user_id,
        source_provider,
        source_key,
        course_id
      )
      VALUES ($1, $2::date, $3::date, $4::time, $5::time, $6, $7, $8, $9, $10, $11::bigint)
      ON CONFLICT (user_id, source_provider, source_key)
        WHERE user_id IS NOT NULL AND source_provider IS NOT NULL AND source_key IS NOT NULL
        DO NOTHING
      RETURNING id;
    `,
    [
      row.title, row.date, row.endDate, row.time, row.endTime, IMPORT_TIME_ZONE,
      description, userId, BRIGHTSPACE_SOURCE_PROVIDER, sourceKey, courseId,
    ]
  );

  return result.rowCount === 1;
}

export async function importBrightspaceRows(
  client: Queryable,
  userId: string,
  rows: BrightspaceImportRow[]
): Promise<BrightspaceImportResponse> {
  const response: BrightspaceImportResponse = {
    createdCourses: 0,
    createdAssignments: 0,
    createdEvents: 0,
    skippedDuplicates: 0,
    errors: [],
  };
  const createdCourseCodes = new Set<string>();

  for (const row of rows) {
    try {
      const course = await upsertCourse(client, userId, row);
      if (course.created && !createdCourseCodes.has(row.courseCode)) {
        createdCourseCodes.add(row.courseCode);
        response.createdCourses += 1;
      }

      const sourceKey = buildBrightspaceSourceKey(row);
      const inserted =
        row.entryKind === 'homework'
          ? await insertAssignment(client, course.id, row, sourceKey)
          : await insertEvent(client, userId, course.id, row, sourceKey);

      if (inserted && row.entryKind === 'homework') {
        response.createdAssignments += 1;
      } else if (inserted && row.entryKind === 'event') {
        response.createdEvents += 1;
      } else {
        response.skippedDuplicates += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import row failed';
      response.errors.push(`${row.courseCode} ${row.title}: ${message}`);
    }
  }

  if (response.createdCourses > 0) {
    await client.query(
      `
        INSERT INTO ucd_onboarding (user_id, first_course_at)
        VALUES ($1, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          first_course_at = COALESCE(ucd_onboarding.first_course_at, NOW()), updated_at = NOW();
      `,
      [userId]
    );
  }

  return response;
}
