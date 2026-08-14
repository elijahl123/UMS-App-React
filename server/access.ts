import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import { pool } from './db';
import { ApiError } from './errors';
import { getFirebaseUserProfile } from './auth';
import { getBillingStatus, stripeClient, updateSubscriptionByStripeSubscription } from './billing';

export const UCD_ENTITLEMENT_KEY = 'ucd_autumn_2026';
export const PALOMAR_ENTITLEMENT_KEY = 'palomar_autumn_2026';

export type InstitutionKey = 'ucd' | 'palomar';
export type AccessMode = 'full' | 'read_only' | 'billing_required';

export type InstitutionProgram = {
  key: InstitutionKey;
  name: string;
  source: 'ucd_landing' | 'palomar_landing';
  incomingList: 'ucd_incoming' | 'palomar_incoming';
  emailDomain: string;
  entitlementKey: string;
  enabled: boolean;
  endsAt: string;
  graceEndsAt: string;
};

export function institutionPrograms(): InstitutionProgram[] {
  return [
    {
      key: 'ucd', name: 'UCD', source: 'ucd_landing', incomingList: 'ucd_incoming',
      emailDomain: config.ucdAccessDomain, entitlementKey: UCD_ENTITLEMENT_KEY,
      enabled: config.ucdAccessEnabled, endsAt: config.ucdAccessEndAt, graceEndsAt: config.ucdAccessGraceEndAt,
    },
    {
      key: 'palomar', name: 'Palomar', source: 'palomar_landing', incomingList: 'palomar_incoming',
      emailDomain: config.palomarAccessDomain, entitlementKey: PALOMAR_ENTITLEMENT_KEY,
      enabled: config.palomarAccessEnabled, endsAt: config.palomarAccessEndAt, graceEndsAt: config.palomarAccessGraceEndAt,
    },
  ];
}

export function institutionForSource(source: string | null | undefined): InstitutionProgram | null {
  return institutionPrograms().find((program) => program.source === source) ?? null;
}

export function institutionForEntitlement(entitlementKey: string): InstitutionProgram | null {
  return institutionPrograms().find((program) => program.entitlementKey === entitlementKey) ?? null;
}

function exactEmailDomain(email: string, domain: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return at > 0 && normalized.slice(at + 1) === domain;
}

export function isUcdEmail(email: string): boolean {
  return exactEmailDomain(email, config.ucdAccessDomain);
}

export function isPalomarEmail(email: string): boolean {
  return exactEmailDomain(email, config.palomarAccessDomain);
}

export function isInstitutionEmail(email: string): boolean {
  return institutionPrograms().some((program) => exactEmailDomain(email, program.emailDomain));
}

export function shouldSuppressInstitutionTrial(params: {
  hasEntitlement: boolean;
  email: string;
  matchedJourney: boolean;
}): boolean {
  return params.hasEntitlement || isInstitutionEmail(params.email) || params.matchedJourney;
}

export function resolveAccessMode(params: {
  now: number;
  subscribed: boolean;
  trialActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  graceEndsAt?: string | null;
}): AccessMode {
  if (params.subscribed || params.trialActive) return 'full';
  if (!params.startsAt || !params.endsAt || !params.graceEndsAt) return 'billing_required';
  const startsAt = new Date(params.startsAt).getTime();
  const endsAt = new Date(params.endsAt).getTime();
  const graceEndsAt = new Date(params.graceEndsAt).getTime();
  if (params.now >= startsAt && params.now < endsAt) return 'full';
  if (params.now >= endsAt && params.now < graceEndsAt) return 'read_only';
  return 'billing_required';
}

type EntitlementRow = {
  entitlement_key: string;
  qualifying_email: string;
  grant_source: 'primary_email' | 'secondary_email' | 'admin';
  starts_at: string;
  ends_at: string;
  grace_ends_at: string;
  granted_at: string;
};

async function activeEntitlement(userId: string): Promise<EntitlementRow | null> {
  const keys = institutionPrograms().map((program) => program.entitlementKey);
  const result = await pool.query<EntitlementRow>(
    `
      SELECT entitlement_key, qualifying_email, grant_source,
             starts_at::text, ends_at::text, grace_ends_at::text, granted_at::text
      FROM access_entitlements
      WHERE user_id = $1 AND entitlement_key = ANY($2::text[]) AND revoked_at IS NULL
      ORDER BY
        CASE WHEN NOW() < ends_at THEN 0 WHEN NOW() < grace_ends_at THEN 1 ELSE 2 END,
        grace_ends_at DESC,
        granted_at ASC
      LIMIT 1;
    `,
    [userId, keys]
  );
  return result.rows[0] ?? null;
}

async function qualifyingEmail(userId: string, program: InstitutionProgram): Promise<{ email: string; source: 'primary_email' | 'secondary_email' } | null> {
  try {
    const profile = await getFirebaseUserProfile(userId);
    if (profile.emailVerified && exactEmailDomain(profile.email, program.emailDomain)) {
      return { email: profile.email.toLowerCase(), source: 'primary_email' };
    }
  } catch (err) {
    console.warn('[access] unable to inspect Firebase primary email', err);
  }

  const secondary = await pool.query<{ email: string }>(
    `
      SELECT email
      FROM account_email_addresses
      WHERE firebase_uid = $1
        AND verified_at IS NOT NULL
        AND lower(split_part(email, '@', 2)) = $2
        AND position('@' in email) > 1
      ORDER BY verified_at
      LIMIT 1;
    `,
    [userId, program.emailDomain]
  );
  return secondary.rows[0] ? { email: secondary.rows[0].email.toLowerCase(), source: 'secondary_email' } : null;
}

