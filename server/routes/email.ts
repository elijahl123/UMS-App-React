import { Router, type Request, type Response } from 'express';
import sgMail from '@sendgrid/mail';
import { randomBytes } from 'node:crypto';
import { config } from '../config';
import { pool } from '../db';
import { getAccountPrimaryEmail, getFirebaseUserProfile, rememberAccountPrimaryEmail, resolvePrimaryUidForEmail } from '../auth';

if (config.sendgridApiKey) {
  sgMail.setApiKey(config.sendgridApiKey);
}

export const emailRouter = Router();
export const publicEmailRouter = Router();

type AccountEmailRow = {
  id: string | number;
  email: string;
  source: string;
  verified_at: string | null;
  verification_expires_at: string | null;
  created_at: string;
};

type FirebaseLookupResult = {
  users?: Array<{
    localId: string;
    email?: string;
    providerUserInfo?: Array<{
      providerId?: string;
      email?: string;
    }>;
  }>;
};

type GoogleTokenInfoResult = {
  aud?: string;
  email?: string;
  email_verified?: boolean | string;
  iss?: string;
};

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim();
}

function normalizeEmail(value: unknown): string {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid email address is required.');
  }
  return email;
}

function mapAccountEmail(row: AccountEmailRow) {
  return {
    id: String(row.id),
    email: row.email,
    source: row.source,
    verified: Boolean(row.verified_at),
    verifiedAt: row.verified_at,
    verificationExpiresAt: row.verification_expires_at,
    createdAt: row.created_at,
  };
}

function primaryEmailFromFirebaseLookupUser(user: NonNullable<FirebaseLookupResult['users']>[number]): string | null {
  const email = user.providerUserInfo?.find((provider) => provider.providerId === 'password')?.email ?? user.email;
  return email ? email.trim().toLowerCase() : null;
}

async function verifiedGoogleEmail(idToken: unknown): Promise<string> {
  const token = String(idToken ?? '').trim();
  if (!token) {
    throw new Error('Google ID token is required.');
  }
  if (!config.googleClientId || config.googleClientId.startsWith('YOUR_GOOGLE_OAUTH_CLIENT_ID')) {
    throw new Error('Google sign-in is not configured yet for this app.');
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  const payload = (await response.json().catch(() => null)) as GoogleTokenInfoResult | null;
  if (!response.ok || !payload?.email) {
    throw new Error('Unable to verify that Google account.');
  }
  if (payload.aud !== config.googleClientId) {
    throw new Error('Google account was issued for a different app.');
  }
  if (payload.iss && payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw new Error('Google account issuer is invalid.');
  }
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new Error('That Google account email is not verified.');
  }

  return normalizeEmail(payload.email);
}

async function emailConnectedToAnotherUser(firebaseUid: string, email: string): Promise<boolean> {
  const result = await pool.query<{ id: string | number }>(
    `
      SELECT id
      FROM account_email_addresses
      WHERE lower(email) = $1
        AND firebase_uid <> $2
        AND verified_at IS NOT NULL
      LIMIT 1;
    `,
    [email.toLowerCase(), firebaseUid]
  );

  return Boolean(result.rows[0]);
}

async function lookupFirebaseUserEmailByUid(uid: string): Promise<string | null> {
  if (!config.firebaseWebApiKey) {
    return null;
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.firebaseWebApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: [uid] }),
    }
  );

  const payload = (await response.json().catch(() => null)) as FirebaseLookupResult | null;
  const user = payload?.users?.[0];
  return response.ok && user ? primaryEmailFromFirebaseLookupUser(user) : null;
}

async function primaryEmailForUser(uid: string, fallbackEmail: string): Promise<string> {
  const storedPrimaryEmail = await getAccountPrimaryEmail(uid).catch(() => null);
  if (storedPrimaryEmail) {
    return storedPrimaryEmail;
  }

  const adminProfile = await getFirebaseUserProfile(uid).catch(() => null);
  if (adminProfile?.email) {
    return adminProfile.email;
  }

  return (await lookupFirebaseUserEmailByUid(uid)) ?? fallbackEmail;
}

