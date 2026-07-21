import { Router, type Request, type Response } from 'express';
import { authenticatedFirebaseUser } from './auth';
import { pool, type QueryConfig } from './db';
import { ApiError } from './errors';

export type NotificationSourceType = 'assignment' | 'event' | 'class_session';

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  assignment24hEnabled: boolean;
  assignment1hEnabled: boolean;
  event10mEnabled: boolean;
  class10mEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timeZone: string;
}

interface NotificationInstanceInput {
  sourceType: NotificationSourceType;
  sourceId: string;
  occurrenceKey: string;
  fireAt: Date;
  targetAt: Date;
  title: string;
  body: string;
  reminderOffsetMinutes: number;
}

const SYNC_WINDOW_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function normalizeTime(value?: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

function assertTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function partsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

export function zonedDateTimeToUtc(isoDate: string, time: string, timeZone: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = targetUtc;
  const normalizedTimeZone = assertTimeZone(timeZone);

  for (let i = 0; i < 3; i += 1) {
    const parts = partsInTimeZone(new Date(utc), normalizedTimeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    utc -= asUtc - targetUtc;
  }

  return new Date(utc);
}

function formatLocalDate(date: Date, timeZone: string): string {
  const parts = partsInTimeZone(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function localMinutes(date: Date, timeZone: string): number {
  const parts = partsInTimeZone(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

function parseMinutes(time?: string | null): number | null {
  const normalized = normalizeTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

function isInsideQuietHours(date: Date, preferences: NotificationPreferences): boolean {
  if (!preferences.quietHoursEnabled || !preferences.quietHoursStart || !preferences.quietHoursEnd) {
    return false;
  }

  const start = parseMinutes(preferences.quietHoursStart);
  const end = parseMinutes(preferences.quietHoursEnd);
  if (start === null || end === null || start === end) return false;

  const current = localMinutes(date, preferences.timeZone);
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

function stableLocalNotificationId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function mapPreferences(row: Record<string, unknown>): NotificationPreferences {
  return {
    userId: String(row.user_id),
    enabled: Boolean(row.enabled),
    assignment24hEnabled: Boolean(row.assignment_24h_enabled),
    assignment1hEnabled: Boolean(row.assignment_1h_enabled),
    event10mEnabled: Boolean(row.event_10m_enabled),
    class10mEnabled: Boolean(row.class_10m_enabled),
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: row.quiet_hours_start ? normalizeTime(String(row.quiet_hours_start)) : null,
    quietHoursEnd: row.quiet_hours_end ? normalizeTime(String(row.quiet_hours_end)) : null,
    timeZone: assertTimeZone(String(row.time_zone || 'UTC')),
  };
}

export function selectNotificationInstancesQuery(userId: string, limit = 50): QueryConfig {
  return {
    text: `
      SELECT
        id::text,
        source_type,
        source_id::text,
        occurrence_key,
        fire_at,
        target_at,
        title,
        body,
        reminder_offset_minutes,
        local_notification_id,
        read_at,
        dismissed_at
      FROM notification_instances
      WHERE user_id = $1
        AND dismissed_at IS NULL
        AND (
          read_at IS NULL
          OR fire_at >= NOW()
        )
      ORDER BY
        CASE WHEN fire_at <= NOW() AND read_at IS NULL THEN 0 ELSE 1 END,
        fire_at
      LIMIT $2;
    `,
    values: [userId, limit],
  };
}

function selectNotificationScheduleQuery(userId: string, limit = 250): QueryConfig {
  return {
    text: `
      SELECT
        id::text,
        source_type,
        source_id::text,
        occurrence_key,
        fire_at,
        target_at,
        title,
        body,
        reminder_offset_minutes,
        local_notification_id,
        read_at,
        dismissed_at
      FROM notification_instances
      WHERE user_id = $1
        AND dismissed_at IS NULL
        AND read_at IS NULL
        AND fire_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY fire_at
      LIMIT $2;
    `,
    values: [userId, limit],
  };
}

async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  await pool.query(
    `
      INSERT INTO notification_preferences (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING;
    `,
    [userId]
  );

  const result = await pool.query(
    `
      SELECT *
      FROM notification_preferences
      WHERE user_id = $1;
    `,
    [userId]
  );

  return mapPreferences(result.rows[0]);
}

export async function syncNotificationInstancesForUser(userId: string) {
  const preferences = await getNotificationPreferences(userId);

  await pool.query(
    `
      DELETE FROM notification_instances
      WHERE user_id = $1
        AND fire_at > NOW()
        AND read_at IS NULL
        AND dismissed_at IS NULL;
    `,
    [userId]
  );

  if (!preferences.enabled) {
    return [];
  }

  const instances = await buildNotificationInstances(userId, preferences);
  for (const instance of instances) {
    const uniqueKey = `${userId}:${instance.sourceType}:${instance.sourceId}:${instance.occurrenceKey}:${instance.reminderOffsetMinutes}`;
    await pool.query(
      `
        INSERT INTO notification_instances (
          user_id,
          source_type,
          source_id,
          occurrence_key,
          fire_at,
          target_at,
          title,
          body,
          reminder_offset_minutes,
          local_notification_id
        )
        VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id, source_type, source_id, occurrence_key, reminder_offset_minutes)
        DO UPDATE SET
          fire_at = EXCLUDED.fire_at,
          target_at = EXCLUDED.target_at,
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          local_notification_id = EXCLUDED.local_notification_id,
          updated_at = NOW();
      `,
      [
        userId,
        instance.sourceType,
        instance.sourceId,
        instance.occurrenceKey,
        instance.fireAt,
        instance.targetAt,
        instance.title,
        instance.body,
        instance.reminderOffsetMinutes,
        stableLocalNotificationId(uniqueKey),
      ]
    );
  }

  const schedule = await pool.query(selectNotificationScheduleQuery(userId, 250).text, [userId, 250]);
  return schedule.rows;
}

async function buildNotificationInstances(userId: string, preferences: NotificationPreferences) {
  const [assignmentResult, eventResult, classResult] = await Promise.all([
    pool.query(
      `
        SELECT a.id::text, a.name, a.due_date::text AS due_date, a.due_time::text AS due_time, a.due_timezone, c.code
        FROM assignments a
        JOIN courses c ON c.id = a.course_id
        WHERE c.user_id = $1
          AND a.status <> 'completed'
          AND a.due_time IS NOT NULL;
      `,
      [userId]
    ),
    pool.query(
      `
        SELECT id::text, title, event_date::text AS event_date, event_time::text AS event_time, event_timezone
        FROM events
        WHERE user_id = $1
          AND event_time IS NOT NULL;
      `,
      [userId]
    ),
    pool.query(
      `
        SELECT s.id::text, s.day, s.start_time::text AS start_time, c.code
        FROM class_sessions s
        JOIN courses c ON c.id = s.course_id
        WHERE c.user_id = $1;
      `,
      [userId]
    ),
  ]);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + SYNC_WINDOW_DAYS * DAY_MS);
  const instances: NotificationInstanceInput[] = [];

  const add = (input: NotificationInstanceInput) => {
    if (input.fireAt <= now || input.targetAt <= now || input.fireAt > windowEnd) return;
    if (isInsideQuietHours(input.fireAt, preferences)) return;
    instances.push(input);
  };

  for (const assignment of assignmentResult.rows) {
    const time = normalizeTime(assignment.due_time);
    if (!time) continue;
    const timeZone = assertTimeZone(assignment.due_timezone || preferences.timeZone);
    const targetAt = zonedDateTimeToUtc(String(assignment.due_date), time, timeZone);
    const offsets = [
      preferences.assignment24hEnabled ? 24 * 60 : null,
      preferences.assignment1hEnabled ? 60 : null,
    ].filter((offset): offset is number => offset !== null);

    for (const offset of offsets) {
      add({
        sourceType: 'assignment',
        sourceId: assignment.id,
        occurrenceKey: `${assignment.due_date}:${time}`,
        fireAt: new Date(targetAt.getTime() - offset * 60 * 1000),
        targetAt,
        title: `${assignment.code}: ${assignment.name}`,
        body: offset >= 24 * 60 ? 'Assignment due tomorrow.' : 'Assignment due in 1 hour.',
        reminderOffsetMinutes: offset,
      });
    }
  }

  if (preferences.event10mEnabled) {
    for (const event of eventResult.rows) {
      const time = normalizeTime(event.event_time);
      if (!time) continue;
      const timeZone = assertTimeZone(event.event_timezone || preferences.timeZone);
      const targetAt = zonedDateTimeToUtc(String(event.event_date), time, timeZone);
      add({
        sourceType: 'event',
        sourceId: event.id,
        occurrenceKey: `${event.event_date}:${time}`,
        fireAt: new Date(targetAt.getTime() - 10 * 60 * 1000),
        targetAt,
        title: event.title,
        body: 'Event starts in 10 minutes.',
        reminderOffsetMinutes: 10,
      });
    }
  }

  if (preferences.class10mEnabled) {
    for (const session of classResult.rows) {
      const time = normalizeTime(session.start_time);
      if (!time) continue;
      for (const occurrenceDate of nextOccurrenceDates(String(session.day), preferences.timeZone, now, windowEnd)) {
        const targetAt = zonedDateTimeToUtc(occurrenceDate, time, preferences.timeZone);
        add({
          sourceType: 'class_session',
          sourceId: session.id,
          occurrenceKey: occurrenceDate,
          fireAt: new Date(targetAt.getTime() - 10 * 60 * 1000),
          targetAt,
          title: `${session.code} class`,
          body: 'Class starts in 10 minutes.',
          reminderOffsetMinutes: 10,
        });
      }
    }
  }

  return instances;
}

function nextOccurrenceDates(day: string, timeZone: string, now: Date, windowEnd: Date): string[] {
  const targetDay = dayNames.indexOf(day as (typeof dayNames)[number]);
  if (targetDay < 0) return [];

  const dates: string[] = [];
  const localToday = formatLocalDate(now, timeZone);
  const localWindowEnd = formatLocalDate(windowEnd, timeZone);
  const cursor = zonedDateTimeToUtc(localToday, '12:00', timeZone);

  while (formatLocalDate(cursor, timeZone) <= localWindowEnd) {
    const localDate = formatLocalDate(cursor, timeZone);
    const localNoon = zonedDateTimeToUtc(localDate, '12:00', timeZone);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(localNoon);
    if (weekday === day) {
      dates.push(localDate);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

async function currentUserId(req: Request): Promise<string> {
  return (await authenticatedFirebaseUser(req)).uid;
}

function sendError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'SERVER_ERROR';
  const status = err instanceof ApiError ? err.status : 500;
  return res.status(status).json({ error: { message } });
}

export const notificationsRouter = Router();

notificationsRouter.get('/preferences', async (req, res) => {
  try {
    res.json(await getNotificationPreferences(await currentUserId(req)));
  } catch (err) {
    sendError(res, err);
  }
});

notificationsRouter.put('/preferences', async (req, res) => {
  try {
    const userId = await currentUserId(req);
    const body = req.body ?? {};
    const timeZone = assertTimeZone(String(body.timeZone || 'UTC'));
    const result = await pool.query(
      `
        INSERT INTO notification_preferences (
          user_id,
          enabled,
          assignment_24h_enabled,
          assignment_1h_enabled,
          event_10m_enabled,
          class_10m_enabled,
          quiet_hours_enabled,
          quiet_hours_start,
          quiet_hours_end,
          time_zone
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, '')::time, NULLIF($9, '')::time, $10)
        ON CONFLICT (user_id)
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          assignment_24h_enabled = EXCLUDED.assignment_24h_enabled,
          assignment_1h_enabled = EXCLUDED.assignment_1h_enabled,
          event_10m_enabled = EXCLUDED.event_10m_enabled,
          class_10m_enabled = EXCLUDED.class_10m_enabled,
          quiet_hours_enabled = EXCLUDED.quiet_hours_enabled,
          quiet_hours_start = EXCLUDED.quiet_hours_start,
          quiet_hours_end = EXCLUDED.quiet_hours_end,
          time_zone = EXCLUDED.time_zone,
          updated_at = NOW()
        RETURNING *;
      `,
      [
        userId,
        Boolean(body.enabled),
        body.assignment24hEnabled !== false,
        body.assignment1hEnabled !== false,
        body.event10mEnabled !== false,
        body.class10mEnabled !== false,
        Boolean(body.quietHoursEnabled),
        body.quietHoursStart ?? null,
        body.quietHoursEnd ?? null,
        timeZone,
      ]
    );
    await syncNotificationInstancesForUser(userId);
    res.json(mapPreferences(result.rows[0]));
  } catch (err) {
    sendError(res, err);
  }
});

notificationsRouter.post('/sync', async (req, res) => {
  try {
    const userId = await currentUserId(req);
    const instances = await syncNotificationInstancesForUser(userId);
    res.json({ instances });
  } catch (err) {
    sendError(res, err);
  }
});

notificationsRouter.get('/instances', async (req, res) => {
  try {
    const userId = await currentUserId(req);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
    const query = selectNotificationInstancesQuery(userId, limit);
    const result = await pool.query(query.text, query.values);
    res.json(result.rows);
  } catch (err) {
    sendError(res, err);
  }
});

notificationsRouter.post('/instances/:id/read', async (req, res) => {
  try {
    const result = await pool.query(
      `
        UPDATE notification_instances
        SET read_at = COALESCE(read_at, NOW()), updated_at = NOW()
        WHERE id = $1::bigint AND user_id = $2
        RETURNING id::text;
      `,
      [req.params.id, await currentUserId(req)]
    );
    res.json({ ok: result.rowCount === 1 });
  } catch (err) {
    sendError(res, err);
  }
});

notificationsRouter.post('/instances/:id/dismiss', async (req, res) => {
  try {
    const result = await pool.query(
      `
        UPDATE notification_instances
        SET dismissed_at = COALESCE(dismissed_at, NOW()), updated_at = NOW()
        WHERE id = $1::bigint AND user_id = $2
        RETURNING id::text;
      `,
      [req.params.id, await currentUserId(req)]
    );
    res.json({ ok: result.rowCount === 1 });
  } catch (err) {
    sendError(res, err);
  }
});

notificationsRouter.post('/read-all', async (req, res) => {
  try {
    await pool.query(
      `
        UPDATE notification_instances
        SET read_at = COALESCE(read_at, NOW()), updated_at = NOW()
        WHERE user_id = $1 AND fire_at <= NOW() AND dismissed_at IS NULL;
      `,
      [await currentUserId(req)]
    );
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});
