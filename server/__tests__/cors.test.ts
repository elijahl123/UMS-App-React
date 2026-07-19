import { describe, expect, it } from 'vitest';
import { createCorsOptions, isCorsOriginAllowed, parseAllowedOrigins } from '../cors';

function resolveCorsOrigin(origin: string | undefined, allowedOrigins: string[]) {
  const originOption = createCorsOptions(allowedOrigins).origin;
  if (typeof originOption !== 'function') {
    throw new Error('Expected CORS origin option to be a function');
  }

  return new Promise<{ err: Error | null; allow?: boolean }>((resolve) => {
    originOption(origin, (err, allow) => {
      resolve({ err: err ?? null, allow: allow as boolean | undefined });
    });
  });
}

describe('CORS origin allowlist', () => {
  it('preserves legacy APP_ORIGIN behavior when APP_ORIGINS is empty', () => {
    expect(parseAllowedOrigins('http://localhost:5173', '')).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://[::1]:5173',
    ]);
  });

  it('uses comma-separated APP_ORIGINS when provided', () => {
    expect(parseAllowedOrigins('http://localhost:5173', 'https://app.untitledmanagementsoftware.com, capacitor://localhost')).toEqual([
      'https://app.untitledmanagementsoftware.com',
      'capacitor://localhost',
    ]);
  });

  it('allows loopback aliases for local web development origins', () => {
    const allowedOrigins = parseAllowedOrigins('http://localhost:5173', 'http://localhost:5173,capacitor://localhost');

    expect(isCorsOriginAllowed('http://127.0.0.1:5173', allowedOrigins)).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:5173', allowedOrigins)).toBe(true);
    expect(isCorsOriginAllowed('http://[::1]:5173', allowedOrigins)).toBe(true);
  });

  it('allows configured web and native origins', () => {
    const allowedOrigins = ['https://app.untitledmanagementsoftware.com', 'capacitor://localhost', 'http://localhost'];

    expect(isCorsOriginAllowed('https://app.untitledmanagementsoftware.com', allowedOrigins)).toBe(true);
    expect(isCorsOriginAllowed('capacitor://localhost', allowedOrigins)).toBe(true);
    expect(isCorsOriginAllowed('http://localhost', allowedOrigins)).toBe(true);
  });

  it('rejects an unlisted origin through the CORS callback', async () => {
    const result = await resolveCorsOrigin('https://example.invalid', ['https://app.untitledmanagementsoftware.com']);

    expect(result.allow).toBeUndefined();
    expect(result.err?.message).toBe('CORS origin not allowed: https://example.invalid');
  });
});
