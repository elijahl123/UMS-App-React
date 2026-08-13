import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';
process.env.APP_BASE_URL = 'https://app.untitledmanagementsoftware.com';
process.env.MARKETING_ORIGIN = 'https://untitledmanagementsoftware.com';

describe('UCD launch public inputs', () => {
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

  it('keeps only enumerated, non-sensitive telemetry properties', async () => {
    const { safeProperties } = await import('../routes/launch');
    expect(safeProperties({
      sourceType: 'brightspace_pdf',
      targetType: 'assignment',
      list: 'ios',
      savedCount: 3,
      rejectedCount: -1,
      correctedCount: 2.5,
      title: 'private schoolwork title',
      error: 'raw PDF text',
      unexpected: true,
    })).toEqual({ sourceType: 'brightspace_pdf', targetType: 'assignment', list: 'ios', savedCount: 3 });
  });
});
