import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from './config';
import { pool } from './db';
import { ApiError } from './errors';
import { expandRecurringEventRows, recurrenceKey, type RecurringEventRow } from './googleCalendarRecurrence';
import { syncNotificationInstancesForUser } from './notifications';

export const GOOGLE_CALENDAR_SOURCE_PROVIDER = 'google_calendar';

const OWNED_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_CALENDAR_ID = 'primary';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_WINDOW_MS = 60 * 1000;
const DEFAULT_EVENT_DURATION_MINUTES = 60;
const COMPACT_SYNC_FORMAT_VERSION = 3;
const HISTORY_PRESETS = new Set([1, 3, 6, 12, 24]);

type Queryable = Pick<PoolClient, 'query'>;

export type GoogleOwnedCalendar = {
  id: string;
  summary: string;
  timeZone: string;
  backgroundColor: string | null;
  primary: boolean;
  selected: boolean;
};

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  calendarId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  syncInProgress: boolean;
  historyMonths: number;
  selectedCalendarIds: string[];
  setupCompleted: boolean;
  reauthorizationRequired: boolean;
};

export type GoogleSyncResult = {
  importedCount: number;
  updatedCount: number;
  deletedCount: number;
  pushedCount: number;
  fullSync: boolean;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
};

type GoogleEventDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  updated?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleEventDateTime;
};

type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  summary?: string;
  timeZone?: string;
  accessRole?: string;
  error?: { code?: number; message?: string };
};

type DbConnection = {
  user_id: string;
  google_email: string | null;
  calendar_id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string | Date | null;
  last_synced_at: string | Date | null;
  last_error: string | null;
  sync_in_progress: boolean;
  history_months: number;
  setup_completed: boolean;
  calendar_list_scope_granted: boolean;
  shared_calendar_scope_granted: boolean;
  sync_format_version: number;
};

type DbCalendar = {
  user_id: string;
  calendar_id: string;
  summary: string;
  time_zone: string;
  background_color: string | null;
  is_primary: boolean;
  selected: boolean;
  sync_token: string | null;
  last_synced_at: string | Date | null;
  last_error: string | null;
};

type DbEvent = RecurringEventRow;

export type LocalGoogleEventFields = {
  title: string;
  date: string;
  endDate: string | null;
  time: string | null;
  endTime: string | null;
  timeZone: string;
  description: string | null;
  googleUpdatedAt: string | null;
  googleEtag: string | null;
};

export type RecurringOccurrenceMutation = {
  recurringSeriesId: string;
  recurrenceOriginalStart: string;
  title?: string;
  date?: string;
  endDate?: string | null;
  time?: string | null;
  endTime?: string | null;
  timeZone?: string;
  description?: string | null;
  courseId?: string | null;
  academicKind?: 'class' | null;
};

function isGoogleCalendarConfigured(): boolean {
  return Boolean(config.googleCalendarClientId && config.googleCalendarClientSecret && config.googleTokenEncryptionKey);
}

function assertGoogleCalendarConfigured() {
  if (!isGoogleCalendarConfigured()) {
    throw new ApiError('Google Calendar is not configured for this app.', 500);
  }
}

function normalizeDate(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeDateOnly(value: string): string {
  return value.split('T')[0];
}

function normalizeTime(value?: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function encryptionKey(): Buffer {
  const raw = config.googleTokenEncryptionKey;
  if (!raw) throw new ApiError('GOOGLE_TOKEN_ENCRYPTION_KEY is required', 500);
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const base64 = Buffer.from(raw, 'base64');
  if (base64.length === 32) return base64;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptGoogleToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptGoogleToken(value: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new ApiError('Invalid encrypted Google token.', 500);
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
}

function stateSigningKey(): Buffer {
  const source = config.googleTokenEncryptionKey ?? config.googleCalendarClientSecret;
  if (!source) throw new ApiError('Google Calendar OAuth state signing is not configured.', 500);
  return crypto.createHash('sha256').update(source).digest();
}

type GoogleCalendarState = {
  userId: string;
  issuedAt: number;
  returnOrigin?: string;
};

export function signGoogleCalendarState(userId: string, issuedAt = Date.now(), returnOrigin?: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, issuedAt, returnOrigin })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSigningKey()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyGoogleCalendarStateDetails(state: string, now = Date.now()): GoogleCalendarState {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) throw new ApiError('Invalid Google Calendar connection state.', 400);
  const expected = crypto.createHmac('sha256', stateSigningKey()).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new ApiError('Invalid Google Calendar connection state.', 400);
  }
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<GoogleCalendarState>;
  if (!parsed.userId || !parsed.issuedAt || now - parsed.issuedAt > STATE_MAX_AGE_MS) {
    throw new ApiError('Expired Google Calendar connection state.', 400);
  }
  return { userId: parsed.userId, issuedAt: parsed.issuedAt, returnOrigin: parsed.returnOrigin };
}

export function verifyGoogleCalendarState(state: string, now = Date.now()): string {
  return verifyGoogleCalendarStateDetails(state, now).userId;
}

