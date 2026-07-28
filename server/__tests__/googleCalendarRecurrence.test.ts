import { describe, expect, it } from 'vitest';
import {
  expandRecurringEventRows,
  type RecurringEventRow,
} from '../googleCalendarRecurrence';

function recurringRow(overrides: Partial<RecurringEventRow> = {}): RecurringEventRow {
  return {
    id: '10',
    title: 'Weekly study group',
    event_date: '2026-03-02',
    event_time: '16:00:00',
    end_time: '17:00:00',
    event_timezone: 'America/Los_Angeles',
    description: null,
    source_provider: 'google_calendar',
    source_key: 'primary:series-1',
    google_calendar_id: 'primary',
    google_event_id: 'series-1',
    google_etag: null,
    google_updated_at: null,
    google_recurrence: ['RRULE:FREQ=WEEKLY;COUNT=4'],
    google_recurring_event_id: null,
    google_original_start: null,
    google_cancelled: false,
    updated_at: null,
    ...overrides,
  };
}

describe('compact Google Calendar recurrence expansion', () => {
  it('expands a stored series inside the requested range without persisted instance rows', () => {
    const expanded = expandRecurringEventRows(
      [recurringRow()],
      '2026-03-01',
      '2026-04-01'
    );

    expect(expanded).toHaveLength(4);
    expect(expanded.map((event) => event.event_date)).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
    ]);
    expect(expanded[0]).toMatchObject({
      event_time: '16:00',
      recurring_series_id: '10',
      recurrence_original_start: '2026-03-02T16:00',
    });
    expect(expanded[0].id).toMatch(/^google-occurrence:10:/);
  });

  it('replaces moved exceptions and suppresses cancelled occurrences', () => {
    const master = recurringRow();
    const moved = recurringRow({
      id: '11',
      title: 'Moved study group',
      event_date: '2026-03-10',
      event_time: '18:00:00',
      end_time: '19:00:00',
      google_event_id: 'exception-1',
      google_recurrence: null,
      google_recurring_event_id: 'series-1',
      google_original_start: '2026-03-09T16:00',
    });
    const cancelled = recurringRow({
      id: '12',
      title: 'Cancelled recurring occurrence',
      event_date: '2026-03-16',
      google_event_id: 'exception-2',
      google_recurrence: null,
      google_recurring_event_id: 'series-1',
      google_original_start: '2026-03-16T16:00',
      google_cancelled: true,
    });

    const expanded = expandRecurringEventRows(
      [master, moved, cancelled],
      '2026-03-01',
      '2026-04-01'
    );

    expect(expanded.map((event) => [event.event_date, event.title])).toEqual([
      ['2026-03-02', 'Weekly study group'],
      ['2026-03-10', 'Moved study group'],
      ['2026-03-23', 'Weekly study group'],
    ]);
    expect(expanded[1].recurrence_original_start).toBe('2026-03-09T16:00');
  });

  it('keeps local wall-clock time stable across daylight-saving transitions', () => {
    const expanded = expandRecurringEventRows(
      [recurringRow({ event_date: '2026-03-02', google_recurrence: ['RRULE:FREQ=WEEKLY;COUNT=3'] })],
      '2026-03-01',
      '2026-03-31'
    );

    expect(expanded.map((event) => event.event_time)).toEqual(['16:00', '16:00', '16:00']);
  });

  it('supports all-day EXDATE and RDATE recurrence entries', () => {
    const expanded = expandRecurringEventRows(
      [
        recurringRow({
          event_date: '2026-06-01',
          event_time: null,
          end_time: null,
          google_recurrence: [
            'RRULE:FREQ=DAILY;COUNT=3',
            'EXDATE;VALUE=DATE:20260602',
            'RDATE;VALUE=DATE:20260605',
          ],
        }),
      ],
      '2026-06-01',
      '2026-06-10'
    );

    expect(expanded.map((event) => event.event_date)).toEqual([
      '2026-06-01',
      '2026-06-03',
      '2026-06-05',
    ]);
    expect(expanded.every((event) => event.event_time === null)).toBe(true);
  });

  it('includes a multi-day occurrence that begins before the requested range', () => {
    const expanded = expandRecurringEventRows(
      [recurringRow({
        event_date: '2026-03-02',
        end_date: '2026-03-04',
        event_time: null,
        end_time: null,
        google_recurrence: ['RRULE:FREQ=WEEKLY;COUNT=2'],
      })],
      '2026-03-03',
      '2026-03-10'
    );

    expect(expanded.map((event) => [event.event_date, event.end_date])).toEqual([
      ['2026-03-02', '2026-03-04'],
      ['2026-03-09', '2026-03-11'],
    ]);
  });
});
