import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import sgMail from '@sendgrid/mail';
import { config } from '../config';
import { pool } from '../db';

const launchEventNames = new Set([
  'landing_cta_clicked',
  'ai_free_explainer_viewed',
  'signup_completed',
  'ucd_verified',
  'onboarding_started',
  'course_created',
  'onboarding_completed',
  'dashboard_opened',
  'import_started',
  'import_reviewed',
  'import_completed',
  'import_failed',
  'google_calendar_connected',
  'study_plan_created',
  'study_task_completed',
  'waitlist_requested',
  'waitlist_confirmed',
  'pwa_installed',
  'account_exported',
]);

const countPropertyNames = new Set(['savedCount', 'rejectedCount', 'correctedCount', 'errorCount']);
const propertyEnums: Record<string, Set<string>> = {
  sourceType: new Set(['google_calendar', 'brightspace_pdf']),
  targetType: new Set(['exam', 'assignment', 'project']),
  list: new Set(['ucd_incoming', 'ios']),
};

const attributionNames = ['source', 'campaign', 'ambassador', 'society', 'referral', 'launchSession'] as const;
const attributionPattern = /^[A-Za-z0-9._-]{1,64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailRetentionDeadline = new Date('2027-04-01T00:00:00Z');
const trustedLaunchOrigins = new Set([
  new URL(config.marketingOrigin).origin.toLowerCase(),
  new URL(config.appBaseUrl).origin.toLowerCase(),
]);

export function isTrustedLaunchOrigin(origin: string | undefined): boolean {
  return Boolean(origin && trustedLaunchOrigins.has(origin.toLowerCase()));
}

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function limited(windowMs: number, maximum: number) {
  return (req: Request, res: Response, next: () => void) => {
    const now = Date.now();
    if (rateBuckets.size > 5_000) {
      for (const [candidateKey, candidate] of rateBuckets) {
        if (candidate.resetAt <= now) rateBuckets.delete(candidateKey);
      }
    }
    const key = `${req.ip}:${req.path}`;
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maximum) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: { message: 'TOO_MANY_REQUESTS' } });
      return;
    }
    bucket.count += 1;
    next();
  };
}

function sanitizeValue(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return attributionPattern.test(text) ? text : null;
}

export function sanitizeLaunchAttribution(body: Record<string, unknown>) {
  return Object.fromEntries(attributionNames.map((name) => [name, sanitizeValue(body[name])]));
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function redirectToWaitlistResult(res: Response, result: 'confirmed' | 'unsubscribed' | 'invalid') {
  return res.redirect(303, `${config.marketingOrigin}/ucd/?waitlist=${result}`);
}

export function safeProperties(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean> = {};
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (countPropertyNames.has(key) && typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0 && candidate <= 100_000) {
      result[key] = candidate;
    } else if (typeof candidate === 'string' && propertyEnums[key]?.has(candidate)) {
      result[key] = candidate;
    }
  }
  return result;
}

export async function recordProductEvent(body: Record<string, unknown>, userId: string | null = null) {
  const eventName = typeof body.event === 'string' ? body.event : '';
  if (!launchEventNames.has(eventName)) return false;
  const occurredAt = new Date(typeof body.occurredAt === 'string' ? body.occurredAt : Date.now());
  if (Number.isNaN(occurredAt.getTime()) || Math.abs(Date.now() - occurredAt.getTime()) > 24 * 60 * 60 * 1000) return false;
  const attribution = sanitizeLaunchAttribution(body);
  await pool.query(
    `
      INSERT INTO product_events (
        user_id, launch_session, event_name, occurred_at, page,
        source, campaign, ambassador, society, referral, properties
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT DO NOTHING;
    `,
    [
      userId,
      attribution.launchSession,
      eventName,
      occurredAt.toISOString(),
      sanitizeValue(body.page),
      attribution.source,
      attribution.campaign,
      attribution.ambassador,
      attribution.society,
      attribution.referral,
      JSON.stringify(safeProperties(body.properties)),
    ]
  );
  return true;
}