async function readConnection(userId: string): Promise<DbConnection | null> {
  const result = await pool.query<DbConnection>(
    'SELECT * FROM google_calendar_connections WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return result.rows[0] ?? null;
}

async function readCalendars(userId: string, selectedOnly = false): Promise<DbCalendar[]> {
  const result = await pool.query<DbCalendar>(
    `
      SELECT *
      FROM google_calendar_selections
      WHERE user_id = $1
        AND ($2::boolean = FALSE OR selected)
      ORDER BY is_primary DESC, LOWER(summary), calendar_id
    `,
    [userId, selectedOnly]
  );
  return result.rows;
}

async function mapStatus(row: DbConnection | null): Promise<GoogleCalendarStatus> {
  const calendars = row ? await readCalendars(row.user_id, true) : [];
  return {
    configured: isGoogleCalendarConfigured(),
    connected: Boolean(row?.encrypted_refresh_token),
    googleEmail: row?.google_email ?? null,
    calendarId: row?.calendar_id ?? null,
    lastSyncedAt: normalizeDate(row?.last_synced_at ?? null),
    lastError: row?.last_error ?? null,
    syncInProgress: Boolean(row?.sync_in_progress),
    historyMonths: row?.history_months ?? 6,
    selectedCalendarIds: calendars.map((calendar) => calendar.calendar_id),
    setupCompleted: Boolean(row?.setup_completed),
    reauthorizationRequired: false,
  };
}

export async function getGoogleCalendarStatus(userId: string): Promise<GoogleCalendarStatus> {
  return mapStatus(await readConnection(userId));
}

export async function buildGoogleCalendarAuthUrl(userId: string, returnOrigin?: string): Promise<string> {
  assertGoogleCalendarConfigured();
  const connection = await readConnection(userId);
  const needsConsent = !connection?.encrypted_refresh_token;
  const params = new URLSearchParams({
    client_id: config.googleCalendarClientId ?? '',
    redirect_uri: config.googleCalendarRedirectUri,
    response_type: 'code',
    scope: `openid email profile ${OWNED_EVENTS_SCOPE}`,
    access_type: 'offline',
    state: signGoogleCalendarState(userId, Date.now(), returnOrigin),
    prompt: needsConsent ? 'consent select_account' : 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function googleTokenRequest(params: Record<string, string>): Promise<TokenResponse & { access_token: string }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const payload = (await response.json().catch(() => null)) as TokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    throw new ApiError(payload?.error_description ?? payload?.error ?? 'GOOGLE_TOKEN_EXCHANGE_FAILED', 400);
  }
  return payload as TokenResponse & { access_token: string };
}

async function googleJson<TResult>(url: string, accessToken: string, init?: RequestInit): Promise<TResult> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as (TResult & { error?: { message?: string; code?: number } }) | null;
  if (!response.ok) {
    const error = new ApiError(payload?.error?.message ?? 'GOOGLE_CALENDAR_REQUEST_FAILED', response.status);
    (error as ApiError & { googleCode?: number }).googleCode = payload?.error?.code ?? response.status;
    throw error;
  }
  return payload as TResult;
}

async function storeOwnedCalendar(
  userId: string,
  calendar: { id: string; summary: string; timeZone: string; primary: boolean }
) {
  if (calendar.primary) {
    await pool.query(
      `
        UPDATE google_calendar_selections
        SET is_primary = FALSE, updated_at = NOW()
        WHERE user_id = $1 AND calendar_id <> $2
      `,
      [userId, calendar.id]
    );
  }
  await pool.query(
    `
      INSERT INTO google_calendar_selections (
        user_id, calendar_id, summary, time_zone, is_primary, selected, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $5, NOW())
      ON CONFLICT (user_id, calendar_id) DO UPDATE SET
        summary = EXCLUDED.summary,
        time_zone = EXCLUDED.time_zone,
        is_primary = EXCLUDED.is_primary,
        selected = CASE WHEN EXCLUDED.is_primary THEN TRUE ELSE google_calendar_selections.selected END,
        updated_at = NOW()
    `,
    [userId, calendar.id, calendar.summary, calendar.timeZone, calendar.primary]
  );
}

async function ensurePrimaryCalendarSelection(connection: DbConnection) {
  const calendarId = connection.calendar_id || DEFAULT_CALENDAR_ID;
  const existing = (await readCalendars(connection.user_id)).find(
    (calendar) => calendar.calendar_id === calendarId
  );
  if (!existing) {
    await storeOwnedCalendar(connection.user_id, {
      id: calendarId,
      summary: 'Primary calendar',
      timeZone: 'UTC',
      primary: true,
    });
  }
  await pool.query(
    `
      UPDATE google_calendar_selections
      SET is_primary = FALSE, selected = FALSE, updated_at = NOW()
      WHERE user_id = $1 AND calendar_id <> $2
    `,
    [connection.user_id, calendarId]
  );
  await pool.query(
    `
      UPDATE google_calendar_selections
      SET is_primary = TRUE, selected = TRUE, updated_at = NOW()
      WHERE user_id = $1 AND calendar_id = $2
    `,
    [connection.user_id, calendarId]
  );
}

export async function handleGoogleCalendarCallback(code: string, state: string) {
  assertGoogleCalendarConfigured();
  const { userId, returnOrigin } = verifyGoogleCalendarStateDetails(state);
  const existing = await readConnection(userId);
  const token = await googleTokenRequest({
    client_id: config.googleCalendarClientId ?? '',
    client_secret: config.googleCalendarClientSecret ?? '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.googleCalendarRedirectUri,
  });
  if (!token.refresh_token && !existing?.encrypted_refresh_token) {
    throw new ApiError('Google did not return a refresh token. Please try connecting again.', 400);
  }

  const userInfo = await googleJson<GoogleUserInfo>(GOOGLE_USERINFO_URL, token.access_token);
  const primaryCalendarId = DEFAULT_CALENDAR_ID;
  const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000);
  await pool.query(
    `
      INSERT INTO google_calendar_connections (
        user_id, google_sub, google_email, calendar_id, encrypted_access_token,
        encrypted_refresh_token, access_token_expires_at, sync_token, last_error,
        setup_completed, calendar_list_scope_granted, shared_calendar_scope_granted, sync_format_version, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, FALSE, FALSE, FALSE, $8, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        google_sub = EXCLUDED.google_sub,
        google_email = EXCLUDED.google_email,
        calendar_id = EXCLUDED.calendar_id,
        encrypted_access_token = EXCLUDED.encrypted_access_token,
        encrypted_refresh_token = COALESCE(EXCLUDED.encrypted_refresh_token, google_calendar_connections.encrypted_refresh_token),
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        sync_token = NULL,
        last_error = NULL,
        setup_completed = FALSE,
        calendar_list_scope_granted = FALSE,
        shared_calendar_scope_granted = FALSE,
        updated_at = NOW()
    `,
    [
      userId,
      userInfo.sub ?? null,
      userInfo.email ?? null,
      primaryCalendarId,
      encryptGoogleToken(token.access_token),
      token.refresh_token ? encryptGoogleToken(token.refresh_token) : null,
      expiresAt,
      COMPACT_SYNC_FORMAT_VERSION,
    ]
  );
  const savedConnection = await readConnection(userId);
  if (savedConnection) await ensurePrimaryCalendarSelection(savedConnection);
  return { userId, returnOrigin };
}