async function stopPaidRenewal(userId: string) {
  const billing = await getBillingStatus(userId);
  if (!billing.subscribed || !billing.stripeSubscriptionId || billing.cancelAtPeriodEnd) return null;
  try {
    const subscription = await stripeClient().subscriptions.update(billing.stripeSubscriptionId, { cancel_at_period_end: true });
    await updateSubscriptionByStripeSubscription(subscription);
    return null;
  } catch (err) {
    console.error('[access] unable to stop paid renewal for student-access user', err);
    return 'We granted your student access, but could not stop your paid renewal. Contact support before your renewal date.';
  }
}

async function grantInstitutionEntitlement(
  userId: string,
  program: InstitutionProgram,
  eligible: { email: string; source: 'primary_email' | 'secondary_email' }
) {
  await pool.query(
    `
      INSERT INTO access_entitlements (
        user_id, entitlement_key, qualifying_email, grant_source, starts_at, ends_at, grace_ends_at
      )
      VALUES ($1, $2, $3, $4, LEAST(NOW(), $5::timestamptz - INTERVAL '1 microsecond'), $5, $6)
      ON CONFLICT (user_id, entitlement_key) DO UPDATE SET
        qualifying_email = EXCLUDED.qualifying_email,
        grant_source = EXCLUDED.grant_source,
        ends_at = EXCLUDED.ends_at,
        grace_ends_at = EXCLUDED.grace_ends_at,
        revoked_at = NULL,
        updated_at = NOW();
    `,
    [userId, program.entitlementKey, eligible.email, eligible.source, program.endsAt, program.graceEndsAt]
  );
  await pool.query(
    `
      INSERT INTO launch_onboarding (user_id, institution_key, institution_verified_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        institution_key = COALESCE(launch_onboarding.institution_key, EXCLUDED.institution_key),
        institution_verified_at = COALESCE(launch_onboarding.institution_verified_at, NOW()),
        updated_at = NOW();
    `,
    [userId, program.key]
  );
  await pool.query(
    `
      INSERT INTO product_events (user_id, event_name, occurred_at, properties)
      VALUES
        ($1, $2, NOW(), jsonb_build_object('institution', $3::text)),
        ($1, 'onboarding_started', NOW(), '{}'::jsonb)
      ON CONFLICT DO NOTHING;
    `,
    [userId, `${program.key}_verified`, program.key]
  );
}

export async function reconcileInstitutionEntitlements(userId: string) {
  let granted = false;
  for (const program of institutionPrograms()) {
    if (!program.enabled) continue;
    const eligible = await qualifyingEmail(userId, program);
    if (!eligible) continue;
    await grantInstitutionEntitlement(userId, program, eligible);
    granted = true;
  }
  return { entitlement: await activeEntitlement(userId), billingWarning: granted ? await stopPaidRenewal(userId) : null };
}

// Backwards-compatible export for existing integrations and tests.
export const reconcileUcdEntitlement = reconcileInstitutionEntitlements;

export async function getAccessStatus(userId: string, reconcile = true) {
  const reconciliation = reconcile
    ? await reconcileInstitutionEntitlements(userId)
    : { entitlement: await activeEntitlement(userId), billingWarning: null };
  const entitlement = reconciliation.entitlement;
  const institution = entitlement ? institutionForEntitlement(entitlement.entitlement_key) : null;
  const billing = await getBillingStatus(userId);
  const now = Date.now();
  const entitlementActive = Boolean(entitlement && now >= new Date(entitlement.starts_at).getTime() && now < new Date(entitlement.ends_at).getTime());
  const entitlementGrace = Boolean(entitlement && now >= new Date(entitlement.ends_at).getTime() && now < new Date(entitlement.grace_ends_at).getTime());
  const mode = resolveAccessMode({
    now,
    subscribed: billing.subscribed,
    trialActive: billing.trialActive,
    startsAt: entitlement?.starts_at,
    endsAt: entitlement?.ends_at,
    graceEndsAt: entitlement?.grace_ends_at,
  });
  return {
    ...billing,
    hasAccess: mode !== 'billing_required',
    accessMode: mode,
    canRead: mode !== 'billing_required',
    canWrite: mode === 'full',
    canExport: true,
    entitlement: entitlement ? {
      key: entitlement.entitlement_key,
      institutionKey: institution?.key ?? null,
      institutionName: institution?.name ?? 'Student',
      qualifyingEmail: entitlement.qualifying_email,
      grantSource: entitlement.grant_source,
      startsAt: entitlement.starts_at,
      endsAt: entitlement.ends_at,
      graceEndsAt: entitlement.grace_ends_at,
      grantedAt: entitlement.granted_at,
      active: entitlementActive,
      inGrace: entitlementGrace,
    } : null,
    billingWarning: reconciliation.billingWarning,
  };
}

export async function assertFullWriteAccess(userId: string) {
  const status = await getAccessStatus(userId);
  if (!status.canWrite) throw new ApiError(status.accessMode === 'read_only' ? 'READ_ONLY_GRACE' : 'BILLING_REQUIRED', 403);
  return status;
}

export async function assertContentReadAccess(userId: string) {
  const status = await getAccessStatus(userId);
  if (!status.canRead) throw new ApiError('BILLING_REQUIRED', 403);
  return status;
}

function accessMiddleware(check: (userId: string) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth?.uid) throw new ApiError('AUTH_TOKEN_REQUIRED', 401);
      await check(req.auth.uid);
      return next();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'ACCESS_CHECK_FAILED';
      return res.status(status).json({ error: { message } });
    }
  };
}

export const requireContentReadAccess = accessMiddleware(assertContentReadAccess);
export const requireFullWriteAccess = accessMiddleware(assertFullWriteAccess);
