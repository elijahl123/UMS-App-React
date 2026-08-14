import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';
process.env.UCD_ACCESS_DOMAIN = 'ucdconnect.ie';

describe('UCD access rules', () => {
  it('matches only the exact ucdconnect.ie domain, case-insensitively', async () => {
    const { isUcdEmail } = await import('../access');
    expect(isUcdEmail('student@ucdconnect.ie')).toBe(true);
    expect(isUcdEmail('Student@UCDCONNECT.IE')).toBe(true);
    expect(isUcdEmail('student@mail.ucdconnect.ie')).toBe(false);
    expect(isUcdEmail('student@ucdconnect.ie.example.com')).toBe(false);
    expect(isUcdEmail('student@notucdconnect.ie')).toBe(false);
  });

  it('uses exclusive entitlement and grace boundaries with paid access overriding them', async () => {
    const { resolveAccessMode } = await import('../access');
    const base = {
      subscribed: false,
      trialActive: false,
      startsAt: '2026-09-07T08:00:00Z',
      endsAt: '2027-01-18T00:00:00Z',
      graceEndsAt: '2027-02-01T00:00:00Z',
    };
    expect(resolveAccessMode({ ...base, now: Date.parse('2026-09-07T07:59:59Z') })).toBe('billing_required');
    expect(resolveAccessMode({ ...base, now: Date.parse(base.startsAt) })).toBe('full');
    expect(resolveAccessMode({ ...base, now: Date.parse(base.endsAt) - 1 })).toBe('full');
    expect(resolveAccessMode({ ...base, now: Date.parse(base.endsAt) })).toBe('read_only');
    expect(resolveAccessMode({ ...base, now: Date.parse(base.graceEndsAt) - 1 })).toBe('read_only');
    expect(resolveAccessMode({ ...base, now: Date.parse(base.graceEndsAt) })).toBe('billing_required');
    expect(resolveAccessMode({ ...base, now: Date.parse('2027-03-01T00:00:00Z'), subscribed: true })).toBe('full');
  });
});
