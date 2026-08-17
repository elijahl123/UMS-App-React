import type { AppUser } from '@/app/data/types';

export const AUTH_SESSION_STORAGE_KEY = 'schoolwork_auth_session';

export type SessionPersistence = 'local' | 'session';

export interface StoredAuthSession {
  version: 2;
  idToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  user: AppUser;
}

export interface StoredAuthSessionRecord {
  persistence: SessionPersistence;
  session: StoredAuthSession;
}

type LegacyStoredSession = {
  idToken?: unknown;
  user?: unknown;
};

function tokenExpiresAt(idToken: string): number | null {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized)) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function expiresAtFrom(expiresIn: string | number | undefined, idToken: string): number | null {
  const seconds = Number(expiresIn);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Date.now() + seconds * 1000;
  }
  return tokenExpiresAt(idToken);
}

function parseStoredSession(raw: string): StoredAuthSession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthSession> & LegacyStoredSession;
    if (typeof parsed.idToken !== 'string' || !parsed.idToken || !parsed.user || typeof parsed.user !== 'object') {
      return null;
    }

    return {
      version: 2,
      idToken: parsed.idToken,
      refreshToken: typeof parsed.refreshToken === 'string' && parsed.refreshToken ? parsed.refreshToken : null,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : tokenExpiresAt(parsed.idToken),
      user: parsed.user as AppUser,
    };
  } catch {
    return null;
  }
}

function readFrom(storage: Storage, persistence: SessionPersistence): StoredAuthSessionRecord | null {
  const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) return null;

  const session = parseStoredSession(raw);
  if (!session) {
    storage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }

  return { persistence, session };
}

export function readStoredAuthSession(): StoredAuthSessionRecord | null {
  return readFrom(sessionStorage, 'session') ?? readFrom(localStorage, 'local');
}

export function writeStoredAuthSession(session: StoredAuthSession, persistence: SessionPersistence) {
  const serialized = JSON.stringify(session);
  if (persistence === 'local') {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, serialized);
    sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return;
  }

  sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, serialized);
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function clearStoredAuthSession() {
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function shouldRefreshSession(session: StoredAuthSession, bufferMs = 5 * 60 * 1000): boolean {
  return Boolean(session.refreshToken) && (session.expiresAt === null || session.expiresAt <= Date.now() + bufferMs);
}