async function ensureAccessToken(connection: DbConnection): Promise<string> {
  if (connection.encrypted_access_token && connection.access_token_expires_at) {
    const expiresAt = new Date(connection.access_token_expires_at).getTime();
    if (expiresAt - Date.now() > TOKEN_REFRESH_WINDOW_MS) {
      return decryptGoogleToken(connection.encrypted_access_token);
    }
  }
  if (!connection.encrypted_refresh_token) throw new ApiError('Google Calendar needs to be reconnected.', 400);
  const token = await googleTokenRequest({
    client_id: config.googleCalendarClientId ?? '',
    client_secret: config.googleCalendarClientSecret ?? '',
    grant_type: 'refresh_token',
    refresh_token: decryptGoogleToken(connection.encrypted_refresh_token),
  });
  const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000);
  await pool.query(
    `
      UPDATE google_calendar_connections
      SET encrypted_access_token = $2,
          access_token_expires_at = $3,
          encrypted_refresh_token = COALESCE($4, encrypted_refresh_token),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [connection.user_id, encryptGoogleToken(token.access_token), expiresAt, token.refresh_token ? encryptGoogleToken(token.refresh_token) : null]
  );
  return token.access_token;
}

export async function getOwnedGoogleCalendars(userId: string): Promise<GoogleOwnedCalendar[]> {
  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) throw new ApiError('Google Calendar is not connected.', 400);
  await ensurePrimaryCalendarSelection(connection);
  return (await readCalendars(userId)).filter((calendar) => calendar.is_primary).map((calendar) => ({
    id: calendar.calendar_id,
    summary: calendar.summary,
    timeZone: calendar.time_zone,
    backgroundColor: calendar.background_color,
    primary: calendar.is_primary,
    selected: calendar.selected,
  }));
}

export async function updateGoogleCalendarSettings(userId: string, calendarIds: string[], historyMonths: number) {
  if (!HISTORY_PRESETS.has(historyMonths)) throw new ApiError('Choose a supported Google Calendar history range.', 400);
  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) throw new ApiError('Google Calendar is not connected.', 400);
  await ensurePrimaryCalendarSelection(connection);
  const calendars = await readCalendars(userId);
  const primary = calendars.find((calendar) => calendar.is_primary);
  const selected = [...new Set(calendarIds)];
  if (!primary || selected.length !== 1 || selected[0] !== primary.calendar_id) {
    throw new ApiError('Only the primary Google Calendar can be selected.', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        UPDATE google_calendar_selections
        SET selected = calendar_id = ANY($2::text[]),
            sync_token = NULL,
            last_error = NULL,
            updated_at = NOW()
        WHERE user_id = $1
      `,
      [userId, selected]
    );
    await client.query(
      `
        DELETE FROM events
        WHERE user_id = $1
          AND source_provider = $2
          AND google_calendar_id <> ALL($3::text[])
      `,
      [userId, GOOGLE_CALENDAR_SOURCE_PROVIDER, selected]
    );
    await client.query(
      `
        UPDATE google_calendar_connections
        SET history_months = $2,
            setup_completed = TRUE,
            last_error = NULL,
            updated_at = NOW()
        WHERE user_id = $1
      `,
      [userId, historyMonths]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return getGoogleCalendarStatus(userId);
}