async function sendWaitlistConfirmation(params: {
  email: string;
  list: 'ucd_incoming' | 'ios';
  confirmationToken: string;
  unsubscribeToken: string;
}) {
  if (!config.sendgridApiKey) throw new Error('SENDGRID_API_KEY is required');
  sgMail.setApiKey(config.sendgridApiKey);
  const listLabel = params.list === 'ios' ? 'iPhone app updates' : 'incoming UCD student waitlist';
  const confirmationUrl = `${config.appBaseUrl}/api/launch/waitlist/confirm?token=${encodeURIComponent(params.confirmationToken)}`;
  const unsubscribeUrl = `${config.appBaseUrl}/api/launch/waitlist/unsubscribe?token=${encodeURIComponent(params.unsubscribeToken)}`;
  await sgMail.send({
    to: params.email,
    from: { email: config.sendgridFromEmail, name: 'Untitled Management Software' },
    replyTo: 'untitledmanagementsoftware@gmail.com',
    subject: `Confirm your ${listLabel} signup`,
    text: `Confirm your place on the ${listLabel}: ${confirmationUrl}\n\nThis link expires in 48 hours. If you did not request this, ignore this email or cancel the request: ${unsubscribeUrl}`,
    html: `<p>Confirm your place on the ${listLabel}.</p><p><a href="${confirmationUrl}">Confirm my email</a></p><p>This link expires in 48 hours. If you did not request this, ignore this email or <a href="${unsubscribeUrl}">cancel the request</a>.</p>`,
  });
}

