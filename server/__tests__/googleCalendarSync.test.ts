import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-google-token-encryption-key';
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test-google-calendar-client-secret';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Google Calendar sync utilities', () => {
  it('encrypts tokens and validates signed OAuth state', async () => {
    const {
      decryptGoogleToken,
      encryptGoogleToken,
      signGoogleCalendarState,
      verifyGoogleCalendarState,
    } = await import('../googleCalendarSync');

    const encrypted = encryptGoogleToken('refresh-token-123');
    expect(encrypted).not.toContain('refresh-token-123');
    expect(decryptGoogleToken(encrypted)).toBe('refresh-token-123');

    const state = signGoogleCalendarState('user-1', 1000);
    expect(verifyGoogleCalendarState(state, 2000)).toBe('user-1');
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
});
