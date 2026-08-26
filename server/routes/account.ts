import { Router } from 'express';
import { ZipArchive, type ArchiverError } from 'archiver';
import { Readable } from 'node:stream';
import { pool } from '../db';
import { extractNoteImageIds } from '../notes';
import { getNoteImageObject } from '../noteImageStorage';
import { getAccountEmails } from '../accountEmails';

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
    .replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, '\n[Image: $1]\n')
    .replace(/<img\b[^>]*>/gi, '\n[Image]\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function notesHtml(
  rows: Record<string, unknown>[],
  images: Map<string, { path: string; filename: string }>
): Buffer {
  const articles = rows.map((row) => {
    const figures = extractNoteImageIds(String(row.content ?? ''))
      .map((id) => images.get(id))
      .filter((image): image is { path: string; filename: string } => Boolean(image))
      .map((image) => `<figure><img src="${escapeHtml(image.path)}" alt="${escapeHtml(image.filename)}"><figcaption>${escapeHtml(image.filename)}</figcaption></figure>`)
      .join('\n');
    return `
    <article>
      <h2>${escapeHtml(row.title)}</h2>
      <p class="meta">Course: ${escapeHtml(row.course_code ?? 'Unassigned')} · Updated: ${escapeHtml(row.updated_at)}</p>
      <pre>${escapeHtml(noteText(row.content))}</pre>
      ${figures ? `<div class="images">${figures}</div>` : ''}
    </article>`;
  }).join('\n');
  return Buffer.from(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>UMS notes export</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#17201c}
article{border-bottom:1px solid #d7ddd9;padding:1rem 0 2rem}.meta{color:#59635e}pre{white-space:pre-wrap;font:inherit}
figure{margin:1rem 0}img{display:block;max-width:100%;height:auto}figcaption{color:#59635e;font-size:.875rem}
</style></head><body><h1>Notes</h1>${articles || '<p>No notes found.</p>'}</body></html>`, 'utf8');
}

function exportFilename(id: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'image';
  return `note-images/${id}-${safe}`;
}

function readableBody(body: unknown): Readable {
  if (body instanceof Readable) return body;
  const sdkBody = body as { transformToWebStream?: () => ReadableStream } | undefined;
  if (sdkBody?.transformToWebStream) return Readable.fromWeb(sdkBody.transformToWebStream() as never);
  throw new Error('Spaces returned an unreadable image body');
}

export type AccountExportResult = {
  files: { name: string; data: Buffer }[];
  noteImages: { id: string; object_key: string; original_filename: string }[];
  imageExports: Map<string, { path: string; filename: string }>;
};

export async function buildAccountExport(userId: string): Promise<AccountExportResult> {
  const emails = await getAccountEmails(userId);
  const [
      courses, assignments, events, classes, plans, planTasks, capacityOverrides, recoveryRevisions, notes, noteImages,
      accountEmailRows, subscriptionRows, calendarConnectionRows, entitlementRows, waitlistRows, consentEventRows,
    ] = await Promise.all([
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
        SELECT c.code AS course_code, p.target_title,
               capacity.study_date::text AS study_date, capacity.minutes
        FROM study_plan_capacity_overrides capacity
        JOIN study_plans p ON p.id = capacity.plan_id
        JOIN courses c ON c.id = p.course_id
        WHERE c.user_id = $1
        ORDER BY capacity.study_date, c.code
      `, [userId]),
      pool.query(`
        SELECT revision.id, c.code AS course_code, p.target_title,
               revision.before_tasks, revision.after_tasks,
               revision.before_capacity_overrides, revision.after_capacity_overrides,
               revision.before_unscheduled_minutes, revision.after_unscheduled_minutes,
               revision.summary, revision.applied_at::text, revision.undone_at::text
        FROM study_plan_recovery_revisions revision
        JOIN study_plans p ON p.id = revision.plan_id
        JOIN courses c ON c.id = p.course_id
        WHERE c.user_id = $1
        ORDER BY revision.applied_at, revision.id
      `, [userId]),
      pool.query(`
        SELECT n.id, n.title, n.content, n.updated_at::text AS updated_at, c.code AS course_code
        FROM notes n LEFT JOIN courses c ON c.id = n.course_id
        WHERE n.user_id = $1 ORDER BY n.updated_at DESC
      `, [userId]),
      pool.query<{
        id: string;
        object_key: string;
        original_filename: string;
      }>(`
        SELECT id::text, object_key, original_filename
        FROM note_images
        WHERE user_id = $1 AND status = 'ready' AND note_id IS NOT NULL
        ORDER BY created_at;
      `, [userId]),
      pool.query(`
        SELECT email, verified_at::text, source, created_at::text
        FROM account_email_addresses WHERE firebase_uid = $1
        UNION ALL
        SELECT email, created_at::text AS verified_at, 'primary' AS source, created_at::text
        FROM account_primary_emails WHERE firebase_uid = $1
        ORDER BY created_at;
      `, [userId]),
      pool.query(`
        SELECT email, stripe_customer_id, stripe_subscription_id, stripe_price_id, status,
               current_period_end::text, cancel_at_period_end, created_at::text, updated_at::text
        FROM user_subscriptions WHERE user_id = $1;
      `, [userId]),
      pool.query(`
        SELECT google_email, calendar_id, last_synced_at::text, last_error, sync_in_progress,
               history_months, setup_completed, calendar_list_scope_granted, shared_calendar_scope_granted,
               created_at::text, updated_at::text
        FROM google_calendar_connections WHERE user_id = $1;
      `, [userId]),
      pool.query(`
        SELECT entitlement_key, qualifying_email, grant_source, starts_at::text, ends_at::text,
               grace_ends_at::text, granted_at::text, revoked_at::text
        FROM access_entitlements WHERE user_id = $1;
      `, [userId]),
      emails.length > 0
        ? pool.query(`
            SELECT email, list_key, consent, marketing_consent, confirmed_at::text, unsubscribed_at::text,
                   source, campaign, ambassador, society, referral, requested_at::text
            FROM waitlist_subscriptions WHERE lower(email) = ANY($1::text[]);
          `, [emails.map((email) => email.toLowerCase())])
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      pool.query(`
        SELECT consent_type, consent_version, granted, occurred_at::text, metadata
        FROM consent_events WHERE user_id = $1 OR lower(email) = ANY($2::text[])
        ORDER BY occurred_at;
      `, [userId, emails.map((email) => email.toLowerCase())]),
    ]);

    const imageExports = new Map(
      noteImages.rows.map((image) => [
        image.id,
        { path: exportFilename(image.id, image.original_filename), filename: image.original_filename },
      ])
    );
    const files = [
      { name: 'courses.csv', data: toCsv(courses.rows, ['code', 'name', 'color', 'homepage_url']) },
      { name: 'assignments.csv', data: toCsv(assignments.rows, ['course_code', 'name', 'due_date', 'due_time', 'due_timezone', 'status', 'description']) },
      { name: 'events.csv', data: toCsv(events.rows, ['course_code', 'title', 'event_date', 'end_date', 'event_time', 'end_time', 'event_timezone', 'description', 'academic_kind']) },
      { name: 'classes.csv', data: toCsv(classes.rows, ['course_code', 'title', 'source', 'event_date', 'day', 'start_time', 'end_time', 'location']) },
      { name: 'plans.csv', data: toCsv(plans.rows, ['course_code', 'target_type', 'target_title', 'target_date', 'exam_type', 'exam_date', 'start_date', 'timezone', 'estimated_minutes', 'daily_cap_minutes', 'unscheduled_minutes', 'scheduler_version', 'scheduler_explanation', 'archived']) },
      { name: 'plan-tasks.csv', data: toCsv(planTasks.rows, ['course_code', 'target_type', 'target_title', 'custom_title', 'topic', 'phase', 'scheduled_date', 'estimated_minutes', 'completed_at', 'manually_edited_at']) },
      { name: 'plan-capacity-overrides.csv', data: toCsv(capacityOverrides.rows, ['course_code', 'target_title', 'study_date', 'minutes']) },
      { name: 'recovery-revisions.json', data: Buffer.from(JSON.stringify(recoveryRevisions.rows, null, 2)) },
      { name: 'notes.html', data: notesHtml(notes.rows, imageExports) },
      { name: 'account.json', data: Buffer.from(JSON.stringify({ emails: accountEmailRows.rows }, null, 2)) },
      { name: 'billing.json', data: Buffer.from(JSON.stringify(subscriptionRows.rows, null, 2)) },
      { name: 'calendar-connection.json', data: Buffer.from(JSON.stringify(calendarConnectionRows.rows, null, 2)) },
      { name: 'entitlements.json', data: Buffer.from(JSON.stringify(entitlementRows.rows, null, 2)) },
      { name: 'waitlist-and-consent.json', data: Buffer.from(JSON.stringify({ waitlist: waitlistRows.rows, consentEvents: consentEventRows.rows }, null, 2)) },
    ];

  return { files, noteImages: noteImages.rows, imageExports };
}