function partsInTimeZone(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return match ? { date: match[1], time: match[2] } : { date: value.slice(0, 10), time: null };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

export function googleEventToLocalFields(event: GoogleCalendarEvent, fallbackTimeZone = 'UTC'): LocalGoogleEventFields | null {
  if (!event.start?.date && !event.start?.dateTime) return null;
  const timeZone = event.start.timeZone ?? event.end?.timeZone ?? fallbackTimeZone;
  const googleUpdatedAt = event.updated ? new Date(event.updated).toISOString() : null;
  if (event.start.date) {
    const inclusiveEndDate = event.end?.date
      ? addDays(event.end.date, -1)
      : event.start.date;
    return {
      title: event.summary?.trim() || 'Untitled event',
      date: event.start.date,
      endDate: inclusiveEndDate > event.start.date ? inclusiveEndDate : null,
      time: null,
      endTime: null,
      timeZone,
      description: event.description?.trim() || null,
      googleUpdatedAt,
      googleEtag: event.etag ?? null,
    };
  }
  const start = partsInTimeZone(event.start.dateTime ?? '', timeZone);
  const end = event.end?.dateTime ? partsInTimeZone(event.end.dateTime, event.end.timeZone ?? timeZone) : null;
  return {
    title: event.summary?.trim() || 'Untitled event',
    date: start.date,
    endDate: end?.date && end.date > start.date ? end.date : null,
    time: start.time,
    endTime: end?.time ?? null,
    timeZone,
    description: event.description?.trim() || null,
    googleUpdatedAt,
    googleEtag: event.etag ?? null,
  };
}

function originalStartKey(event: GoogleCalendarEvent, fallbackTimeZone: string): string | null {
  const original = event.originalStartTime;
  if (!original) return null;
  if (original.date) return original.date;
  if (!original.dateTime) return null;
  const timeZone = original.timeZone ?? event.start?.timeZone ?? fallbackTimeZone;
  const parts = partsInTimeZone(original.dateTime, timeZone);
  return recurrenceKey(parts.date, parts.time);
}

function eventEndForGoogle(row: Pick<DbEvent, 'event_date' | 'end_date' | 'event_time' | 'end_time'>) {
  const startDate = normalizeDateOnly(row.event_date);
  const explicitEndDate = row.end_date ? normalizeDateOnly(row.end_date) : null;
  const startTime = normalizeTime(row.event_time);
  const explicitEnd = normalizeTime(row.end_time);
  if (!startTime) return { date: addDays(explicitEndDate ?? startDate, 1) };
  if (explicitEnd) {
    const endDate = explicitEndDate ?? (explicitEnd <= startTime ? addDays(startDate, 1) : startDate);
    return { dateTime: `${endDate}T${explicitEnd}:00` };
  }
  const [hour, minute] = startTime.split(':').map(Number);
  const endMinutes = hour * 60 + minute + DEFAULT_EVENT_DURATION_MINUTES;
  const endDate = endMinutes >= 24 * 60 ? addDays(startDate, 1) : startDate;
  const normalized = endMinutes % (24 * 60);
  return {
    dateTime: `${endDate}T${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}:00`,
  };
}

export function localEventToGooglePayload(
  row: Pick<DbEvent, 'title' | 'event_date' | 'end_date' | 'event_time' | 'end_time' | 'event_timezone' | 'description'>
) {
  const date = normalizeDateOnly(row.event_date);
  const startTime = normalizeTime(row.event_time);
  const timeZone = row.event_timezone || 'UTC';
  const end = eventEndForGoogle(row);
  if (!startTime) {
    return { summary: row.title, description: row.description ?? undefined, start: { date }, end };
  }
  return {
    summary: row.title,
    description: row.description ?? undefined,
    start: { dateTime: `${date}T${startTime}:00`, timeZone },
    end: 'dateTime' in end ? { ...end, timeZone } : end,
  };
}

const eventSelectColumns = `
  id::text, title, event_date::text AS event_date, event_time::text AS event_time,
  end_date::text AS end_date, end_time::text AS end_time,
  COALESCE(NULLIF(event_timezone, ''), 'UTC') AS event_timezone,
  description, source_provider, source_key, google_calendar_id, google_event_id,
  google_etag, google_updated_at, google_recurrence, google_recurring_event_id,
  google_original_start, google_cancelled, updated_at, course_id, academic_kind
`;

export function courseCodeFromCalendarTitle(title: string): string | null {
  return title.toUpperCase().match(/\b([A-Z]{2,}\d{4,}[A-Z0-9]*)\b/)?.[1] ?? null;
}

async function ucdClassCourse(
  client: Queryable,
  userId: string,
  calendarSummary: string | undefined,
  title: string
): Promise<string | null> {
  if (calendarSummary?.trim().toLowerCase() !== 'ucd timetable') return null;
  const code = courseCodeFromCalendarTitle(title);
  if (!code) return null;
  const inferredName = title
    .replace(new RegExp(`\\b${code}\\b`, 'i'), '')
    .replace(/^[\s:|\-–—]+|[\s:|\-–—]+$/g, '')
    .trim() || code;
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO courses (code, name, color, user_id)
      VALUES ($2, $3, 'course-diamond', $1)
      ON CONFLICT (user_id, code) WHERE user_id IS NOT NULL
      DO UPDATE SET name = CASE WHEN courses.name = courses.code THEN EXCLUDED.name ELSE courses.name END
      RETURNING id::text;
    `,
    [userId, code, inferredName]
  );
  await client.query(
    `
      INSERT INTO launch_onboarding (user_id, first_course_at)
      VALUES ($1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        first_course_at = COALESCE(launch_onboarding.first_course_at, NOW()), updated_at = NOW();
    `,
    [userId]
  );
  return result.rows[0]?.id ?? null;
}

async function findEventByGoogleId(
  client: Queryable,
  userId: string,
  calendarId: string,
  googleEventId: string
): Promise<DbEvent | null> {
  const result = await client.query<DbEvent>(
    `
      SELECT ${eventSelectColumns}
      FROM events
      WHERE user_id = $1 AND google_calendar_id = $2 AND google_event_id = $3
      LIMIT 1
    `,
    [userId, calendarId, googleEventId]
  );
  return result.rows[0] ?? null;
}

async function setConnectionError(userId: string, err: unknown) {
  const message = err instanceof Error ? err.message : 'Google Calendar sync failed.';
  await pool.query(
    `
      UPDATE google_calendar_connections
      SET last_error = $2, sync_in_progress = FALSE, updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId, message]
  );
}

