import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from './config';
import { pool } from './db';
import { ApiError } from './errors';
import { syncNotificationInstancesForUser } from './notifications';

export const GOOGLE_CALENDAR_SOURCE_PROVIDER = 'google_calendar';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_CALENDAR_ID = 'primary';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_WINDOW_MS = 60 * 1000;
const DEFAULT_EVENT_DURATION_MINUTES = 60;

type Queryable = Pick<PoolClient, 'query'>;

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  calendarId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  syncInProgress: boolean;
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

export type GoogleCalendarEvent = {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  updated?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
};

type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  error?: {
    code?: number;
    message?: string;
  };
};

type GoogleCalendarResponse = {
  timeZone?: string;
};

type DbConnection = {
  user_id: string;
  google_email: string | null;
  calendar_id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string | Date | null;
  sync_token: string | null;
  last_synced_at: string | Date | null;
  last_error: string | null;
  sync_in_progress: boolean;
};

type DbEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  end_time: string | null;
  event_timezone: string | null;
  description: string | null;
  source_provider: string | null;
  source_key: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
  google_etag: string | null;
  google_updated_at: string | Date | null;
  updated_at: string | Date | null;
};

export type LocalGoogleEventFields = {
  title: string;
  date: string;
  time: string | null;
  endTime: string | null;
  timeZone: string;
  description: string | null;
  googleUpdatedAt: string | null;
  googleEtag: string | null;
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
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeDateOnly(value: string): string {
  return value.split('T')[0];
}

function normalizeTime(value?: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function encryptionKey(): Buffer {
  const raw = config.googleTokenEncryptionKey;
  if (!raw) {
    throw new ApiError('GOOGLE_TOKEN_ENCRYPTION_KEY is required', 500);
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const base64 = Buffer.from(raw, 'base64');
  if (base64.length === 32) {
    return base64;
  }

  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptGoogleToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
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

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function stateSigningKey(): Buffer {
  const source = config.googleTokenEncryptionKey ?? config.googleCalendarClientSecret;
  if (!source) {
    throw new ApiError('Google Calendar OAuth state signing is not configured.', 500);
  }
  return crypto.createHash('sha256').update(source).digest();
}

export function signGoogleCalendarState(userId: string, issuedAt = Date.now()): string {
  const payload = base64UrlEncode(JSON.stringify({ userId, issuedAt }));
  const signature = crypto.createHmac('sha256', stateSigningKey()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyGoogleCalendarState(state: string, now = Date.now()): string {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) {
    throw new ApiError('Invalid Google Calendar connection state.', 400);
  }

  const expected = crypto.createHmac('sha256', stateSigningKey()).update(payload).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new ApiError('Invalid Google Calendar connection state.', 400);
  }

  const parsed = JSON.parse(base64UrlDecode(payload).toString('utf8')) as { userId?: string; issuedAt?: number };
  if (!parsed.userId || !parsed.issuedAt || now - parsed.issuedAt > STATE_MAX_AGE_MS) {
    throw new ApiError('Expired Google Calendar connection state.', 400);
  }

  return parsed.userId;
}

async function readConnection(userId: string): Promise<DbConnection | null> {
  const result = await pool.query<DbConnection>(
    `
      SELECT *
      FROM google_calendar_connections
      WHERE user_id = $1
      LIMIT 1;
    `,
    [userId]
  );
  return result.rows[0] ?? null;
}

function mapStatus(row: DbConnection | null): GoogleCalendarStatus {
  return {
    configured: isGoogleCalendarConfigured(),
    connected: Boolean(row?.encrypted_refresh_token),
    googleEmail: row?.google_email ?? null,
    calendarId: row?.calendar_id ?? null,
    lastSyncedAt: normalizeDate(row?.last_synced_at ?? null),
    lastError: row?.last_error ?? null,
    syncInProgress: Boolean(row?.sync_in_progress),
  };
}

export async function getGoogleCalendarStatus(userId: string): Promise<GoogleCalendarStatus> {
  return mapStatus(await readConnection(userId));
}

export async function buildGoogleCalendarAuthUrl(userId: string): Promise<string> {
  assertGoogleCalendarConfigured();
  const connection = await readConnection(userId);
  const needsConsent = !connection?.encrypted_refresh_token;
  const params = new URLSearchParams({
    client_id: config.googleCalendarClientId ?? '',
    redirect_uri: config.googleCalendarRedirectUri,
    response_type: 'code',
    scope: `openid email profile ${CALENDAR_SCOPE}`,
    access_type: 'offline',
    include_granted_scopes: 'true',
    state: signGoogleCalendarState(userId),
  });

  if (needsConsent) {
    params.set('prompt', 'consent select_account');
  } else {
    params.set('prompt', 'select_account');
  }

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

export async function handleGoogleCalendarCallback(code: string, state: string) {
  assertGoogleCalendarConfigured();
  const userId = verifyGoogleCalendarState(state);
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
  const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000);
  await pool.query(
    `
      INSERT INTO google_calendar_connections (
        user_id,
        google_sub,
        google_email,
        calendar_id,
        encrypted_access_token,
        encrypted_refresh_token,
        access_token_expires_at,
        sync_token,
        last_error,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        google_sub = EXCLUDED.google_sub,
        google_email = EXCLUDED.google_email,
        calendar_id = EXCLUDED.calendar_id,
        encrypted_access_token = EXCLUDED.encrypted_access_token,
        encrypted_refresh_token = COALESCE(EXCLUDED.encrypted_refresh_token, google_calendar_connections.encrypted_refresh_token),
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        sync_token = NULL,
        last_error = NULL,
        updated_at = NOW();
    `,
    [
      userId,
      userInfo.sub ?? null,
      userInfo.email ?? null,
      DEFAULT_CALENDAR_ID,
      encryptGoogleToken(token.access_token),
      token.refresh_token ? encryptGoogleToken(token.refresh_token) : null,
      expiresAt,
    ]
  );

  return { userId };
}

async function ensureAccessToken(connection: DbConnection): Promise<string> {
  if (connection.encrypted_access_token && connection.access_token_expires_at) {
    const expiresAt = new Date(connection.access_token_expires_at).getTime();
    if (expiresAt - Date.now() > TOKEN_REFRESH_WINDOW_MS) {
      return decryptGoogleToken(connection.encrypted_access_token);
    }
  }

  if (!connection.encrypted_refresh_token) {
    throw new ApiError('Google Calendar needs to be reconnected.', 400);
  }

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
      WHERE user_id = $1;
    `,
    [connection.user_id, encryptGoogleToken(token.access_token), expiresAt, token.refresh_token ? encryptGoogleToken(token.refresh_token) : null]
  );

  return token.access_token;
}

async function calendarTimeZone(accessToken: string, calendarId: string): Promise<string> {
  try {
    const encodedCalendarId = encodeURIComponent(calendarId);
    const calendar = await googleJson<GoogleCalendarResponse>(`${GOOGLE_CALENDAR_API_URL}/calendars/${encodedCalendarId}`, accessToken);
    return calendar.timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
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
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

export function googleEventToLocalFields(event: GoogleCalendarEvent, fallbackTimeZone = 'UTC'): LocalGoogleEventFields | null {
  const start = event.start;
  if (!start?.date && !start?.dateTime) {
    return null;
  }

  const timeZone = start.timeZone ?? event.end?.timeZone ?? fallbackTimeZone;
  const googleUpdatedAt = event.updated ? new Date(event.updated).toISOString() : null;

  if (start.date) {
    return {
      title: event.summary?.trim() || 'Untitled event',
      date: start.date,
      time: null,
      endTime: null,
      timeZone,
      description: event.description?.trim() || null,
      googleUpdatedAt,
      googleEtag: event.etag ?? null,
    };
  }

  const startParts = partsInTimeZone(start.dateTime ?? '', timeZone);
  const endParts = event.end?.dateTime ? partsInTimeZone(event.end.dateTime, event.end.timeZone ?? timeZone) : null;
  return {
    title: event.summary?.trim() || 'Untitled event',
    date: startParts.date,
    time: startParts.time,
    endTime: endParts?.time ?? null,
    timeZone,
    description: event.description?.trim() || null,
    googleUpdatedAt,
    googleEtag: event.etag ?? null,
  };
}

function eventEndForGoogle(row: Pick<DbEvent, 'event_date' | 'event_time' | 'end_time'>) {
  const startDate = normalizeDateOnly(row.event_date);
  const startTime = normalizeTime(row.event_time);
  const explicitEnd = normalizeTime(row.end_time);

  if (!startTime) {
    return { date: addDays(startDate, 1) };
  }

  if (explicitEnd) {
    return explicitEnd <= startTime
      ? { dateTime: `${addDays(startDate, 1)}T${explicitEnd}:00` }
      : { dateTime: `${startDate}T${explicitEnd}:00` };
  }

  const [hour, minute] = startTime.split(':').map(Number);
  const startMinutes = hour * 60 + minute;
  const endMinutes = startMinutes + DEFAULT_EVENT_DURATION_MINUTES;
  const endDate = endMinutes >= 24 * 60 ? addDays(startDate, 1) : startDate;
  const normalizedMinutes = endMinutes % (24 * 60);
  const endTime = `${String(Math.floor(normalizedMinutes / 60)).padStart(2, '0')}:${String(normalizedMinutes % 60).padStart(2, '0')}`;
  return { dateTime: `${endDate}T${endTime}:00` };
}

export function localEventToGooglePayload(row: Pick<DbEvent, 'title' | 'event_date' | 'event_time' | 'end_time' | 'event_timezone' | 'description'>) {
  const date = normalizeDateOnly(row.event_date);
  const startTime = normalizeTime(row.event_time);
  const timeZone = row.event_timezone || 'UTC';
  const end = eventEndForGoogle(row);

  if (!startTime) {
    return {
      summary: row.title,
      description: row.description ?? undefined,
      start: { date },
      end,
    };
  }

  return {
    summary: row.title,
    description: row.description ?? undefined,
    start: { dateTime: `${date}T${startTime}:00`, timeZone },
    end: 'dateTime' in end ? { ...end, timeZone } : end,
  };
}

const eventSelectColumns = `
  id::text,
  title,
  event_date::text AS event_date,
  event_time::text AS event_time,
  end_time::text AS end_time,
  COALESCE(NULLIF(event_timezone, ''), 'UTC') AS event_timezone,
  description,
  source_provider,
  source_key,
  google_calendar_id,
  google_event_id,
  google_etag,
  google_updated_at,
  updated_at
`;

async function findEventByGoogleId(client: Queryable, userId: string, calendarId: string, googleEventId: string): Promise<DbEvent | null> {
  const result = await client.query<DbEvent>(
    `
      SELECT ${eventSelectColumns}
      FROM events
      WHERE user_id = $1
        AND google_calendar_id = $2
        AND google_event_id = $3
      LIMIT 1;
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
      SET last_error = $2,
          sync_in_progress = FALSE,
          updated_at = NOW()
      WHERE user_id = $1;
    `,
    [userId, message]
  );
}

async function applyGoogleEvent(client: Queryable, userId: string, calendarId: string, event: GoogleCalendarEvent, fallbackTimeZone: string) {
  const existing = await findEventByGoogleId(client, userId, calendarId, event.id);
  if (event.status === 'cancelled') {
    if (!existing) {
      return 'deleted' as const;
    }
    if (existing.source_provider === GOOGLE_CALENDAR_SOURCE_PROVIDER) {
      await client.query('DELETE FROM events WHERE id = $1::bigint AND user_id = $2', [existing.id, userId]);
    } else {
      await client.query(
        `
          UPDATE events
          SET google_calendar_id = NULL,
              google_event_id = NULL,
              google_etag = NULL,
              google_updated_at = NULL
          WHERE id = $1::bigint AND user_id = $2;
        `,
        [existing.id, userId]
      );
    }
    return 'deleted' as const;
  }

  const fields = googleEventToLocalFields(event, fallbackTimeZone);
  if (!fields) {
    return 'updated' as const;
  }

  if (!existing) {
    await client.query(
      `
        INSERT INTO events (
          title,
          event_date,
          event_time,
          end_time,
          event_timezone,
          description,
          user_id,
          source_provider,
          source_key,
          google_calendar_id,
          google_event_id,
          google_etag,
          google_updated_at,
          updated_at
        )
        VALUES ($1, $2::date, $3::time, $4::time, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz, COALESCE($13::timestamptz, NOW()))
        ON CONFLICT (user_id, source_provider, source_key)
          WHERE user_id IS NOT NULL AND source_provider IS NOT NULL AND source_key IS NOT NULL
          DO UPDATE SET
            title = EXCLUDED.title,
            event_date = EXCLUDED.event_date,
            event_time = EXCLUDED.event_time,
            end_time = EXCLUDED.end_time,
            event_timezone = EXCLUDED.event_timezone,
            description = EXCLUDED.description,
            google_calendar_id = EXCLUDED.google_calendar_id,
            google_event_id = EXCLUDED.google_event_id,
            google_etag = EXCLUDED.google_etag,
            google_updated_at = EXCLUDED.google_updated_at,
            updated_at = EXCLUDED.updated_at;
      `,
      [
        fields.title,
        fields.date,
        fields.time,
        fields.endTime,
        fields.timeZone,
        fields.description,
        userId,
        GOOGLE_CALENDAR_SOURCE_PROVIDER,
        event.id,
        calendarId,
        event.id,
        fields.googleEtag,
        fields.googleUpdatedAt,
      ]
    );
    return 'imported' as const;
  }

  const previousGoogleUpdated = existing.google_updated_at ? new Date(existing.google_updated_at).getTime() : 0;
  const localUpdated = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
  const incomingGoogleUpdated = fields.googleUpdatedAt ? new Date(fields.googleUpdatedAt).getTime() : Date.now();
  const changedLocally = previousGoogleUpdated > 0 && localUpdated > previousGoogleUpdated + 1000;

  if (changedLocally && localUpdated > incomingGoogleUpdated) {
    return 'push_local' as const;
  }

  await client.query(
    `
      UPDATE events
      SET title = $1,
          event_date = $2::date,
          event_time = $3::time,
          end_time = $4::time,
          event_timezone = $5,
          description = $6,
          source_provider = COALESCE(source_provider, $7),
          source_key = COALESCE(source_key, $8),
          google_calendar_id = $9,
          google_event_id = $10,
          google_etag = $11,
          google_updated_at = $12::timestamptz,
          updated_at = COALESCE($12::timestamptz, updated_at)
      WHERE id = $13::bigint AND user_id = $14;
    `,
    [
      fields.title,
      fields.date,
      fields.time,
      fields.endTime,
      fields.timeZone,
      fields.description,
      existing.source_provider,
      existing.source_key,
      calendarId,
      event.id,
      fields.googleEtag,
      fields.googleUpdatedAt,
      existing.id,
      userId,
    ]
  );
  return 'updated' as const;
}

async function updateLocalGoogleMetadata(userId: string, eventId: string, calendarId: string, googleEvent: GoogleCalendarEvent) {
  await pool.query(
    `
      UPDATE events
      SET google_calendar_id = $3,
          google_event_id = $4,
          google_etag = $5,
          google_updated_at = $6::timestamptz
      WHERE id = $1::bigint AND user_id = $2;
    `,
    [eventId, userId, calendarId, googleEvent.id, googleEvent.etag ?? null, googleEvent.updated ?? null]
  );
}

async function localEventById(userId: string, eventId: string): Promise<DbEvent | null> {
  const result = await pool.query<DbEvent>(
    `
      SELECT ${eventSelectColumns}
      FROM events
      WHERE id = $1::bigint AND user_id = $2
      LIMIT 1;
    `,
    [eventId, userId]
  );
  return result.rows[0] ?? null;
}

export async function pushLocalEventToGoogle(userId: string, eventId: string, accessToken?: string, calendarId?: string): Promise<boolean> {
  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) {
    return false;
  }

  const row = await localEventById(userId, eventId);
  if (!row) {
    return false;
  }

  const token = accessToken ?? await ensureAccessToken(connection);
  const targetCalendarId = calendarId ?? connection.calendar_id ?? DEFAULT_CALENDAR_ID;
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

export async function deleteGoogleEventForLocalEvent(userId: string, row: Pick<DbEvent, 'google_event_id' | 'google_calendar_id'> | null): Promise<boolean> {
  if (!row?.google_event_id) {
    return false;
  }

  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) {
    return false;
  }

  const token = await ensureAccessToken(connection);
  const calendarId = row.google_calendar_id ?? connection.calendar_id ?? DEFAULT_CALENDAR_ID;
  const response = await fetch(
    `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(row.google_event_id)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(payload?.error?.message ?? 'GOOGLE_CALENDAR_DELETE_FAILED', response.status);
  }

  return true;
}

async function listGoogleEvents(connection: DbConnection, accessToken: string, fullSync: boolean): Promise<{
  events: GoogleCalendarEvent[];
  nextSyncToken: string | null;
}> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;
  const calendarId = encodeURIComponent(connection.calendar_id ?? DEFAULT_CALENDAR_ID);

  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '2500',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    if (fullSync || !connection.sync_token) {
      const now = new Date();
      params.set('timeMin', addYears(now, -1).toISOString());
      params.set('timeMax', addYears(now, 2).toISOString());
      params.set('orderBy', 'startTime');
    } else {
      params.set('syncToken', connection.sync_token);
    }

    const payload = await googleJson<GoogleEventsListResponse>(
      `${GOOGLE_CALENDAR_API_URL}/calendars/${calendarId}/events?${params.toString()}`,
      accessToken
    );
    events.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken ?? null;
    nextSyncToken = payload.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

async function pushUnsyncedLocalEvents(userId: string, accessToken: string, calendarId: string): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `
      SELECT id::text
      FROM events
      WHERE user_id = $1
        AND google_event_id IS NULL
        AND COALESCE(source_provider, '') <> $2
      ORDER BY event_date, event_time NULLS LAST, id;
    `,
    [userId, GOOGLE_CALENDAR_SOURCE_PROVIDER]
  );

  let pushed = 0;
  for (const row of result.rows) {
    if (await pushLocalEventToGoogle(userId, row.id, accessToken, calendarId)) {
      pushed += 1;
    }
  }
  return pushed;
}

export async function runGoogleCalendarSync(userId: string, options: { forceFull?: boolean } = {}): Promise<GoogleSyncResult> {
  assertGoogleCalendarConfigured();
  const connection = await readConnection(userId);
  if (!connection?.encrypted_refresh_token) {
    throw new ApiError('Google Calendar is not connected.', 400);
  }

  const run = await pool.query<{ id: string }>(
    `
      INSERT INTO google_calendar_sync_runs (user_id, status)
      VALUES ($1, 'running')
      RETURNING id::text;
    `,
    [userId]
  );
  const runId = run.rows[0]?.id;
  await pool.query('UPDATE google_calendar_connections SET sync_in_progress = TRUE, last_error = NULL WHERE user_id = $1', [userId]);

  const result: GoogleSyncResult = {
    importedCount: 0,
    updatedCount: 0,
    deletedCount: 0,
    pushedCount: 0,
    fullSync: options.forceFull || !connection.sync_token,
  };

  try {
    const accessToken = await ensureAccessToken(connection);
    const fallbackTimeZone = await calendarTimeZone(accessToken, connection.calendar_id);
    let listed: Awaited<ReturnType<typeof listGoogleEvents>>;
    try {
      listed = await listGoogleEvents(connection, accessToken, result.fullSync);
    } catch (err) {
      if ((err as ApiError & { status?: number; googleCode?: number })?.status === 410 || (err as ApiError & { googleCode?: number })?.googleCode === 410) {
        await pool.query('UPDATE google_calendar_connections SET sync_token = NULL WHERE user_id = $1', [userId]);
        const fullConnection = { ...connection, sync_token: null };
        listed = await listGoogleEvents(fullConnection, accessToken, true);
        result.fullSync = true;
      } else {
        throw err;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const googleEvent of listed.events) {
        const action = await applyGoogleEvent(client, userId, connection.calendar_id, googleEvent, fallbackTimeZone);
        if (action === 'imported') result.importedCount += 1;
        if (action === 'updated') result.updatedCount += 1;
        if (action === 'deleted') result.deletedCount += 1;
        if (action === 'push_local') {
          await client.query('COMMIT');
          await pushLocalEventToGoogle(userId, (await findEventByGoogleId(pool, userId, connection.calendar_id, googleEvent.id))?.id ?? '', accessToken, connection.calendar_id);
          result.pushedCount += 1;
          await client.query('BEGIN');
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    result.pushedCount += await pushUnsyncedLocalEvents(userId, accessToken, connection.calendar_id);
    await pool.query(
      `
        UPDATE google_calendar_connections
        SET sync_token = COALESCE($2, sync_token),
            last_synced_at = NOW(),
            last_error = NULL,
            sync_in_progress = FALSE,
            updated_at = NOW()
        WHERE user_id = $1;
      `,
      [userId, listed.nextSyncToken]
    );
    if (runId) {
      await pool.query(
        `
          UPDATE google_calendar_sync_runs
          SET status = 'success',
              finished_at = NOW(),
              imported_count = $2,
              updated_count = $3,
              deleted_count = $4,
              pushed_count = $5
          WHERE id = $1::bigint;
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
        `
          UPDATE google_calendar_sync_runs
          SET status = 'error',
              finished_at = NOW(),
              error = $2
          WHERE id = $1::bigint;
        `,
        [runId, err instanceof Error ? err.message : 'Google Calendar sync failed.']
      );
    }
    throw err;
  }
}

export async function disconnectGoogleCalendar(userId: string) {
  await pool.query('DELETE FROM google_calendar_connections WHERE user_id = $1', [userId]);
  await pool.query(
    `
      UPDATE events
      SET google_calendar_id = NULL,
          google_event_id = NULL,
          google_etag = NULL,
          google_updated_at = NULL
      WHERE user_id = $1;
    `,
    [userId]
  );
}

export async function readEventBeforeDelete(userId: string, eventId: string): Promise<DbEvent | null> {
  return localEventById(userId, eventId);
}

export async function syncEventMutationToGoogle(userId: string, actionName: string, rows: unknown[], beforeDelete?: DbEvent | null) {
  try {
    if (actionName === 'createEvent' || actionName === 'updateEvent') {
      const first = rows[0] as { id?: string | number } | undefined;
      if (first?.id) {
        await pushLocalEventToGoogle(userId, String(first.id));
      }
    } else if (actionName === 'deleteEvent') {
      await deleteGoogleEventForLocalEvent(userId, beforeDelete ?? null);
    }
  } catch (err) {
    await setConnectionError(userId, err);
  }
}
