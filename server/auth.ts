import type { NextFunction, Request, Response } from 'express';
import admin from 'firebase-admin';
import { config } from './config';
import { pool } from './db';
import { ApiError } from './errors';

export type StagingAccessRole = 'admin' | 'viewer';
export type StagingAccessStatus = 'active' | 'disabled' | 'pending';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  role: StagingAccessRole;
}

export interface FirebaseUserProfile {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  createdAt: string;
  providerIds: string[];
}

export interface AuthenticatedFirebaseUser {
  uid: string;
  email: string;
}

type FirebaseLookupResult = {
  users?: Array<{
    localId: string;
    email?: string;
  }>;
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthenticatedUser;
  }
}

let firebaseInitialized = false;

function firebaseApp() {
  if (firebaseInitialized) {
    return admin.app();
  }

  if (config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebaseProjectId,
        clientEmail: config.firebaseClientEmail,
        privateKey: config.firebasePrivateKey,
      }),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: config.firebaseProjectId,
    });
  }

  firebaseInitialized = true;
  return admin.app();
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim();
}

async function grantForUser(uid: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await pool.query<{
    role: StagingAccessRole;
    status: StagingAccessStatus;
  }>(
    `
      SELECT role, status
      FROM staging_access_grants
      WHERE email = $1 OR firebase_uid = $2
      ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1;
    `,
    [normalizedEmail, uid]
  );

  if (result.rows[0]) {
    await pool.query(
      `
        UPDATE staging_access_grants
        SET firebase_uid = COALESCE(firebase_uid, $1),
            last_seen_at = NOW(),
            updated_at = NOW()
        WHERE email = $2 OR firebase_uid = $1;
      `,
      [uid, normalizedEmail]
    );
    return result.rows[0];
  }

  if (config.stagingAdminEmails.includes(normalizedEmail)) {
    const inserted = await pool.query<{
      role: StagingAccessRole;
      status: StagingAccessStatus;
    }>(
      `
        INSERT INTO staging_access_grants (email, firebase_uid, role, status, last_seen_at)
        VALUES ($1, $2, 'admin', 'active', NOW())
        ON CONFLICT (email) DO UPDATE
        SET firebase_uid = EXCLUDED.firebase_uid,
            role = 'admin',
            status = 'active',
            last_seen_at = NOW(),
            updated_at = NOW()
        RETURNING role, status;
      `,
      [normalizedEmail, uid]
    );
    return inserted.rows[0];
  }

  return null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getFirebaseUserProfile(uid: string): Promise<FirebaseUserProfile> {
  const user = await firebaseApp().auth().getUser(uid);
  return {
    uid: user.uid,
    email: normalizeEmail(user.email ?? ''),
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : new Date().toISOString(),
    providerIds: user.providerData.map((provider) => provider.providerId).filter(Boolean),
  };
}

export async function authenticatedFirebaseUser(req: Request): Promise<AuthenticatedFirebaseUser> {
  if (req.auth?.uid && req.auth.email) {
    return { uid: req.auth.uid, email: req.auth.email };
  }

  const token = bearerToken(req);
  if (!token) {
    throw new ApiError('AUTH_TOKEN_REQUIRED', 401);
  }

  if (!config.firebaseWebApiKey) {
    throw new ApiError('VITE_FIREBASE_API_KEY is required', 500);
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.firebaseWebApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }
  );

  const payload = (await response.json().catch(() => null)) as FirebaseLookupResult | null;
  const firebaseUser = payload?.users?.[0];
  if (!response.ok || !firebaseUser?.email) {
    throw new ApiError('INVALID_AUTH_TOKEN', 401);
  }

  return { uid: firebaseUser.localId, email: normalizeEmail(firebaseUser.email) };
}

function isMissingFirebaseUser(err: unknown): boolean {
  return (err as { code?: string })?.code === 'auth/user-not-found';
}

export async function deleteFirebaseAuthUsers(uids: string[]) {
  const uniqueUids = [...new Set(uids.map((uid) => uid.trim()).filter(Boolean))];
  if (uniqueUids.length === 0) {
    return;
  }

  if (uniqueUids.length === 1) {
    try {
      await firebaseApp().auth().deleteUser(uniqueUids[0]);
    } catch (err) {
      if (!isMissingFirebaseUser(err)) {
        throw err;
      }
    }
    return;
  }

  await firebaseApp().auth().deleteUsers(uniqueUids);
}

export async function deleteCurrentFirebaseAuthUser(idToken: string) {
  if (!config.firebaseWebApiKey) {
    throw new ApiError('VITE_FIREBASE_API_KEY is required', 500);
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(config.firebaseWebApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(payload?.error?.message ?? 'FIREBASE_ACCOUNT_DELETE_FAILED', 400);
  }
}

export async function getAccountPrimaryEmail(uid: string): Promise<string | null> {
  const result = await pool.query<{ email: string }>(
    `
      SELECT email
      FROM account_primary_emails
      WHERE firebase_uid = $1
      LIMIT 1;
    `,
    [uid]
  );

  return result.rows[0]?.email ?? null;
}

export async function rememberAccountPrimaryEmail(uid: string, email: string): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  await pool.query(
    `
      INSERT INTO account_primary_emails (firebase_uid, email)
      VALUES ($1, $2)
      ON CONFLICT (firebase_uid) DO UPDATE
      SET email = EXCLUDED.email,
          updated_at = NOW();
    `,
    [uid, normalizedEmail]
  );

  return normalizedEmail;
}

export async function resolvePrimaryUidForEmail(email: string, fallbackUid: string): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const result = await pool.query<{ firebase_uid: string }>(
    `
      SELECT firebase_uid
      FROM account_primary_emails
      WHERE lower(email) = $1
      UNION ALL
      SELECT firebase_uid
      FROM account_email_addresses
      WHERE lower(email) = $1
        AND verified_at IS NOT NULL
      LIMIT 1;
    `,
    [normalizedEmail]
  );

  return result.rows[0]?.firebase_uid ?? fallbackUid;
}

export async function requireStagingAccess(req: Request, res: Response, next: NextFunction) {
  if (!config.stagingAccessControlEnabled) {
    return next();
  }

  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: { message: 'AUTH_TOKEN_REQUIRED' } });
  }

  try {
    const decoded = await firebaseApp().auth().verifyIdToken(token);
    const email = decoded.email?.trim().toLowerCase();
    if (!email) {
      return res.status(403).json({ error: { message: 'EMAIL_REQUIRED' } });
    }

    const grant = await grantForUser(decoded.uid, email);
    if (!grant || grant.status !== 'active') {
      return res.status(403).json({ error: { message: 'STAGING_ACCESS_DENIED' } });
    }

    req.auth = {
      uid: decoded.uid,
      email,
      role: grant.role,
    };
    return next();
  } catch (err) {
    console.error('[auth] Firebase token verification failed:', err);
    return res.status(401).json({ error: { message: 'INVALID_AUTH_TOKEN' } });
  }
}

export function requireStagingAdmin(req: Request, res: Response, next: NextFunction) {
  if (!config.stagingAccessControlEnabled) {
    return next();
  }

  if (req.auth?.role !== 'admin') {
    return res.status(403).json({ error: { message: 'ADMIN_REQUIRED' } });
  }

  return next();
}

export function requestUserId(req: Request, source: Record<string, unknown>): string {
  if (req.auth?.uid) {
    return req.auth.uid;
  }

  const userId = source.userId;
  if (!userId) {
    throw new ApiError('userId is required', 400);
  }

  return String(userId);
}