async function authenticatedFirebaseUser(req: Request) {
  if (req.auth?.uid && req.auth.email) {
    const primaryEmail = await primaryEmailForUser(req.auth.uid, req.auth.email);
    return { uid: req.auth.uid, email: primaryEmail, loginEmail: req.auth.loginEmail ?? req.auth.email };
  }

  const token = bearerToken(req);
  if (!token) {
    throw new Error('AUTH_TOKEN_REQUIRED');
  }
  if (!config.firebaseWebApiKey) {
    throw new Error('VITE_FIREBASE_API_KEY is required');
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
  if (!response.ok || !payload?.users?.[0]) {
    throw new Error('INVALID_AUTH_TOKEN');
  }

  const firebaseUser = payload.users[0];
  if (!firebaseUser.email) {
    throw new Error('EMAIL_REQUIRED');
  }

  const email = firebaseUser.email.trim().toLowerCase();
  const uid = await resolvePrimaryUidForEmail(email, firebaseUser.localId);
  const primaryEmail = await primaryEmailForUser(uid, primaryEmailFromFirebaseLookupUser(firebaseUser) ?? email);
  return { uid, email: primaryEmail, loginEmail: email };
}

async function sendAccountEmailVerification(email: string, token: string) {
  if (!config.sendgridApiKey) {
    throw new Error('SENDGRID_API_KEY is required');
  }

  const verificationUrl = `${config.appBaseUrl}/#/verify-email?accountEmailToken=${encodeURIComponent(token)}`;
  await sgMail.send({
    to: email,
    from: config.sendgridFromEmail,
    subject: 'Verify this email address',
    text: `Verify this email address for Untitled Management Software: ${verificationUrl}`,
    html: `<p>Verify this email address for Untitled Management Software.</p><p><a href="${verificationUrl}">Verify email address</a></p>`,
  });
}

function handleRouteError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'REQUEST_FAILED';
  const status = message === 'AUTH_TOKEN_REQUIRED' || message === 'INVALID_AUTH_TOKEN' ? 401 : 400;
  return res.status(status).json({ error: { message } });
}