// Shared by the HTTP export route and the offline data-subject-request CLI
// (server/dataSubjectRequest.ts) so both ship the exact same archive contents.
export async function streamAccountExportZip(userId: string, output: NodeJS.WritableStream): Promise<void> {
  const { files, noteImages, imageExports } = await buildAccountExport(userId);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const finished = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('finish', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });
  archive.on('warning', (err: ArchiverError) => console.warn('[account] export archive warning', err));
  archive.pipe(output);
  for (const file of files) archive.append(file.data, { name: file.name });
  for (const image of noteImages) {
    const object = await getNoteImageObject(image.object_key);
    if (!object.Body) throw new Error(`Missing image body for ${image.id}`);
    archive.append(readableBody(object.Body), { name: imageExports.get(image.id)!.path });
  }
  await archive.finalize();
  await finished;
}

accountRouter.get('/export', async (req, res) => {
  try {
    const userId = req.auth!.uid;
    await pool.query(
      `INSERT INTO product_events (event_name, user_id, occurred_at, properties) VALUES ('account_exported', $1, NOW(), '{}'::jsonb)`,
      [userId]
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="ums-export-${new Date().toISOString().slice(0, 10)}.zip"`);
    res.setHeader('Cache-Control', 'no-store');
    await streamAccountExportZip(userId, res);
    return undefined;
  } catch (err) {
    console.error('[account] export failed', err);
    if (res.headersSent) {
      res.destroy(err instanceof Error ? err : undefined);
      return undefined;
    }
    return res.status(500).json({ error: { message: 'ACCOUNT_EXPORT_FAILED' } });
  }
});
