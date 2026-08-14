import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';
process.env.APP_BASE_URL = 'https://app.untitledmanagementsoftware.com';
process.env.MARKETING_ORIGIN = 'https://untitledmanagementsoftware.com';
process.env.SENDGRID_UCD_LAUNCH_UNSUBSCRIBE_GROUP_ID = '101';
process.env.SENDGRID_PALOMAR_LAUNCH_UNSUBSCRIBE_GROUP_ID = '202';

describe('campus launch public inputs', () => {
  it('accepts only trusted launch origins', async () => {
    const { isTrustedLaunchOrigin } = await import('../routes/launch');
    expect(isTrustedLaunchOrigin('https://untitledmanagementsoftware.com')).toBe(true);
    expect(isTrustedLaunchOrigin('https://app.untitledmanagementsoftware.com')).toBe(true);
    expect(isTrustedLaunchOrigin('https://untitledmanagementsoftware.com.evil.example')).toBe(false);
    expect(isTrustedLaunchOrigin(undefined)).toBe(false);
  });

  it('rejects malformed attribution values instead of rewriting them', async () => {
    const { sanitizeLaunchAttribution } = await import('../routes/launch');
    expect(sanitizeLaunchAttribution({
      source: 'ucd_landing',
      campaign: 'orientation.2026',
      ambassador: 'bad value',
      society: 'x'.repeat(65),
      referral: 'valid_code-1',
      launchSession: 'session_123',
    })).toEqual({
      source: 'ucd_landing',
      campaign: 'orientation.2026',
      ambassador: null,
      society: null,
      referral: 'valid_code-1',
      launchSession: 'session_123',
    });
  });

  it('accepts the Palomar source without weakening attribution validation', async () => {
    const { sanitizeLaunchAttribution } = await import('../routes/launch');
    expect(sanitizeLaunchAttribution({
      source: 'palomar_landing',
      campaign: 'palomar_orientation_2026',
      launchSession: 'palomar_session_123',
    })).toEqual({
      source: 'palomar_landing',
      campaign: 'palomar_orientation_2026',
      ambassador: null,
      society: null,
      referral: null,
      launchSession: 'palomar_session_123',
    });
  });

  it('keeps only enumerated, non-sensitive telemetry properties', async () => {
    const { safeProperties } = await import('../routes/launch');
    expect(safeProperties({
      sourceType: 'canvas_ics',
      targetType: 'assignment',
      list: 'palomar_incoming',
      step: 'coursework',
      savedCount: 3,
      rejectedCount: -1,
      correctedCount: 2.5,
      title: 'private schoolwork title',
      error: 'raw PDF text',
      unexpected: true,
    })).toEqual({ sourceType: 'canvas_ics', targetType: 'assignment', list: 'palomar_incoming', step: 'coursework', savedCount: 3 });
  });

  it('validates Palomar consent, keeps redirects source-aware, and separates suppression groups', async () => {
    const {
      landingPageFor,
      suppressionGroupIdForWaitlist,
      waitlistIsOpen,
      waitlistRequestIsValid,
    } = await import('../routes/launch');
    expect(waitlistRequestIsValid({ email: 'student@example.com', list: 'palomar_incoming', consent: true })).toBe(true);
    expect(waitlistRequestIsValid({ email: 'student@example.com', list: 'palomar_incoming', consent: false })).toBe(false);
    expect(waitlistRequestIsValid({ email: 'bad-email', list: 'palomar_incoming', consent: true })).toBe(false);
    expect(landingPageFor('palomar_landing')).toBe('palomar');
    expect(landingPageFor('ucd_landing')).toBe('ucd');
    expect(suppressionGroupIdForWaitlist('palomar_incoming')).toBe(202);
    expect(suppressionGroupIdForWaitlist('ucd_incoming')).toBe(101);
    expect(suppressionGroupIdForWaitlist('ios')).toBe(0);
    expect(waitlistIsOpen(Date.parse('2027-03-31T23:59:59Z'))).toBe(true);
    expect(waitlistIsOpen(Date.parse('2027-04-01T00:00:00Z'))).toBe(false);
  });
});
