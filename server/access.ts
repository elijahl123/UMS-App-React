import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import { pool } from './db';
import { ApiError } from './errors';
import { getFirebaseUserProfile } from './auth';
import { getBillingStatus, stripeClient, updateSubscriptionByStripeSubscription } from './billing';

export const UCD_ENTITLEMENT_KEY = 'ucd_autumn_2026';

export type AccessMode = 'full' | 'read_only' | 'billing_required';

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

export function isUcdEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return at > 0 && normalized.slice(at + 1) === config.ucdAccessDomain;
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
  const result = await pool.query<EntitlementRow>(
    `
      SELECT entitlement_key, qualifying_email, grant_source,
             starts_at::text, ends_at::text, grace_ends_at::text, granted_at::text
      FROM access_entitlements
      WHERE user_id = $1 AND entitlement_key = $2 AND revoked_at IS NULL
      LIMIT 1;
    `,
    [userId, UCD_ENTITLEMENT_KEY]
  );
  return result.rows[0] ?? null;
}

async function qualifyingEmail(userId: string): Promise<{ email: string; source: 'primary_email' | 'secondary_email' } | null> {
  try {
    const profile = await getFirebaseUserProfile(userId);
    if (profile.emailVerified && isUcdEmail(profile.email)) {
      return { email: profile.email, source: 'primary_email' };
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
    [userId, config.ucdAccessDomain]
  );
  return secondary.rows[0] ? { email: secondary.rows[0].email.toLowerCase(), source: 'secondary_email' } : null;
}

async function stopPaidRenewal(userId: string) {
  const billing = await getBillingStatus(userId);
  if (!billing.subscribed || !billing.stripeSubscriptionId || billing.cancelAtPeriodEnd) return null;
  try {
    const subscription = await stripeClient().subscriptions.update(billing.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await updateSubscriptionByStripeSubscription(subscription);
    return null;
  } catch (err) {
    console.error('[access] unable to stop paid renewal for UCD user', err);
    return 'We granted your UCD access, but could not stop your paid renewal. Contact support before your renewal date.';
  }
}

export async function reconcileUcdEntitlement(userId: string) {
  if (!config.ucdAccessEnabled) return { entitlement: await activeEntitlement(userId), billingWarning: null };
  const eligible = await qualifyingEmail(userId);
  if (!eligible) return { entitlement: await activeEntitlement(userId), billingWarning: null };

  const result = await pool.query<EntitlementRow>(
    `
      INSERT INTO access_entitlements (
        user_id, entitlement_key, qualifying_email, grant_source,
        starts_at, ends_at, grace_ends_at
      )
      VALUES ($1, $2, $3, $4, LEAST(NOW(), $5::timestamptz - INTERVAL '1 microsecond'), $5, $6)
      ON CONFLICT (user_id, entitlement_key) DO UPDATE SET
        qualifying_email = EXCLUDED.qualifying_email,
        grant_source = EXCLUDED.grant_source,
        ends_at = EXCLUDED.ends_at,
        grace_ends_at = EXCLUDED.grace_ends_at,
        revoked_at = NULL,
        updated_at = NOW()
      RETURNING entitlement_key, qualifying_email, grant_source,
                starts_at::text, ends_at::text, grace_ends_at::text, granted_at::text;
    `,
    [userId, UCD_ENTITLEMENT_KEY, eligible.email, eligible.source, config.ucdAccessEndAt, config.ucdAccessGraceEndAt]
  );
  await pool.query(
    `
      INSERT INTO ucd_onboarding (user_id, ucd_verified_at)
      VALUES ($1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        ucd_verified_at = COALESCE(ucd_onboarding.ucd_verified_at, NOW()),
        updated_at = NOW();
    `,
    [userId]
  );
  await pool.query(
    `
      INSERT INTO product_events (user_id, event_name, occurred_at, properties)
      VALUES
        ($1, 'ucd_verified', NOW(), '{}'::jsonb),
        ($1, 'onboarding_started', NOW(), '{}'::jsonb)
      ON CONFLICT DO NOTHING;
    `,
    [userId]
  );
  return { entitlement: result.rows[0], billingWarning: await stopPaidRenewal(userId) };
}

export async function getAccessStatus(userId: string, reconcile = true) {
  const reconciliation = reconcile ? await reconcileUcdEntitlement(userId) : { entitlement: await activeEntitlement(userId), billingWarning: null };
  const entitlement = reconciliation.entitlement;
  const billing = await getBillingStatus(userId);
  const now = Date.now();
  const entitlementActive = Boolean(
    entitlement && now >= new Date(entitlement.starts_at).getTime() && now < new Date(entitlement.ends_at).getTime()
  );
  const entitlementGrace = Boolean(
    entitlement && now >= new Date(entitlement.ends_at).getTime() && now < new Date(entitlement.grace_ends_at).getTime()
  );
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
    entitlement: entitlement
      ? {
          key: entitlement.entitlement_key,
          qualifyingEmail: entitlement.qualifying_email,
          grantSource: entitlement.grant_source,
          startsAt: entitlement.starts_at,
          endsAt: entitlement.ends_at,
          graceEndsAt: entitlement.grace_ends_at,
          grantedAt: entitlement.granted_at,
          active: entitlementActive,
          inGrace: entitlementGrace,
        }
      : null,
    billingWarning: reconciliation.billingWarning,
  };
}

export async function assertFullWriteAccess(userId: string) {
  const status = await getAccessStatus(userId);
  if (!status.canWrite) {
    throw new ApiError(status.accessMode === 'read_only' ? 'READ_ONLY_GRACE' : 'BILLING_REQUIRED', 403);
  }
  return status;
}

export async function assertContentReadAccess(userId: string) {
  const status = await getAccessStatus(userId);
  if (!status.canRead) {
    throw new ApiError('BILLING_REQUIRED', 403);
  }
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
