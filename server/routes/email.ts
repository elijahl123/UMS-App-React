import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { authenticatedFirebaseUser, firebaseAuth } from '../auth';
import { config } from '../config';
import { pool } from '../db';
import { ApiError } from '../errors';
import {
  sendFeedbackEmail,
  sendFirebaseVerificationEmail,
  sendPasswordResetEmail,
  sendSecondaryEmailVerification,
} from '../mail';
import { consumeRateLimit, hashRateLimitValue } from '../rateLimit';

export const emailRouter = Router();
export const publicEmailRouter = Router();

type AccountEmailRow = {
  id: string | number;
  email: string;
  source?: string;
  verified_at: string | null;
  verification_expires_at: string | null;
  created_at: string;
};

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
    source: row.source ?? 'email',
    verified: Boolean(row.verified_at),
    verifiedAt: row.verified_at,
    verificationExpiresAt: row.verification_expires_at,
    createdAt: row.created_at,
  };
}

async function sendAccountEmailVerification(email: string, token: string) {
  const verificationUrl = `${config.appBaseUrl}/#/verify-email?accountEmailToken=${encodeURIComponent(token)}`;
  await sendSecondaryEmailVerification(email, verificationUrl);
}

function handleRouteError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'REQUEST_FAILED';
  const status = err instanceof ApiError
    ? err.status
    : message === 'AUTH_TOKEN_REQUIRED' || message === 'INVALID_AUTH_TOKEN' ? 401 : 400;
  return res.status(status).json({ error: { message } });
}

function enforceRateLimit(res: Response, key: string, maximum: number): boolean {
  const retryAfter = consumeRateLimit(key, 60 * 60 * 1000, maximum);
  if (retryAfter === null) return true;
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({ error: { message: 'TOO_MANY_REQUESTS' } });
  return false;
}

function actionCodeSettings(route: 'verify-email' | 'reset-password') {
  return {
    url: `${config.appBaseUrl.replace(/\/+$/, '')}/#/${route}`,
    handleCodeInApp: false,
  };
}

export function appHostedFirebaseActionLink(firebaseLink: string): string {
  const generatedLink = new URL(firebaseLink);
  const appLink = new URL('/auth/action', `${config.appBaseUrl.replace(/\/+$/, '')}/`);

  // Firebase owns and validates the one-time code. Only replace the hosted
  // handler location, preserving every generated query parameter verbatim.
  appLink.search = generatedLink.search;
  return appLink.toString();
}

publicEmailRouter.post('/password-reset', async (req: Request, res: Response) => {
  let email: string;
  try {
    email = normalizeEmail(req.body?.email);
  } catch (err) {
    return handleRouteError(res, err);
  }

  const emailKey = hashRateLimitValue(email);
  if (!enforceRateLimit(res, `password-reset:ip:${req.ip}`, 10)
    || !enforceRateLimit(res, `password-reset:email:${emailKey}`, 3)) {
    return;
  }

  try {
    const firebaseLink = await firebaseAuth().generatePasswordResetLink(email, actionCodeSettings('reset-password'));
    const link = appHostedFirebaseActionLink(firebaseLink);
    await sendPasswordResetEmail(email, link);
  } catch (err) {
    console.error('[email]', {
      event: 'password_reset_request_failed',
      recipient: emailKey.slice(0, 16),
      errorCode: (err as { code?: string })?.code ?? (err instanceof Error ? err.name : 'UNKNOWN_ERROR'),
    });
  }

  return res.status(202).json({ status: 'accepted' });
});

publicEmailRouter.post('/verification', async (req: Request, res: Response) => {
  try {
    const authenticated = await authenticatedFirebaseUser(req);
    const user = await firebaseAuth().getUser(authenticated.uid);
    const email = user.email?.trim().toLowerCase();
    if (!email) {
      throw new ApiError('EMAIL_REQUIRED', 400);
    }
    if (user.emailVerified) {
      return res.json({ status: 'already_verified' });
    }

    const recipientKey = hashRateLimitValue(email);
    if (!enforceRateLimit(res, `email-verification:${authenticated.uid}:${recipientKey}`, 5)) {
      return;
    }

    try {
      const firebaseLink = await firebaseAuth().generateEmailVerificationLink(email, actionCodeSettings('verify-email'));
      const link = appHostedFirebaseActionLink(firebaseLink);
      await sendFirebaseVerificationEmail(email, link);
    } catch {
      throw new ApiError('EMAIL_DELIVERY_FAILED', 502);
    }
    return res.status(202).json({ status: 'accepted' });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

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

const FEEDBACK_MAX_LENGTH = 5000;

emailRouter.post('/feedback', async (req: Request, res: Response) => {
  try {
    const firebaseUser = await authenticatedFirebaseUser(req);
    if (!enforceRateLimit(res, `feedback:${firebaseUser.uid}`, 5)) {
      return;
    }

    const message = String(req.body?.message ?? '').trim();
    if (!message) {
      throw new ApiError('Feedback message is required.', 400);
    }
    if (message.length > FEEDBACK_MAX_LENGTH) {
      throw new ApiError(`Feedback message must be ${FEEDBACK_MAX_LENGTH} characters or fewer.`, 400);
    }

    const senderName = String(req.body?.name ?? '').trim().slice(0, 200) || undefined;

    try {
      await sendFeedbackEmail({ senderEmail: firebaseUser.email, senderName, message });
    } catch {
      throw new ApiError('EMAIL_DELIVERY_FAILED', 502);
    }

    return res.status(202).json({ status: 'accepted' });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

emailRouter.get('/account-addresses', async (req: Request, res: Response) => {
  try {
    const firebaseUser = await authenticatedFirebaseUser(req);
    const primaryEmailResult = await pool.query<{ email: string }>(
      `
        SELECT email
        FROM account_primary_emails
        WHERE firebase_uid = $1
        LIMIT 1;
      `,
      [firebaseUser.uid]
    );
    const result = await pool.query<AccountEmailRow>(
      `
        SELECT id, email, source, verified_at, verification_expires_at, created_at
        FROM account_email_addresses
        WHERE firebase_uid = $1
        ORDER BY verified_at NULLS LAST, created_at DESC;
      `,
      [firebaseUser.uid]
    );

    return res.json({
      primaryEmail: primaryEmailResult.rows[0]?.email ?? firebaseUser.email,
      loginEmail: firebaseUser.email,
      emails: result.rows.map(mapAccountEmail),
    });
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
    const recipientKey = hashRateLimitValue(email);
    if (!enforceRateLimit(res, `secondary-verification:${firebaseUser.uid}:${recipientKey}`, 5)) {
      return;
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
      try {
        await sendAccountEmailVerification(email, token);
      } catch {
        throw new ApiError('EMAIL_DELIVERY_FAILED', 502);
      }
    }

    return res.status(201).json({ email: mapAccountEmail(row) });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

emailRouter.post('/account-addresses/:id/resend', async (req: Request, res: Response) => {
  try {
    const firebaseUser = await authenticatedFirebaseUser(req);
    if (!enforceRateLimit(res, `secondary-verification:${firebaseUser.uid}:${req.params.id}`, 5)) {
      return;
    }
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

    try {
      await sendAccountEmailVerification(row.email, token);
    } catch {
      throw new ApiError('EMAIL_DELIVERY_FAILED', 502);
    }
    return res.json({ email: mapAccountEmail(row) });
  } catch (err) {
    return handleRouteError(res, err);
  }
});
