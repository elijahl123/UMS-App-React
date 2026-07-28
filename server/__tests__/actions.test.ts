import { describe, expect, it } from 'vitest';
import { getActionQuery } from '../actions';

describe('event action ranges', () => {
  it('persists an inclusive end date for multi-day events', () => {
    const query = getActionQuery('createEvent', {
      title: 'Conference',
      date: '2026-07-20',
      endDate: '2026-07-23',
      time: null,
      endTime: null,
      timeZone: 'America/Los_Angeles',
      userId: 'user-1',
    });

    expect(query?.values).toEqual([
      'Conference',
      '2026-07-20',
      '2026-07-23',
      null,
      null,
      'America/Los_Angeles',
      null,
      'user-1',
    ]);
  });

  it('normalizes same-day ranges and rejects invalid timed ranges', () => {
    expect(
      getActionQuery('createEvent', {
        title: 'Office hours',
        date: '2026-07-20',
        endDate: '2026-07-20',
        userId: 'user-1',
      })?.values?.[2]
    ).toBeNull();

    expect(() =>
      getActionQuery('createEvent', {
        title: 'Backwards',
        date: '2026-07-20',
        endDate: '2026-07-19',
        userId: 'user-1',
      })
    ).toThrow(/cannot be before/i);

    expect(() =>
      getActionQuery('createEvent', {
        title: 'Bad time',
        date: '2026-07-20',
        time: '18:00',
        endTime: '17:00',
        userId: 'user-1',
      })
    ).toThrow(/must be after/i);
  });
});
