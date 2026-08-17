import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockUser } from '@/app/test/fixtures';
import {
  AUTH_SESSION_STORAGE_KEY,
  clearStoredAuthSession,
  expiresAtFrom,
  readStoredAuthSession,
  shouldRefreshSession,
  writeStoredAuthSession,
  type StoredAuthSession,
} from '@/app/lib/auth/sessionPersistence';

function storedSession(overrides: Partial<StoredAuthSession> = {}): StoredAuthSession {
  return {
    version: 2,
    idToken: 'firebase-id-token',
    refreshToken: 'firebase-refresh-token',
    expiresAt: Date.now() + 60 * 60 * 1000,
    user: mockUser,
    ...overrides,
  };
}

describe('auth session persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('writes remembered sessions locally and removes temporary sessions', () => {
    sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'old-temporary-session');

    writeStoredAuthSession(storedSession(), 'local');

    expect(readStoredAuthSession()?.persistence).toBe('local');
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('writes temporary sessions to session storage and removes remembered sessions', () => {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'old-remembered-session');

    writeStoredAuthSession(storedSession(), 'session');

    expect(readStoredAuthSession()?.persistence).toBe('session');
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('upgrades a valid legacy record without inventing a refresh token', () => {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ idToken: 'legacy-token', user: mockUser }));

    expect(readStoredAuthSession()).toEqual({
      persistence: 'local',
      session: expect.objectContaining({
        version: 2,
        idToken: 'legacy-token',
        refreshToken: null,
        expiresAt: null,
        user: mockUser,
      }),
    });
  });

  it('removes malformed records and clears both persistence modes', () => {
    sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, '{bad-json');
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(storedSession()));

    expect(readStoredAuthSession()?.persistence).toBe('local');
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();

    clearStoredAuthSession();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('refreshes sessions within the expiry buffer and calculates server expirations', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));

    expect(expiresAtFrom('3600', 'not-a-jwt')).toBe(Date.now() + 60 * 60 * 1000);
    expect(shouldRefreshSession(storedSession({ expiresAt: Date.now() + 4 * 60 * 1000 }))).toBe(true);
    expect(shouldRefreshSession(storedSession({ expiresAt: Date.now() + 10 * 60 * 1000 }))).toBe(false);
    expect(shouldRefreshSession(storedSession({ refreshToken: null, expiresAt: Date.now() }))).toBe(false);

    vi.useRealTimers();
  });
});