publicEmailRouter.post('/account-addresses/verify', async (req: Request, res: Response) => {
  const token = String(req.body?.token ?? '').trim();
  if (!token) {
    return res.status(400).json({ error: { message: 'Verification token is required.' } });
  }

  try {
    const pending = await pool.query<{ id: string | number; firebase_uid: string; email: string }>(
      `
        SELECT id, firebase_uid, email
        FROM account_email_addresses
        WHERE verification_token = $1
          AND verification_expires_at > NOW();
      `,
      [token]
    );

    const pendingRow = pending.rows[0];
    if (!pendingRow) {
      return res.status(400).json({ error: { message: 'This verification link is invalid or has expired.' } });
    }
    if (await emailConnectedToAnotherUser(pendingRow.firebase_uid, pendingRow.email)) {
      return res.status(409).json({ error: { message: 'That email is already connected to another account.' } });
    }

    const result = await pool.query<AccountEmailRow>(
      `
        UPDATE account_email_addresses
        SET verified_at = COALESCE(verified_at, NOW()),
            verification_token = NULL,
            verification_expires_at = NULL,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, source, verified_at, verification_expires_at, created_at;
      `,
      [pendingRow.id]
    );

    const row = result.rows[0];
    return res.json({ email: mapAccountEmail(row) });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

emailRouter.post('/send', async (req: Request, res: Response) => {
  if (!config.sendgridApiKey) {
    return res.status(500).json({ error: { message: 'SENDGRID_API_KEY is required' } });
  }

  try {
    await sgMail.send(req.body);
    return res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SENDGRID_SEND_FAILED';
    return res.status(500).json({ error: { message } });
  }
});

emailRouter.get('/account-addresses', async (req: Request, res: Response) => {
  try {
    const firebaseUser = await authenticatedFirebaseUser(req);
    const result = await pool.query<AccountEmailRow>(
      `
        SELECT id, email, source, verified_at, verification_expires_at, created_at
        FROM account_email_addresses
        WHERE firebase_uid = $1
        ORDER BY verified_at NULLS LAST, created_at DESC;
      `,
      [firebaseUser.uid]
    );

    return res.json({ primaryEmail: firebaseUser.email, loginEmail: firebaseUser.loginEmail, emails: result.rows.map(mapAccountEmail) });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

emailRouter.post('/account-addresses', async (req: Request, res: Response) => {
  try {
    const firebaseUser = await authenticatedFirebaseUser(req);
    const email = normalizeEmail(req.body?.email);
    if (email === firebaseUser.email) {
      return res.status(400).json({ error: { message: 'That email is already your primary email.' } });
    }
    if (await emailConnectedToAnotherUser(firebaseUser.uid, email)) {
      return res.status(409).json({ error: { message: 'That email is already connected to another account.' } });
    }

    const token = randomBytes(32).toString('hex');
    const result = await pool.query<AccountEmailRow>(
      `
        INSERT INTO account_email_addresses (firebase_uid, email, source, verification_token, verification_expires_at)
        VALUES ($1, $2, 'email', $3, NOW() + INTERVAL '24 hours')
        ON CONFLICT (firebase_uid, email) DO UPDATE
        SET source = CASE
              WHEN account_email_addresses.verified_at IS NULL THEN 'email'
              ELSE account_email_addresses.source
            END,
            verification_token = CASE
              WHEN account_email_addresses.verified_at IS NULL THEN EXCLUDED.verification_token
              ELSE account_email_addresses.verification_token
            END,
            verification_expires_at = CASE
              WHEN account_email_addresses.verified_at IS NULL THEN EXCLUDED.verification_expires_at
              ELSE account_email_addresses.verification_expires_at
            END,
            updated_at = NOW()
        RETURNING id, email, source, verified_at, verification_expires_at, created_at;
      `,
      [firebaseUser.uid, email, token]
    );

    const row = result.rows[0];
    if (!row.verified_at) {
      await sendAccountEmailVerification(email, token);
    }

    return res.status(201).json({ email: mapAccountEmail(row) });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

emailRouter.post('/account-addresses/:id/resend', async (req: Request, res: Response) => {
  try {
    const firebaseUser = await authenticatedFirebaseUser(req);
    const token = randomBytes(32).toString('hex');
    const result = await pool.query<AccountEmailRow>(
      `
        UPDATE account_email_addresses
        SET verification_token = $3,
            verification_expires_at = NOW() + INTERVAL '24 hours',
            updated_at = NOW()
        WHERE firebase_uid = $1
          AND id = $2
          AND verified_at IS NULL
        RETURNING id, email, source, verified_at, verification_expires_at, created_at;
      `,
      [firebaseUser.uid, req.params.id, token]
    );

    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: { message: 'Email address was not found or is already verified.' } });
    }

    await sendAccountEmailVerification(row.email, token);
    return res.json({ email: mapAccountEmail(row) });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

emailRouter.post('/account-addresses/google', async (req: Request, res: Response) => {
  try {
    const firebaseUser = await authenticatedFirebaseUser(req);
    const email = await verifiedGoogleEmail(req.body?.idToken);
    if (email === firebaseUser.email) {
      await rememberAccountPrimaryEmail(firebaseUser.uid, firebaseUser.email).catch(() => null);
      return res.status(200).json({ email: null, primary: true });
    }
    if (await emailConnectedToAnotherUser(firebaseUser.uid, email)) {
      return res.status(409).json({ error: { message: 'That Google account is already connected to another account.' } });
    }
    await rememberAccountPrimaryEmail(firebaseUser.uid, firebaseUser.email).catch(() => null);

    const result = await pool.query<AccountEmailRow>(
      `
        INSERT INTO account_email_addresses (firebase_uid, email, source, verified_at)
        VALUES ($1, $2, 'google', NOW())
        ON CONFLICT (firebase_uid, email) DO UPDATE
        SET source = 'google',
            verified_at = COALESCE(account_email_addresses.verified_at, NOW()),
            verification_token = NULL,
            verification_expires_at = NULL,
            updated_at = NOW()
        RETURNING id, email, source, verified_at, verification_expires_at, created_at;
      `,
      [firebaseUser.uid, email]
    );

    return res.status(201).json({ email: mapAccountEmail(result.rows[0]), primary: false });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

emailRouter.delete('/account-addresses/:id', async (req: Request, res: Response) => {
  try {
    const firebaseUser = await authenticatedFirebaseUser(req);
    const result = await pool.query<AccountEmailRow>(
      `
        DELETE FROM account_email_addresses
        WHERE firebase_uid = $1
          AND id = $2
        RETURNING id, email, source, verified_at, verification_expires_at, created_at;
      `,
      [firebaseUser.uid, req.params.id]
    );

    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: { message: 'Email address was not found.' } });
    }

    return res.json({ email: mapAccountEmail(row) });
  } catch (err) {
    return handleRouteError(res, err);
  }
});