async function applyGoogleEvent(
  client: Queryable,
  userId: string,
  calendar: Pick<DbCalendar, 'calendar_id' | 'time_zone'> & Partial<Pick<DbCalendar, 'summary'>>,
  event: GoogleCalendarEvent
) {
  const existing = await findEventByGoogleId(client, userId, calendar.calendar_id, event.id);
  const isRecurringException = Boolean(event.recurringEventId);

  if (event.status === 'cancelled' && !isRecurringException) {
    if (existing?.source_provider === GOOGLE_CALENDAR_SOURCE_PROVIDER) {
      await client.query('DELETE FROM events WHERE id = $1::bigint AND user_id = $2', [existing.id, userId]);
    } else if (existing) {
      await client.query(
        `
          UPDATE events
          SET google_calendar_id = NULL, google_event_id = NULL, google_etag = NULL,
              google_updated_at = NULL, google_recurrence = NULL
          WHERE id = $1::bigint AND user_id = $2
        `,
        [existing.id, userId]
      );
    }
    await client.query(
      `
        DELETE FROM events
        WHERE user_id = $1 AND google_calendar_id = $2
          AND google_recurring_event_id = $3
          AND source_provider = $4
      `,
      [userId, calendar.calendar_id, event.id, GOOGLE_CALENDAR_SOURCE_PROVIDER]
    );
    return 'deleted' as const;
  }

  const originalKey = originalStartKey(event, calendar.time_zone);
  let fields = googleEventToLocalFields(event, calendar.time_zone);
  if (!fields && event.status === 'cancelled' && originalKey) {
    const [date, time] = originalKey.split('T');
    fields = {
      title: 'Cancelled recurring occurrence',
      date,
      endDate: null,
      time: time ?? null,
      endTime: null,
      timeZone: event.originalStartTime?.timeZone ?? calendar.time_zone,
      description: null,
      googleUpdatedAt: event.updated ? new Date(event.updated).toISOString() : null,
      googleEtag: event.etag ?? null,
    };
  }
  if (!fields) return 'updated' as const;

  let courseId = existing?.course_id ? String(existing.course_id) : null;
  let academicKind = existing?.academic_kind ?? null;
  if (calendar.summary !== undefined) {
    courseId = await ucdClassCourse(client, userId, calendar.summary, fields.title);
    academicKind = courseId ? 'class' : null;
  }

  const sourceKey = `${calendar.calendar_id}:${event.id}`;
  if (!existing) {
    await client.query(
      `
        INSERT INTO events (
          title, event_date, end_date, event_time, end_time, event_timezone, description, user_id,
          source_provider, source_key, google_calendar_id, google_event_id, google_etag,
          google_updated_at, google_recurrence, google_recurring_event_id,
          google_original_start, google_cancelled, updated_at, course_id, academic_kind
        )
        VALUES (
          $1, $2::date, $3::date, $4::time, $5::time, $6, $7, $8, $9, $10, $11, $12, $13,
          $14::timestamptz, $15::text[], $16, $17, $18, COALESCE($14::timestamptz, NOW()),
          $19::bigint, $20
        )
        ON CONFLICT (user_id, source_provider, source_key)
          WHERE user_id IS NOT NULL AND source_provider IS NOT NULL AND source_key IS NOT NULL
        DO UPDATE SET
          title = EXCLUDED.title, event_date = EXCLUDED.event_date, end_date = EXCLUDED.end_date,
          event_time = EXCLUDED.event_time,
          end_time = EXCLUDED.end_time, event_timezone = EXCLUDED.event_timezone,
          description = EXCLUDED.description, google_calendar_id = EXCLUDED.google_calendar_id,
          google_event_id = EXCLUDED.google_event_id, google_etag = EXCLUDED.google_etag,
          google_updated_at = EXCLUDED.google_updated_at, google_recurrence = EXCLUDED.google_recurrence,
          google_recurring_event_id = EXCLUDED.google_recurring_event_id,
          google_original_start = EXCLUDED.google_original_start,
          google_cancelled = EXCLUDED.google_cancelled, course_id = EXCLUDED.course_id,
          academic_kind = EXCLUDED.academic_kind, updated_at = EXCLUDED.updated_at
      `,
      [
        fields.title, fields.date, fields.endDate, fields.time, fields.endTime, fields.timeZone, fields.description,
        userId, GOOGLE_CALENDAR_SOURCE_PROVIDER, sourceKey, calendar.calendar_id, event.id,
        fields.googleEtag, fields.googleUpdatedAt, event.recurrence ?? null,
        event.recurringEventId ?? null, originalKey, event.status === 'cancelled', courseId, academicKind,
      ]
    );
    return 'imported' as const;
  }

  const previousGoogleUpdated = existing.google_updated_at ? new Date(existing.google_updated_at).getTime() : 0;
  const localUpdated = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
  const incomingGoogleUpdated = fields.googleUpdatedAt ? new Date(fields.googleUpdatedAt).getTime() : Date.now();
  if (existing.source_provider !== GOOGLE_CALENDAR_SOURCE_PROVIDER && previousGoogleUpdated > 0 && localUpdated > previousGoogleUpdated + 1000 && localUpdated > incomingGoogleUpdated) {
    return 'push_local' as const;
  }

  await client.query(
    `
      UPDATE events
      SET title = $1, event_date = $2::date, end_date = $3::date,
          event_time = $4::time, end_time = $5::time,
          event_timezone = $6, description = $7, google_etag = $8,
          google_updated_at = $9::timestamptz, google_recurrence = $10::text[],
          google_recurring_event_id = $11, google_original_start = $12,
          google_cancelled = $13, course_id = $14::bigint, academic_kind = $15,
          updated_at = COALESCE($9::timestamptz, updated_at)
      WHERE id = $16::bigint AND user_id = $17
    `,
    [
      fields.title, fields.date, fields.endDate, fields.time, fields.endTime, fields.timeZone, fields.description,
      fields.googleEtag, fields.googleUpdatedAt, event.recurrence ?? null,
      event.recurringEventId ?? null, originalKey, event.status === 'cancelled', courseId, academicKind,
      existing.id, userId,
    ]
  );
  return 'updated' as const;
}

async function localEventById(userId: string, eventId: string): Promise<DbEvent | null> {
  if (!/^\d+$/.test(eventId)) return null;
  const result = await pool.query<DbEvent>(
    `SELECT ${eventSelectColumns} FROM events WHERE id = $1::bigint AND user_id = $2 LIMIT 1`,
    [eventId, userId]
  );
  return result.rows[0] ?? null;
}

async function updateLocalGoogleMetadata(userId: string, eventId: string, calendarId: string, googleEvent: GoogleCalendarEvent) {
  await pool.query(
    `
      UPDATE events
      SET google_calendar_id = $3, google_event_id = $4, google_etag = $5,
          google_updated_at = $6::timestamptz, google_recurrence = $7::text[],
          google_recurring_event_id = $8, google_original_start = $9,
          google_cancelled = FALSE
      WHERE id = $1::bigint AND user_id = $2
    `,
    [
      eventId, userId, calendarId, googleEvent.id, googleEvent.etag ?? null,
      googleEvent.updated ?? null, googleEvent.recurrence ?? null,
      googleEvent.recurringEventId ?? null, originalStartKey(googleEvent, 'UTC'),
    ]
  );
}

