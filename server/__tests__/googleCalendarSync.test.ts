import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-google-token-encryption-key';
process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-google-calendar-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test-google-calendar-client-secret';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Google Calendar sync utilities', () => {
  it('recognizes UCD-style course codes without guessing unmatched titles', async () => {
    const { courseCodeFromCalendarTitle } = await import('../googleCalendarSync');
    expect(courseCodeFromCalendarTitle('COMP30870 Software Engineering Lecture')).toBe('COMP30870');
    expect(courseCodeFromCalendarTitle('COMP30870A - Tutorial')).toBe('COMP30870A');
    expect(courseCodeFromCalendarTitle('Student society meeting')).toBeNull();
  });

  it('requests only the verified owned-event Calendar scope', async () => {
    const { pool } = await import('../db');
    vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] } as never);
    const { buildGoogleCalendarAuthUrl } = await import('../googleCalendarSync');

    const authorizationUrl = new URL(await buildGoogleCalendarAuthUrl('user-1'));
    const scopes = authorizationUrl.searchParams.get('scope')?.split(' ') ?? [];
    const calendarScopes = scopes.filter((scope) => scope.startsWith('https://www.googleapis.com/auth/calendar'));

    expect(scopes).toContain('https://www.googleapis.com/auth/calendar.events.owned');
    expect(calendarScopes).toEqual(['https://www.googleapis.com/auth/calendar.events.owned']);
    expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar.events');
    expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar.events.readonly');
    expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar.calendarlist.readonly');
    expect(authorizationUrl.searchParams.has('include_granted_scopes')).toBe(false);
  });

  it('encrypts tokens and validates signed OAuth state', async () => {
    const {
      decryptGoogleToken,
      encryptGoogleToken,
      signGoogleCalendarState,
      verifyGoogleCalendarState,
      verifyGoogleCalendarStateDetails,
    } = await import('../googleCalendarSync');

    const encrypted = encryptGoogleToken('refresh-token-123');
    expect(encrypted).not.toContain('refresh-token-123');
    expect(decryptGoogleToken(encrypted)).toBe('refresh-token-123');

    const state = signGoogleCalendarState('user-1', 1000);
    expect(verifyGoogleCalendarState(state, 2000)).toBe('user-1');
    const originState = signGoogleCalendarState('user-1', 1000, 'http://127.0.0.1:5173');
    expect(verifyGoogleCalendarStateDetails(originState, 2000)).toMatchObject({
      userId: 'user-1',
      returnOrigin: 'http://127.0.0.1:5173',
    });
    expect(() => verifyGoogleCalendarState(`${state}x`, 2000)).toThrow(/Invalid Google Calendar connection state/i);
    expect(() => verifyGoogleCalendarState(state, 1000 + 11 * 60 * 1000)).toThrow(/Expired Google Calendar connection state/i);
  });

  it('maps Google all-day and timed events into UMS event fields', async () => {
    const { googleEventToLocalFields } = await import('../googleCalendarSync');

    expect(
      googleEventToLocalFields(
        {
          id: 'google-all-day',
          summary: 'Reading day',
          description: 'No lectures',
          updated: '2026-07-20T10:00:00.000Z',
          start: { date: '2026-07-22' },
          end: { date: '2026-07-23' },
        },
        'America/Los_Angeles'
      )
    ).toMatchObject({
      title: 'Reading day',
      date: '2026-07-22',
      endDate: null,
      time: null,
      endTime: null,
      timeZone: 'America/Los_Angeles',
      description: 'No lectures',
    });

    expect(
      googleEventToLocalFields(
        {
          id: 'google-timed',
          summary: 'Study group',
          updated: '2026-07-20T10:00:00.000Z',
          start: { dateTime: '2026-07-22T16:00:00-07:00', timeZone: 'America/Los_Angeles' },
          end: { dateTime: '2026-07-22T17:30:00-07:00', timeZone: 'America/Los_Angeles' },
        },
        'UTC'
      )
    ).toMatchObject({
      title: 'Study group',
      date: '2026-07-22',
      endDate: null,
      time: '16:00',
      endTime: '17:30',
      timeZone: 'America/Los_Angeles',
    });
  });

  it('maps UMS events into Google event payloads', async () => {
    const { localEventToGooglePayload } = await import('../googleCalendarSync');

    expect(
      localEventToGooglePayload({
        title: 'All-day fair',
        event_date: '2026-07-22',
        end_date: null,
        event_time: null,
        end_time: null,
        event_timezone: 'America/Los_Angeles',
        description: null,
      })
    ).toEqual({
      summary: 'All-day fair',
      description: undefined,
      start: { date: '2026-07-22' },
      end: { date: '2026-07-23' },
    });

    expect(
      localEventToGooglePayload({
        title: 'Project demo',
        event_date: '2026-07-22',
        end_date: null,
        event_time: '16:00:00',
        end_time: null,
        event_timezone: 'America/Los_Angeles',
        description: 'Final walkthrough',
      })
    ).toEqual({
      summary: 'Project demo',
      description: 'Final walkthrough',
      start: { dateTime: '2026-07-22T16:00:00', timeZone: 'America/Los_Angeles' },
      end: { dateTime: '2026-07-22T17:00:00', timeZone: 'America/Los_Angeles' },
    });
  });

  it('preserves inclusive multi-day ranges at the Google boundary', async () => {
    const { googleEventToLocalFields, localEventToGooglePayload } = await import('../googleCalendarSync');

    expect(
      googleEventToLocalFields({
        id: 'trip',
        summary: 'Conference',
        start: { date: '2026-07-22' },
        end: { date: '2026-07-26' },
      })
    ).toMatchObject({
      date: '2026-07-22',
      endDate: '2026-07-25',
      time: null,
    });

    expect(
      localEventToGooglePayload({
        title: 'Conference',
        event_date: '2026-07-22',
        end_date: '2026-07-25',
        event_time: null,
        end_time: null,
        event_timezone: 'America/Los_Angeles',
        description: null,
      })
    ).toMatchObject({
      start: { date: '2026-07-22' },
      end: { date: '2026-07-26' },
    });

    expect(
      googleEventToLocalFields({
        id: 'overnight',
        summary: 'Hackathon',
        start: { dateTime: '2026-07-22T20:00:00-07:00', timeZone: 'America/Los_Angeles' },
        end: { dateTime: '2026-07-23T08:00:00-07:00', timeZone: 'America/Los_Angeles' },
      })
    ).toMatchObject({
      date: '2026-07-22',
      endDate: '2026-07-23',
      time: '20:00',
      endTime: '08:00',
    });

    expect(
      localEventToGooglePayload({
        title: 'Hackathon',
        event_date: '2026-07-22',
        end_date: '2026-07-23',
        event_time: '20:00',
        end_time: '08:00',
        event_timezone: 'America/Los_Angeles',
        description: null,
      })
    ).toMatchObject({
      start: { dateTime: '2026-07-22T20:00:00' },
      end: { dateTime: '2026-07-23T08:00:00' },
    });
  });
});
