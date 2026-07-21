import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';

describe('notification scheduling utilities', () => {
  it('converts local reminder targets to UTC across time zones', async () => {
    const { zonedDateTimeToUtc } = await import('../notifications');

    expect(zonedDateTimeToUtc('2026-07-10', '23:59', 'America/Los_Angeles').toISOString()).toBe(
      '2026-07-11T06:59:00.000Z'
    );
    expect(zonedDateTimeToUtc('2026-01-10', '09:00', 'Europe/Dublin').toISOString()).toBe('2026-01-10T09:00:00.000Z');
  });
});