export async function pushLocalEventToGoogle(
  userId: string,
  eventId: string,
  accessToken?: string,
  calendarId?: string
): Promise<boolean> {
  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) return false;
  const row = await localEventById(userId, eventId);
  if (!row) return false;
  const token = accessToken ?? await ensureAccessToken(connection);
  const targetCalendarId = calendarId ?? row.google_calendar_id ?? connection.calendar_id ?? DEFAULT_CALENDAR_ID;
  const encodedCalendarId = encodeURIComponent(targetCalendarId);
  const payload = localEventToGooglePayload(row);
  const googleEvent = row.google_event_id
    ? await googleJson<GoogleCalendarEvent>(
        `${GOOGLE_CALENDAR_API_URL}/calendars/${encodedCalendarId}/events/${encodeURIComponent(row.google_event_id)}`,
        token,
        { method: 'PATCH', body: JSON.stringify(payload) }
      )
    : await googleJson<GoogleCalendarEvent>(
        `${GOOGLE_CALENDAR_API_URL}/calendars/${encodedCalendarId}/events`,
        token,
        { method: 'POST', body: JSON.stringify(payload) }
      );
  await updateLocalGoogleMetadata(userId, eventId, targetCalendarId, googleEvent);
  return true;
}

export async function deleteGoogleEventForLocalEvent(
  userId: string,
  row: Pick<DbEvent, 'google_event_id' | 'google_calendar_id'> | null
): Promise<boolean> {
  if (!row?.google_event_id) return false;
  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) return false;
  const token = await ensureAccessToken(connection);
  const calendarId = row.google_calendar_id ?? connection.calendar_id ?? DEFAULT_CALENDAR_ID;
  const response = await fetch(
    `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(row.google_event_id)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(payload?.error?.message ?? 'GOOGLE_CALENDAR_DELETE_FAILED', response.status);
  }
  return true;
}

async function listGoogleEvents(
  calendar: DbCalendar,
  accessToken: string,
  historyMonths: number,
  fullSync: boolean
): Promise<{
  events: GoogleCalendarEvent[];
  nextSyncToken: string | null;
  summary: string | null;
  timeZone: string | null;
}> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;
  let summary: string | null = null;
  let timeZone: string | null = null;
  do {
    const params = new URLSearchParams({ singleEvents: 'false', showDeleted: 'true', maxResults: '2500' });
    if (pageToken) params.set('pageToken', pageToken);
    if (fullSync || !calendar.sync_token) {
      const now = new Date();
      params.set('timeMin', addMonths(now, -historyMonths).toISOString());
      params.set('timeMax', addYears(now, 2).toISOString());
    } else {
      params.set('syncToken', calendar.sync_token);
    }
    const payload = await googleJson<GoogleEventsListResponse>(
      `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendar.calendar_id)}/events?${params.toString()}`,
      accessToken
    );
    events.push(...(payload.items ?? []));
    summary = payload.summary?.trim() || summary;
    timeZone = payload.timeZone || timeZone;
    pageToken = payload.nextPageToken ?? null;
    nextSyncToken = payload.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  return { events, nextSyncToken, summary, timeZone };
}

export type GoogleCalendarPreviewItem = {
  calendarId: string;
  calendarSummary: string;
  title: string;
  date: string;
  time: string | null;
  recurring: boolean;
  inferredCourseCode: string | null;
};

export async function previewGoogleCalendarImport(
  userId: string,
  calendarIds: string[],
  historyMonths: number
): Promise<{ items: GoogleCalendarPreviewItem[]; reviewedCount: number }>
{
  if (!HISTORY_PRESETS.has(historyMonths)) throw new ApiError('Choose a supported Google Calendar history range.', 400);
  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) throw new ApiError('Google Calendar is not connected.', 400);
  await ensurePrimaryCalendarSelection(connection);
  const calendars = await readCalendars(userId);
  const requested = new Set(calendarIds);
  const selected = calendars.filter((calendar) => calendar.is_primary && requested.has(calendar.calendar_id));
  if (selected.length !== requested.size || selected.length === 0) {
    throw new ApiError('Choose the primary Google Calendar.', 400);
  }
  const token = await ensureAccessToken(connection);
  const items: GoogleCalendarPreviewItem[] = [];
  let reviewedCount = 0;
  for (const calendar of selected) {
    const listed = await listGoogleEvents({ ...calendar, sync_token: null }, token, historyMonths, true);
    const calendarDetails = {
      ...calendar,
      summary: listed.summary ?? calendar.summary,
      time_zone: listed.timeZone ?? calendar.time_zone,
    };
    const visible = listed.events.filter((event) => event.status !== 'cancelled');
    reviewedCount += visible.length;
    for (const event of visible) {
      const fields = googleEventToLocalFields(event, calendarDetails.time_zone);
      if (!fields) continue;
      items.push({
        calendarId: calendar.calendar_id,
        calendarSummary: calendarDetails.summary,
        title: fields.title,
        date: fields.date,
        time: fields.time,
        recurring: Boolean(event.recurrence?.length || event.recurringEventId),
        inferredCourseCode: calendarDetails.summary.trim().toLowerCase() === 'ucd timetable'
          ? courseCodeFromCalendarTitle(fields.title)
          : null,
      });
    }
  }
  items.sort((a, b) => `${a.date} ${a.time ?? ''} ${a.title}`.localeCompare(`${b.date} ${b.time ?? ''} ${b.title}`));
  return { items: items.slice(0, 50), reviewedCount };
}

async function pushUnsyncedLocalEvents(userId: string, accessToken: string, calendarId: string): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `
      SELECT id::text
      FROM events
      WHERE user_id = $1 AND google_event_id IS NULL
        AND COALESCE(source_provider, '') <> $2
      ORDER BY event_date, event_time NULLS LAST, id
    `,
    [userId, GOOGLE_CALENDAR_SOURCE_PROVIDER]
  );
  let pushed = 0;
  for (const row of result.rows) {
    if (await pushLocalEventToGoogle(userId, row.id, accessToken, calendarId)) pushed += 1;
  }
  return pushed;
}

export async function runGoogleCalendarSync(
  userId: string,
  options: { forceFull?: boolean } = {}
): Promise<GoogleSyncResult> {
  assertGoogleCalendarConfigured();
  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) throw new ApiError('Google Calendar is not connected.', 400);
  if (!connection.setup_completed) throw new ApiError('Choose calendars and save import settings first.', 400);
  await ensurePrimaryCalendarSelection(connection);
  const calendars = (await readCalendars(userId, true)).filter((calendar) => calendar.is_primary);
  if (!calendars.some((calendar) => calendar.is_primary)) {
    throw new ApiError('The primary Google Calendar must remain selected.', 400);
  }

  const run = await pool.query<{ id: string }>(
    `INSERT INTO google_calendar_sync_runs (user_id, status) VALUES ($1, 'running') RETURNING id::text`,
    [userId]
  );
  const runId = run.rows[0]?.id;
  await pool.query(
    'UPDATE google_calendar_connections SET sync_in_progress = TRUE, last_error = NULL WHERE user_id = $1',
    [userId]
  );
  const result: GoogleSyncResult = {
    importedCount: 0, updatedCount: 0, deletedCount: 0, pushedCount: 0,
    fullSync: Boolean(options.forceFull || connection.sync_format_version < COMPACT_SYNC_FORMAT_VERSION),
  };

  try {
    const accessToken = await ensureAccessToken(connection);
    const listedCalendars: Array<{
      calendar: DbCalendar;
      events: GoogleCalendarEvent[];
      nextSyncToken: string | null;
      full: boolean;
    }> = [];
    for (const calendar of calendars) {
      let full = Boolean(result.fullSync || !calendar.sync_token);
      if (full) result.fullSync = true;
      let listed;
      try {
        listed = await listGoogleEvents(calendar, accessToken, connection.history_months, full);
      } catch (err) {
        const googleCode = (err as ApiError & { googleCode?: number }).googleCode;
        if ((err as ApiError).status !== 410 && googleCode !== 410) throw err;
        listed = await listGoogleEvents({ ...calendar, sync_token: null }, accessToken, connection.history_months, true);
        full = true;
        result.fullSync = true;
      }
      listedCalendars.push({
        calendar: {
          ...calendar,
          summary: listed.summary ?? calendar.summary,
          time_zone: listed.timeZone ?? calendar.time_zone,
        },
        ...listed,
        full,
      });
    }

    const pushLocalIds: Array<{ id: string; calendarId: string }> = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const listed of listedCalendars) {
        if (listed.full) {
          await client.query(
            `
              DELETE FROM events
              WHERE user_id = $1 AND google_calendar_id = $2 AND source_provider = $3
            `,
            [userId, listed.calendar.calendar_id, GOOGLE_CALENDAR_SOURCE_PROVIDER]
          );
        }
        const masters = listed.events.filter((event) => !event.recurringEventId);
        const exceptions = listed.events.filter((event) => event.recurringEventId);
        for (const googleEvent of [...masters, ...exceptions]) {
          const action = await applyGoogleEvent(client, userId, listed.calendar, googleEvent);
          if (action === 'imported') result.importedCount += 1;
          if (action === 'updated') result.updatedCount += 1;
          if (action === 'deleted') result.deletedCount += 1;
          if (action === 'push_local') {
            const row = await findEventByGoogleId(client, userId, listed.calendar.calendar_id, googleEvent.id);
            if (row) pushLocalIds.push({ id: String(row.id), calendarId: listed.calendar.calendar_id });
          }
        }
        await client.query(
          `
            UPDATE google_calendar_selections
            SET sync_token = COALESCE($3, sync_token), last_synced_at = NOW(),
                summary = $4, time_zone = $5,
                last_error = NULL, updated_at = NOW()
            WHERE user_id = $1 AND calendar_id = $2
          `,
          [
            userId,
            listed.calendar.calendar_id,
            listed.nextSyncToken,
            listed.calendar.summary,
            listed.calendar.time_zone,
          ]
        );
      }
      await client.query(
        `
          UPDATE google_calendar_connections
          SET sync_format_version = $2, last_synced_at = NOW(), last_error = NULL,
              sync_in_progress = FALSE, updated_at = NOW()
          WHERE user_id = $1
        `,
        [userId, COMPACT_SYNC_FORMAT_VERSION]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    for (const local of pushLocalIds) {
      if (await pushLocalEventToGoogle(userId, local.id, accessToken, local.calendarId)) result.pushedCount += 1;
    }
    result.pushedCount += await pushUnsyncedLocalEvents(userId, accessToken, connection.calendar_id);
    if (runId) {
      await pool.query(
        `
          UPDATE google_calendar_sync_runs
          SET status = 'success', finished_at = NOW(), imported_count = $2,
              updated_count = $3, deleted_count = $4, pushed_count = $5
          WHERE id = $1::bigint
        `,
        [runId, result.importedCount, result.updatedCount, result.deletedCount, result.pushedCount]
      );
    }
    await syncNotificationInstancesForUser(userId);
    return result;
  } catch (err) {
    await setConnectionError(userId, err);
    if (runId) {
      await pool.query(
        `UPDATE google_calendar_sync_runs SET status = 'error', finished_at = NOW(), error = $2 WHERE id = $1::bigint`,
        [runId, err instanceof Error ? err.message : 'Google Calendar sync failed.']
      );
    }
    throw err;
  }
}

function assertDateRangeValue(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(`Invalid ${label} date.`, 400);
  return value;
}

export async function loadEventsForUser(userId: string, from?: string, to?: string) {
  const connection = await readConnection(userId);
  const now = new Date();
  const defaultFrom = addMonths(now, -(connection?.history_months ?? 6)).toISOString().slice(0, 10);
  const defaultTo = addYears(now, 2).toISOString().slice(0, 10);
  const fromDate = assertDateRangeValue(from ?? defaultFrom, 'start');
  const toDate = assertDateRangeValue(to ?? defaultTo, 'end');
  if (fromDate >= toDate) throw new ApiError('Event range end must be after its start.', 400);
  const result = await pool.query<DbEvent>(
    `SELECT ${eventSelectColumns} FROM events WHERE user_id = $1 ORDER BY event_date, event_time NULLS LAST`,
    [userId]
  );
  return expandRecurringEventRows(result.rows, fromDate, toDate);
}

async function recurringMaster(userId: string, seriesId: string): Promise<DbEvent> {
  const row = await localEventById(userId, seriesId);
  if (!row?.google_event_id || !row.google_calendar_id || !(row.google_recurrence?.length)) {
    throw new ApiError('Recurring Google Calendar series was not found.', 404);
  }
  return row;
}

function instanceOriginalKey(event: GoogleCalendarEvent, timeZone: string): string | null {
  return originalStartKey(event, timeZone);
}

async function resolveGoogleInstance(
  token: string,
  master: DbEvent,
  originalStart: string
): Promise<GoogleCalendarEvent> {
  const date = originalStart.slice(0, 10);
  const params = new URLSearchParams({
    showDeleted: 'true',
    maxResults: '250',
    timeMin: `${addDays(date, -2)}T00:00:00Z`,
    timeMax: `${addDays(date, 3)}T00:00:00Z`,
  });
  const payload = await googleJson<GoogleEventsListResponse>(
    `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(master.google_calendar_id as string)}/events/${encodeURIComponent(master.google_event_id as string)}/instances?${params.toString()}`,
    token
  );
  const instance = (payload.items ?? []).find(
    (candidate) => instanceOriginalKey(candidate, master.event_timezone || 'UTC') === originalStart
  );
  if (!instance) throw new ApiError('The selected recurring occurrence no longer exists in Google Calendar.', 404);
  return instance;
}

export async function mutateRecurringGoogleOccurrence(
  userId: string,
  action: 'update' | 'delete',
  input: RecurringOccurrenceMutation
) {
  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) throw new ApiError('Google Calendar is not connected.', 400);
  const master = await recurringMaster(userId, input.recurringSeriesId);
  const token = await ensureAccessToken(connection);
  const instance = await resolveGoogleInstance(token, master, input.recurrenceOriginalStart);
  const calendar: Pick<DbCalendar, 'calendar_id' | 'time_zone'> = {
    calendar_id: master.google_calendar_id as string,
    time_zone: master.event_timezone || 'UTC',
  };

  if (action === 'delete') {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendar.calendar_id)}/events/${encodeURIComponent(instance.id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new ApiError('Unable to delete the recurring Google Calendar occurrence.', response.status);
    }
    await applyGoogleEvent(pool, userId, calendar, {
      ...instance,
      status: 'cancelled',
      recurringEventId: master.google_event_id as string,
    });
    await syncNotificationInstancesForUser(userId);
    return [];
  }

  if (!input.title || !input.date) throw new ApiError('Recurring occurrence title and date are required.', 400);
  if (input.endDate && input.endDate < input.date) {
    throw new ApiError('End date cannot be before start date.', 400);
  }
  if (!input.time && input.endTime) {
    throw new ApiError('Start time is required when an end time is set.', 400);
  }
  if (input.time && input.endDate && !input.endTime) {
    throw new ApiError('End time is required for a timed multi-day event.', 400);
  }
  if (input.time && input.endTime && !input.endDate && input.endTime <= input.time) {
    throw new ApiError('End time must be after start time, or choose a later end date.', 400);
  }
  const payload = localEventToGooglePayload({
    title: input.title,
    event_date: input.date,
    end_date: input.endDate ?? null,
    event_time: input.time ?? null,
    end_time: input.endTime ?? null,
    event_timezone: input.timeZone ?? master.event_timezone ?? 'UTC',
    description: input.description ?? null,
  });
  const updated = await googleJson<GoogleCalendarEvent>(
    `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendar.calendar_id)}/events/${encodeURIComponent(instance.id)}`,
    token,
    { method: 'PATCH', body: JSON.stringify(payload) }
  );
  await applyGoogleEvent(pool, userId, calendar, updated);
  if (input.courseId !== undefined) {
    await pool.query(
      `
        UPDATE events
        SET course_id = (SELECT id FROM courses WHERE id = NULLIF($4, '')::bigint AND user_id = $1),
            academic_kind = CASE WHEN NULLIF($4, '') IS NOT NULL AND $5 = 'class' THEN 'class' ELSE NULL END
        WHERE user_id = $1 AND google_calendar_id = $2 AND google_event_id = $3;
      `,
      [userId, calendar.calendar_id, updated.id, input.courseId, input.academicKind ?? null]
    );
  }
  await syncNotificationInstancesForUser(userId);
  return [];
}

export async function disconnectGoogleCalendar(userId: string) {
  await pool.query(
    `DELETE FROM events WHERE user_id = $1 AND source_provider = $2`,
    [userId, GOOGLE_CALENDAR_SOURCE_PROVIDER]
  );
  await pool.query('DELETE FROM google_calendar_connections WHERE user_id = $1', [userId]);
  await pool.query(
    `
      UPDATE events
      SET google_calendar_id = NULL, google_event_id = NULL, google_etag = NULL,
          google_updated_at = NULL, google_recurrence = NULL,
          google_recurring_event_id = NULL, google_original_start = NULL,
          google_cancelled = FALSE
      WHERE user_id = $1
    `,
    [userId]
  );
}

export async function readEventBeforeDelete(userId: string, eventId: string): Promise<DbEvent | null> {
  return localEventById(userId, eventId);
}

export async function syncEventMutationToGoogle(
  userId: string,
  actionName: string,
  rows: unknown[],
  beforeDelete?: DbEvent | null
) {
  try {
    if (actionName === 'createEvent' || actionName === 'updateEvent') {
      const first = rows[0] as { id?: string | number } | undefined;
      if (first?.id) await pushLocalEventToGoogle(userId, String(first.id));
    } else if (actionName === 'deleteEvent') {
      await deleteGoogleEventForLocalEvent(userId, beforeDelete ?? null);
    }
  } catch (err) {
    await setConnectionError(userId, err);
  }
}