async function suppressUcdMarketing(email: string) {
  if (!config.sendgridApiKey) return;
  const response = await fetch(
    `https://api.sendgrid.com/v3/asm/groups/${config.sendgridUcdLaunchUnsubscribeGroupId}/suppressions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_emails: [email] }),
    }
  );
  if (!response.ok && response.status !== 409) {
    throw new Error(`SENDGRID_SUPPRESSION_FAILED_${response.status}`);
  }
}

export const launchRouter = Router();

launchRouter.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const origin = req.get('origin')?.toLowerCase();
  if (!isTrustedLaunchOrigin(origin)) {
    return res.status(403).json({ error: { message: 'LAUNCH_ORIGIN_NOT_ALLOWED' } });
  }
  if (!req.is('application/json')) {
    return res.status(415).json({ error: { message: 'JSON_CONTENT_TYPE_REQUIRED' } });
  }
  return next();
});

launchRouter.post('/events', limited(10 * 60 * 1000, 120), async (req, res) => {
  try {
    const accepted = await recordProductEvent(req.body ?? {});
    return accepted ? res.status(204).end() : res.status(400).json({ error: { message: 'INVALID_EVENT' } });
  } catch (err) {
    console.error('[launch] unable to record event', err);
    return res.status(500).json({ error: { message: 'EVENT_RECORD_FAILED' } });
  }
});

launchRouter.post('/waitlist', limited(60 * 60 * 1000, 10), async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const list = req.body?.list;
  const consent = req.body?.consent === true;
  if (!emailPattern.test(email) || !['ucd_incoming', 'ios'].includes(list) || !consent) {
    return res.status(400).json({ error: { message: 'INVALID_WAITLIST_REQUEST' } });
  }
  if (Date.now() >= emailRetentionDeadline.getTime()) {
    return res.status(410).json({ error: { message: 'WAITLIST_CLOSED' } });
  }

  const confirmationToken = randomToken();
  const unsubscribeToken = randomToken();
  const attribution = sanitizeLaunchAttribution(req.body ?? {});
  try {
    await pool.query(
      `
        INSERT INTO waitlist_subscriptions (
          email, list_key, consent, marketing_consent,
          confirmation_token_hash, confirmation_expires_at, unsubscribe_token_hash,
          source, campaign, ambassador, society, referral, launch_session, requested_at
        )
        VALUES ($1, $2, TRUE, $3, $4, NOW() + INTERVAL '48 hours', $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (email, list_key) DO UPDATE SET
          consent = TRUE,
          marketing_consent = EXCLUDED.marketing_consent,
          confirmation_token_hash = EXCLUDED.confirmation_token_hash,
          confirmation_expires_at = EXCLUDED.confirmation_expires_at,
          confirmed_at = NULL,
          unsubscribe_token_hash = EXCLUDED.unsubscribe_token_hash,
          unsubscribed_at = NULL,
          source = EXCLUDED.source,
          campaign = EXCLUDED.campaign,
          ambassador = EXCLUDED.ambassador,
          society = EXCLUDED.society,
          referral = EXCLUDED.referral,
          launch_session = EXCLUDED.launch_session,
          requested_at = NOW(),
          updated_at = NOW();
      `,
      [
        email,
        list,
        req.body?.marketingConsent === true,
        hashToken(confirmationToken),
        hashToken(unsubscribeToken),
        attribution.source,
        attribution.campaign,
        attribution.ambassador,
        attribution.society,
        attribution.referral,
        attribution.launchSession,
      ]
    );
    await sendWaitlistConfirmation({ email, list, confirmationToken, unsubscribeToken });
    await recordProductEvent({ ...req.body, event: 'waitlist_requested', occurredAt: new Date().toISOString(), properties: { list } });
    return res.status(202).json({ status: 'pending_confirmation' });
  } catch (err) {
    console.error('[launch] waitlist request failed', err);
    return res.status(500).json({ error: { message: 'WAITLIST_REQUEST_FAILED' } });
  }
});

launchRouter.get('/waitlist/confirm', limited(60 * 60 * 1000, 30), async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return redirectToWaitlistResult(res, 'invalid');
  try {
    const result = await pool.query<{ list_key: string; source: string | null; campaign: string | null; ambassador: string | null; society: string | null; referral: string | null; launch_session: string | null }>(
      `
        UPDATE waitlist_subscriptions
        SET confirmed_at = COALESCE(confirmed_at, NOW()),
            confirmation_token_hash = NULL,
            confirmation_expires_at = NULL,
            updated_at = NOW()
        WHERE confirmation_token_hash = $1
          AND confirmation_expires_at > NOW()
          AND unsubscribed_at IS NULL
        RETURNING list_key, source, campaign, ambassador, society, referral, launch_session;
      `,
      [hashToken(token)]
    );
    const row = result.rows[0];
    if (!row) return redirectToWaitlistResult(res, 'invalid');
    await recordProductEvent({
      event: 'waitlist_confirmed',
      occurredAt: new Date().toISOString(),
      source: row.source,
      campaign: row.campaign,
      ambassador: row.ambassador,
      society: row.society,
      referral: row.referral,
      launchSession: row.launch_session,
      properties: { list: row.list_key },
    });
    return redirectToWaitlistResult(res, 'confirmed');
  } catch (err) {
    console.error('[launch] waitlist confirmation failed', err);
    return redirectToWaitlistResult(res, 'invalid');
  }
});

launchRouter.get('/waitlist/unsubscribe', limited(60 * 60 * 1000, 30), async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return redirectToWaitlistResult(res, 'invalid');
  try {
    const match = await pool.query<{ id: string; email: string }>(
      `
        UPDATE waitlist_subscriptions
        SET consent = FALSE,
            marketing_consent = FALSE,
            unsubscribed_at = COALESCE(unsubscribed_at, NOW()),
            confirmation_token_hash = NULL,
            confirmation_expires_at = NULL,
            updated_at = NOW()
        WHERE unsubscribe_token_hash = $1
        RETURNING id::text, email;
      `,
      [hashToken(token)]
    );
    const row = match.rows[0];
    if (!row) return redirectToWaitlistResult(res, 'invalid');
    try {
      await suppressUcdMarketing(row.email);
    } catch (err) {
      console.error('[launch] SendGrid group suppression failed; local consent remains withdrawn', err);
    }
    await pool.query(`DELETE FROM waitlist_subscriptions WHERE id = $1::bigint`, [row.id]);
    return redirectToWaitlistResult(res, 'unsubscribed');
  } catch (err) {
    console.error('[launch] waitlist unsubscribe failed', err);
    return redirectToWaitlistResult(res, 'invalid');
  }
});
