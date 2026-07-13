import type { NextFunction, Request, Response } from 'express';
import admin from 'firebase-admin';
import { config } from './config';
import { pool } from './db';
import { ApiError } from './errors';

export type StagingAccessRole = 'admin' | 'viewer';
export type StagingAccessStatus = 'active' | 'disabled' | 'pending';

export interface AuthenticatedUser {
  uid: string;
  loginUid?: string;
  email: string;
  loginEmail?: string;
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

function mapFirebaseAdminUser(user: admin.auth.UserRecord): FirebaseUserProfile | null {
  const primaryEmail = user.providerData.find((provider) => provider.providerId === 'password')?.email ?? user.email;
  if (!primaryEmail) {
    return null;
  }

  return {
    uid: user.uid,
    email: primaryEmail.trim().toLowerCase(),
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : new Date().toISOString(),
    providerIds: user.providerData.map((provider) => provider.providerId).filter(Boolean),
  };
}

function normalizeStoredEmail(email: string): string {
  return email.trim().toLowerCase();
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

export async function rememberAccountPrimaryEmail(uid: string, email: string, overwrite = false): Promise<string> {
  const normalizedEmail = normalizeStoredEmail(email);
  const result = await pool.query<{ email: string }>(
    `
      INSERT INTO account_primary_emails (firebase_uid, email)
      VALUES ($1, $2)
      ON CONFLICT (firebase_uid) DO UPDATE
      SET email = CASE
            WHEN $3 THEN EXCLUDED.email
            ELSE account_primary_emails.email
          END,
          updated_at = CASE
            WHEN $3 THEN NOW()
            ELSE account_primary_emails.updated_at
          END
      RETURNING email;
    `,
    [uid, normalizedEmail, overwrite]
  );

  return result.rows[0]?.email ?? normalizedEmail;
}

export async function resolvePrimaryUidForEmail(email: string, fallbackUid: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await pool.query<{ firebase_uid: string }>(
    `
      SELECT firebase_uid
      FROM account_email_addresses
      WHERE lower(email) = $1
        AND verified_at IS NOT NULL
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1;
    `,
    [normalizedEmail]
  );

  return result.rows[0]?.firebase_uid ?? fallbackUid;
}

export async function getFirebaseUserProfile(uid: string): Promise<FirebaseUserProfile | null> {
  const user = await firebaseApp().auth().getUser(uid);
  const profile = mapFirebaseAdminUser(user);
  if (!profile) {
    return null;
  }

  const storedPrimaryEmail = await getAccountPrimaryEmail(uid).catch(() => null);
  return storedPrimaryEmail ? { ...profile, email: storedPrimaryEmail } : profile;
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

    const primaryUid = await resolvePrimaryUidForEmail(email, decoded.uid);
    const primaryProfile = primaryUid !== decoded.uid ? await getFirebaseUserProfile(primaryUid).catch(() => null) : null;
    const grant = await grantForUser(primaryUid, email);
    if (!grant || grant.status !== 'active') {
      return res.status(403).json({ error: { message: 'STAGING_ACCESS_DENIED' } });
    }

    req.auth = {
      uid: primaryUid,
      loginUid: decoded.uid,
      email: primaryProfile?.email ?? email,
      loginEmail: email,
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
