import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import { config } from '../config';
import { pool } from '../db';
import { sendWaitlistConfirmationEmail } from '../mail';
import { limited } from '../rateLimit';

const launchEventNames = new Set([
  'landing_cta_clicked',
  'ai_free_explainer_viewed',
  'signup_completed',
  'ucd_verified',
  'palomar_verified',
  'onboarding_started',
  'course_created',
  'onboarding_completed',
  'onboarding_step_completed',
  'onboarding_step_deferred',
  'onboarding_skipped',
  'onboarding_resumed',
  'onboarding_checklist_dismissed',
  'dashboard_opened',
  'import_started',
  'import_reviewed',
  'import_completed',
  'import_failed',
  'google_calendar_connected',
  'study_plan_created',
  'study_task_completed',
  'study_recovery_previewed',
  'study_recovery_applied',
  'study_recovery_undone',
  'waitlist_requested',
  'waitlist_confirmed',
  'pwa_installed',
  'account_exported',
]);

const countPropertyNames = new Set([
  'savedCount', 'rejectedCount', 'correctedCount', 'errorCount',
  'movedCount', 'shortfallMinutes', 'unscheduledMinutes',
  'addedCapacityMinutes',
]);
const propertyEnums: Record<string, Set<string>> = {
  sourceType: new Set(['google_calendar', 'brightspace_pdf', 'canvas_ics']),
  targetType: new Set(['exam', 'assignment', 'project']),
  list: new Set(['ucd_incoming', 'palomar_incoming', 'ios']),
  step: new Set([
    'welcome', 'course', 'coursework', 'schedule', 'services', 'dashboard', 'calendar',
    'homework', 'class_schedule', 'notes', 'courses', 'navigation', 'account', 'complete',
  ]),
};

