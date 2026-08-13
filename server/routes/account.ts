import { Router } from 'express';
import { pool } from '../db';

export const accountRouter = Router();

function protectSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown): string {
  const text = protectSpreadsheetCell(value).replace(/\r?\n/g, '\n');
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[], headers: string[]): Buffer {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(','));
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function noteText(value: unknown): string {
  return String(value ?? '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function notesHtml(rows: Record<string, unknown>[]): Buffer {
  const articles = rows.map((row) => `
    <article>
      <h2>${escapeHtml(row.title)}</h2>
      <p class="meta">Course: ${escapeHtml(row.course_code ?? 'Unassigned')} · Updated: ${escapeHtml(row.updated_at)}</p>
      <pre>${escapeHtml(noteText(row.content))}</pre>
    </article>`).join('\n');
  return Buffer.from(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>UMS notes export</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#17201c}
article{border-bottom:1px solid #d7ddd9;padding:1rem 0 2rem}.meta{color:#59635e}pre{white-space:pre-wrap;font:inherit}
</style></head><body><h1>Notes</h1>${articles || '<p>No notes found.</p>'}</body></html>`, 'utf8');
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const checksum = crc32(file.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, file.data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

accountRouter.get('/export', async (req, res) => {
  try {
    const userId = req.auth!.uid;
    const [courses, assignments, events, classes, plans, planTasks, notes] = await Promise.all([
      pool.query(`SELECT code, name, color, homepage_url FROM courses WHERE user_id = $1 ORDER BY code`, [userId]),
      pool.query(`
        SELECT c.code AS course_code, a.name, a.due_date::text AS due_date,
               a.due_time::text AS due_time, a.due_timezone, a.status, a.description
        FROM assignments a JOIN courses c ON c.id = a.course_id
        WHERE c.user_id = $1 ORDER BY a.due_date, a.due_time NULLS LAST
      `, [userId]),
      pool.query(`
        SELECT COALESCE(c.code, '') AS course_code, e.title, e.event_date::text AS event_date,
               e.end_date::text AS end_date, e.event_time::text AS event_time,
               e.end_time::text AS end_time, e.event_timezone, e.description,
               COALESCE(e.academic_kind, '') AS academic_kind
        FROM events e LEFT JOIN courses c ON c.id = e.course_id
        WHERE e.user_id = $1 AND NOT COALESCE(e.google_cancelled, FALSE)
        ORDER BY e.event_date, e.event_time NULLS LAST
      `, [userId]),
      pool.query(`
        SELECT c.code AS course_code, c.name AS title, 'weekly_schedule'::text AS source,
               NULL::text AS event_date, s.day, s.start_time::text AS start_time,
               s.end_time::text AS end_time, s.location
        FROM class_sessions s JOIN courses c ON c.id = s.course_id
        WHERE c.user_id = $1
        UNION ALL
        SELECT c.code AS course_code, e.title, COALESCE(e.source_provider, 'calendar') AS source,
               e.event_date::text AS event_date, NULL::text AS day,
               e.event_time::text AS start_time, e.end_time::text AS end_time, NULL::text AS location
        FROM events e JOIN courses c ON c.id = e.course_id
        WHERE e.user_id = $1 AND e.academic_kind = 'class' AND NOT COALESCE(e.google_cancelled, FALSE)
        ORDER BY event_date NULLS LAST, day NULLS LAST, start_time
      `, [userId]),
      pool.query(`
        SELECT c.code AS course_code, p.target_type, p.target_title,
               p.target_date::text AS target_date, p.exam_type, p.exam_date::text AS exam_date,
               p.start_date::text AS start_date, p.timezone, p.estimated_minutes,
               p.daily_cap_minutes, p.unscheduled_minutes, p.scheduler_version,
               p.scheduler_explanation, p.archived
        FROM study_plans p JOIN courses c ON c.id = p.course_id
        WHERE c.user_id = $1 ORDER BY COALESCE(p.target_date, p.exam_date), c.code
      `, [userId]),
      pool.query(`
        SELECT c.code AS course_code, p.target_type, p.target_title,
               t.title_override AS custom_title, topic.title AS topic,
               t.phase, t.scheduled_date::text AS scheduled_date,
               t.estimated_minutes, t.completed_at::text AS completed_at,
               t.manually_edited_at::text AS manually_edited_at
        FROM study_tasks t
        JOIN study_plans p ON p.id = t.plan_id
        JOIN study_topics topic ON topic.id = t.topic_id
        JOIN courses c ON c.id = p.course_id
        WHERE c.user_id = $1
        ORDER BY t.scheduled_date, c.code, t.sequence
      `, [userId]),
      pool.query(`
        SELECT n.title, n.content, n.updated_at::text AS updated_at, c.code AS course_code
        FROM notes n LEFT JOIN courses c ON c.id = n.course_id
        WHERE n.user_id = $1 ORDER BY n.updated_at DESC
      `, [userId]),
    ]);

    const files = [
      { name: 'courses.csv', data: toCsv(courses.rows, ['code', 'name', 'color', 'homepage_url']) },
      { name: 'assignments.csv', data: toCsv(assignments.rows, ['course_code', 'name', 'due_date', 'due_time', 'due_timezone', 'status', 'description']) },
      { name: 'events.csv', data: toCsv(events.rows, ['course_code', 'title', 'event_date', 'end_date', 'event_time', 'end_time', 'event_timezone', 'description', 'academic_kind']) },
      { name: 'classes.csv', data: toCsv(classes.rows, ['course_code', 'title', 'source', 'event_date', 'day', 'start_time', 'end_time', 'location']) },
      { name: 'plans.csv', data: toCsv(plans.rows, ['course_code', 'target_type', 'target_title', 'target_date', 'exam_type', 'exam_date', 'start_date', 'timezone', 'estimated_minutes', 'daily_cap_minutes', 'unscheduled_minutes', 'scheduler_version', 'scheduler_explanation', 'archived']) },
      { name: 'plan-tasks.csv', data: toCsv(planTasks.rows, ['course_code', 'target_type', 'target_title', 'custom_title', 'topic', 'phase', 'scheduled_date', 'estimated_minutes', 'completed_at', 'manually_edited_at']) },
      { name: 'notes.html', data: notesHtml(notes.rows) },
    ];
    const zip = createZip(files);
    await pool.query(
      `INSERT INTO product_events (event_name, user_id, occurred_at, properties) VALUES ('account_exported', $1, NOW(), '{}'::jsonb)`,
      [userId]
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="ums-export-${new Date().toISOString().slice(0, 10)}.zip"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(zip);
  } catch (err) {
    console.error('[account] export failed', err);
    return res.status(500).json({ error: { message: 'ACCOUNT_EXPORT_FAILED' } });
  }
});
