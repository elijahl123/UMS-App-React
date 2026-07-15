import { Router, type Request, type Response } from 'express';
import { config } from '../config';
import {
  authenticatedFirebaseUser,
  deleteCurrentFirebaseAuthUser,
  deleteFirebaseAuthUsers,
  getAccountPrimaryEmail,
  getFirebaseUserProfile,
  rememberAccountPrimaryEmail,
  resolvePrimaryUidForEmail,
  type FirebaseUserProfile,
} from '../auth';
import { deleteAccountCascade } from '../accountDeletion';
import { pool } from '../db';
import { ApiError } from '../errors';

export const authSessionRouter = Router();

type FirebaseLookupResult = {
  users?: Array<{
    localId: string;
    email?: string;
    displayName?: string;
    emailVerified?: boolean;
    createdAt?: string;
    providerUserInfo?: Array<{
      providerId?: string;
      email?: string;
    }>;
  }>;
};

type FirebaseLookupUser = NonNullable<FirebaseLookupResult['users']>[number];

type AccountEmailForDeletion = {
  email: string;
};

function displayNameParts(displayName?: string) {
  const [firstName = '', ...rest] = (displayName ?? '').trim().split(' ').filter(Boolean);
  return { firstName, lastName: rest.join(' ') };
}

function sessionUserFromProfile(profile: FirebaseUserProfile) {
  const { firstName, lastName } = displayNameParts(profile.displayName);
  return {
    id: profile.uid,
    email: profile.email,
    firstName,
    lastName,
    createdAt: profile.createdAt,
    emailVerified: profile.emailVerified,
    connectedProviders: profile.providerIds,
  };
}

function sessionUserFromLookup(firebaseUser: FirebaseLookupUser) {
  const { firstName, lastName } = displayNameParts(firebaseUser.displayName);
  const primaryEmail = firebaseUser.providerUserInfo?.find((provider) => provider.providerId === 'password')?.email ?? firebaseUser.email;
  return {
    id: firebaseUser.localId,
    email: primaryEmail?.trim().toLowerCase() ?? '',
    firstName,
    lastName,
    createdAt: firebaseUser.createdAt ? new Date(Number(firebaseUser.createdAt)).toISOString() : new Date().toISOString(),
    emailVerified: firebaseUser.emailVerified ?? false,
    connectedProviders: firebaseUser.providerUserInfo?.map((provider) => provider.providerId).filter((providerId): providerId is string => Boolean(providerId)) ?? [],
  };
}

async function isConnectedAccountEmail(uid: string, email: string): Promise<boolean> {
  const result = await pool.query<{ id: string | number }>(
    `
      SELECT id
      FROM account_email_addresses
      WHERE firebase_uid = $1
        AND lower(email) = $2
        AND verified_at IS NOT NULL
      LIMIT 1;
    `,
    [uid, email.trim().toLowerCase()]
  );

  return Boolean(result.rows[0]);
}

async function lookupFirebaseUserByUid(uid: string): Promise<FirebaseLookupUser | null> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.firebaseWebApiKey ?? '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [uid] }),
  });

  const payload = (await response.json().catch(() => null)) as FirebaseLookupResult | null;
  return response.ok ? payload?.users?.[0] ?? null : null;
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim();
}

function routeError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'REQUEST_FAILED';
  const status = err instanceof ApiError ? err.status : 500;
  return res.status(status).json({ error: { message } });
}

authSessionRouter.get('/session', async (req: Request, res: Response) => {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: { message: 'AUTH_TOKEN_REQUIRED' } });
  }
  if (!config.firebaseWebApiKey) {
    return res.status(500).json({ error: { message: 'VITE_FIREBASE_API_KEY is required' } });
  }

  try {
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
      return res.status(401).json({ error: { message: 'INVALID_AUTH_TOKEN' } });
    }

    const loginUid = firebaseUser.localId;
    const email = firebaseUser.email.trim().toLowerCase();
    const userId = await resolvePrimaryUidForEmail(email, loginUid);
    const primaryProfile = userId !== loginUid ? await getFirebaseUserProfile(userId).catch(() => null) : null;
    const primaryLookupUser = !primaryProfile && userId !== loginUid ? await lookupFirebaseUserByUid(userId).catch(() => null) : null;
    const storedPrimaryEmail = await getAccountPrimaryEmail(userId).catch(() => null);
    const user = primaryProfile
      ? sessionUserFromProfile(primaryProfile)
      : primaryLookupUser
        ? sessionUserFromLookup(primaryLookupUser)
        : { ...sessionUserFromLookup(firebaseUser), id: userId };
    const connectedAliasLogin = await isConnectedAccountEmail(userId, email).catch(() => false);
    const primaryEmail =
      storedPrimaryEmail ??
      (!connectedAliasLogin ? await rememberAccountPrimaryEmail(userId, user.email).catch(() => user.email) : user.email);

    return res.json({
      userId,
      loginUid,
      email,
      user: { ...user, email: primaryEmail },
      linkedToPrimary: userId !== loginUid,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'REQUEST_FAILED';
    return res.status(400).json({ error: { message } });
  }
});

authSessionRouter.delete('/account', async (req: Request, res: Response) => {
  try {
    const token = bearerToken(req);
    if (!token) {
      throw new ApiError('AUTH_TOKEN_REQUIRED', 401);
    }
    const firebaseUser = await authenticatedFirebaseUser(req);
    const userId = await resolvePrimaryUidForEmail(firebaseUser.email, firebaseUser.uid);
    const primaryEmail = (await getAccountPrimaryEmail(userId).catch(() => null)) ?? firebaseUser.email;
    const confirmationEmail = String(req.body?.confirmationEmail ?? '').trim().toLowerCase();

    const accountEmails = await pool.query<AccountEmailForDeletion>(
      `
        SELECT email
        FROM account_email_addresses
        WHERE firebase_uid = $1
        UNION
        SELECT email
        FROM account_primary_emails
        WHERE firebase_uid = $1;
      `,
      [userId]
    );
    const emails = [firebaseUser.email, primaryEmail, ...accountEmails.rows.map((row) => row.email)];
    const acceptableConfirmationEmails = new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean));

    if (!acceptableConfirmationEmails.has(confirmationEmail)) {
      throw new ApiError('Type one of your account email addresses to confirm deletion.', 400);
    }

    await deleteAccountCascade({ userId, emails });
    await deleteCurrentFirebaseAuthUser(token);

    if (userId !== firebaseUser.uid) {
      await deleteFirebaseAuthUsers([userId]).catch((err) => {
        console.warn('[auth] Primary Firebase user cleanup failed after account deletion:', err);
      });
    }

    return res.json({ success: true });
  } catch (err) {
    return routeError(res, err);
  }
});
