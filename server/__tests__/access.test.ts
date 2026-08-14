import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';
process.env.UCD_ACCESS_DOMAIN = 'ucdconnect.ie';
process.env.PALOMAR_ACCESS_DOMAIN = 'student.palomar.edu';

describe('institution access rules', () => {
  it('matches only the exact ucdconnect.ie domain, case-insensitively', async () => {
    const { isUcdEmail } = await import('../access');
    expect(isUcdEmail('student@ucdconnect.ie')).toBe(true);
    expect(isUcdEmail('Student@UCDCONNECT.IE')).toBe(true);
    expect(isUcdEmail('student@mail.ucdconnect.ie')).toBe(false);
    expect(isUcdEmail('student@ucdconnect.ie.example.com')).toBe(false);
    expect(isUcdEmail('student@notucdconnect.ie')).toBe(false);
  });

  it('matches only the exact student.palomar.edu domain, case-insensitively', async () => {
    const { isInstitutionEmail, isPalomarEmail } = await import('../access');
    expect(isPalomarEmail('student@student.palomar.edu')).toBe(true);
    expect(isPalomarEmail('Student@STUDENT.PALOMAR.EDU')).toBe(true);
    expect(isPalomarEmail('student@mail.student.palomar.edu')).toBe(false);
    expect(isPalomarEmail('student@student.palomar.edu.evil.example')).toBe(false);
    expect(isPalomarEmail('student@notstudent.palomar.edu')).toBe(false);
    expect(isInstitutionEmail('student@student.palomar.edu')).toBe(true);
    expect(isInstitutionEmail('student@ucdconnect.ie')).toBe(true);
    expect(isInstitutionEmail('student@palomar.edu')).toBe(false);
  });

  it('maps campaign sources and entitlements to the configured institution', async () => {
    const { institutionForEntitlement, institutionForSource } = await import('../access');
    expect(institutionForSource('palomar_landing')).toMatchObject({
      key: 'palomar',
      emailDomain: 'student.palomar.edu',
      entitlementKey: 'palomar_autumn_2026',
    });
    expect(institutionForEntitlement('ucd_autumn_2026')).toMatchObject({ key: 'ucd', name: 'UCD' });
    expect(institutionForSource('unknown')).toBeNull();
  });

  it('suppresses trials for either campus email, attribution journey, or an existing entitlement', async () => {
    const { shouldSuppressInstitutionTrial } = await import('../access');
    expect(shouldSuppressInstitutionTrial({ hasEntitlement: false, email: 'student@student.palomar.edu', matchedJourney: false })).toBe(true);
    expect(shouldSuppressInstitutionTrial({ hasEntitlement: false, email: 'personal@example.com', matchedJourney: true })).toBe(true);
    expect(shouldSuppressInstitutionTrial({ hasEntitlement: true, email: 'personal@example.com', matchedJourney: false })).toBe(true);
    expect(shouldSuppressInstitutionTrial({ hasEntitlement: false, email: 'personal@example.com', matchedJourney: false })).toBe(false);
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
