import { Router, type Request, type Response } from 'express';
import sgMail from '@sendgrid/mail';
import { randomBytes } from 'node:crypto';
import { config } from '../config';
import { pool } from '../db';

if (config.sendgridApiKey) {
  sgMail.setApiKey(config.sendgridApiKey);
}

export const emailRouter = Router();
export const publicEmailRouter = Router();

type AccountEmailRow = {
  id: string | number;
  email: string;
  verified_at: string | null;
  verification_expires_at: string | null;
  created_at: string;
};

type FirebaseLookupResult = {
  users?: Array<{
    localId: string;
    email?: string;
  }>;
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
    verified: Boolean(row.verified_at),
    verifiedAt: row.verified_at,
    verificationExpiresAt: row.verification_expires_at,
    createdAt: row.created_at,
  };
}

async function authenticatedFirebaseUser(req: Request) {
  if (req.auth?.uid && req.auth.email) {
    return { uid: req.auth.uid, email: req.auth.email };
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

  return { uid: firebaseUser.localId, email: firebaseUser.email.trim().toLowerCase() };
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
    const result = await pool.query<AccountEmailRow>(
      `
        UPDATE account_email_addresses
        SET verified_at = COALESCE(verified_at, NOW()),
            verification_token = NULL,
            verification_expires_at = NULL,
            updated_at = NOW()
        WHERE verification_token = $1
          AND verification_expires_at > NOW()
        RETURNING id, email, verified_at, verification_expires_at, created_at;
      `,
      [token]
    );

    const row = result.rows[0];
    if (!row) {
      return res.status(400).json({ error: { message: 'This verification link is invalid or has expired.' } });
    }

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
        SELECT id, email, verified_at, verification_expires_at, created_at
        FROM account_email_addresses
        WHERE firebase_uid = $1
        ORDER BY verified_at NULLS LAST, created_at DESC;
      `,
      [firebaseUser.uid]
    );

    return res.json({ emails: result.rows.map(mapAccountEmail) });
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

    const token = randomBytes(32).toString('hex');
    const result = await pool.query<AccountEmailRow>(
      `
        INSERT INTO account_email_addresses (firebase_uid, email, verification_token, verification_expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
        ON CONFLICT (firebase_uid, email) DO UPDATE
        SET verification_token = CASE
              WHEN account_email_addresses.verified_at IS NULL THEN EXCLUDED.verification_token
              ELSE account_email_addresses.verification_token
            END,
            verification_expires_at = CASE
              WHEN account_email_addresses.verified_at IS NULL THEN EXCLUDED.verification_expires_at
              ELSE account_email_addresses.verification_expires_at
            END,
            updated_at = NOW()
        RETURNING id, email, verified_at, verification_expires_at, created_at;
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
        RETURNING id, email, verified_at, verification_expires_at, created_at;
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