const attributionNames = ['source', 'campaign', 'ambassador', 'society', 'referral', 'launchSession'] as const;
const attributionPattern = /^[A-Za-z0-9._-]{1,64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const waitlistRetentionDeadline = new Date('2027-04-01T00:00:00Z');
const trustedLaunchOrigins = new Set([
  new URL(config.marketingOrigin).origin.toLowerCase(),
  new URL(config.appBaseUrl).origin.toLowerCase(),
]);

export function isTrustedLaunchOrigin(origin: string | undefined): boolean {
  return Boolean(origin && trustedLaunchOrigins.has(origin.toLowerCase()));
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

export type WaitlistKey = 'ucd_incoming' | 'palomar_incoming' | 'ios';

export function landingPageFor(sourceOrPage: string | null | undefined): 'ucd' | 'palomar' {
  return sourceOrPage === 'palomar_landing' || sourceOrPage === 'palomar' ? 'palomar' : 'ucd';
}

export function waitlistRequestIsValid(body: Record<string, unknown>): boolean {
  const email = String(body.email ?? '').trim().toLowerCase();
  const list = body.list as WaitlistKey;
  return emailPattern.test(email) && ['ucd_incoming', 'palomar_incoming', 'ios'].includes(list) && body.consent === true;
}

export function waitlistIsOpen(now = Date.now()): boolean {
  return now < waitlistRetentionDeadline.getTime();
}

export function suppressionGroupIdForWaitlist(list: WaitlistKey): number {
  if (list === 'palomar_incoming') return config.sendgridPalomarLaunchUnsubscribeGroupId;
  if (list === 'ucd_incoming') return config.sendgridUcdLaunchUnsubscribeGroupId;
  return 0;
}

function redirectToWaitlistResult(res: Response, result: 'confirmed' | 'unsubscribed' | 'invalid', sourceOrPage?: string | null) {
  return res.redirect(303, `${config.marketingOrigin}/${landingPageFor(sourceOrPage)}/?waitlist=${result}`);
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
  list: WaitlistKey;
  source: string | null;
  confirmationToken: string;
  unsubscribeToken: string;
}) {
  const page = landingPageFor(params.source);
  const confirmationUrl = `${config.appBaseUrl}/api/launch/waitlist/confirm?token=${encodeURIComponent(params.confirmationToken)}&page=${page}`;
  const unsubscribeUrl = `${config.appBaseUrl}/api/launch/waitlist/unsubscribe?token=${encodeURIComponent(params.unsubscribeToken)}&page=${page}`;
  await sendWaitlistConfirmationEmail({
    email: params.email,
    list: params.list,
    confirmationUrl,
    unsubscribeUrl,
  });
}

async function suppressLaunchMarketing(email: string, list: WaitlistKey) {
  const groupId = suppressionGroupIdForWaitlist(list);
  if (!config.sendgridApiKey || !groupId) return;
  const response = await fetch(
    `https://api.sendgrid.com/v3/asm/groups/${groupId}/suppressions`,
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

launchRouter.post('/events', limited(10 * 60 * 1000, 120, 'launch-events'), async (req, res) => {
  try {
    const accepted = await recordProductEvent(req.body ?? {});
    return accepted ? res.status(204).end() : res.status(400).json({ error: { message: 'INVALID_EVENT' } });
  } catch (err) {
    console.error('[launch] unable to record event', err);
    return res.status(500).json({ error: { message: 'EVENT_RECORD_FAILED' } });
  }
});

launchRouter.post('/waitlist', limited(60 * 60 * 1000, 10, 'launch-waitlist'), async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const list = req.body?.list as WaitlistKey;
  if (!waitlistRequestIsValid(req.body ?? {})) {
    return res.status(400).json({ error: { message: 'INVALID_WAITLIST_REQUEST' } });
  }
  if (!waitlistIsOpen()) {
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
    await sendWaitlistConfirmation({ email, list, source: attribution.source, confirmationToken, unsubscribeToken });
    await recordProductEvent({ ...req.body, event: 'waitlist_requested', occurredAt: new Date().toISOString(), properties: { list } });
    return res.status(202).json({ status: 'pending_confirmation' });
  } catch (err) {
    console.error('[launch] waitlist request failed', {
      errorCode: err instanceof Error ? err.name : 'UNKNOWN_ERROR',
    });
    return res.status(500).json({ error: { message: 'WAITLIST_REQUEST_FAILED' } });
  }
});

launchRouter.get('/waitlist/confirm', limited(60 * 60 * 1000, 30, 'launch-waitlist-confirm'), async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const page = typeof req.query.page === 'string' ? req.query.page : null;
  if (!token) return redirectToWaitlistResult(res, 'invalid', page);
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
    if (!row) return redirectToWaitlistResult(res, 'invalid', page);
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
    return redirectToWaitlistResult(res, 'confirmed', row.source);
  } catch (err) {
    console.error('[launch] waitlist confirmation failed', err);
    return redirectToWaitlistResult(res, 'invalid', page);
  }
});

launchRouter.get('/waitlist/unsubscribe', limited(60 * 60 * 1000, 30, 'launch-waitlist-unsubscribe'), async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const page = typeof req.query.page === 'string' ? req.query.page : null;
  if (!token) return redirectToWaitlistResult(res, 'invalid', page);
  try {
    const match = await pool.query<{ id: string; email: string; list_key: WaitlistKey; source: string | null }>(
      `
        UPDATE waitlist_subscriptions
        SET consent = FALSE,
            marketing_consent = FALSE,
            unsubscribed_at = COALESCE(unsubscribed_at, NOW()),
            confirmation_token_hash = NULL,
            confirmation_expires_at = NULL,
            updated_at = NOW()
        WHERE unsubscribe_token_hash = $1
        RETURNING id::text, email, list_key, source;
      `,
      [hashToken(token)]
    );
    const row = match.rows[0];
    if (!row) return redirectToWaitlistResult(res, 'invalid', page);
    try {
      await suppressLaunchMarketing(row.email, row.list_key);
    } catch (err) {
      console.error('[launch] SendGrid group suppression failed; local consent remains withdrawn', err);
    }
    await pool.query(`DELETE FROM waitlist_subscriptions WHERE id = $1::bigint`, [row.id]);
    return redirectToWaitlistResult(res, 'unsubscribed', row.source);
  } catch (err) {
    console.error('[launch] waitlist unsubscribe failed', err);
    return redirectToWaitlistResult(res, 'invalid', page);
  }
});
