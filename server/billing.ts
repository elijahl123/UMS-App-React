import Stripe from 'stripe';
import { config } from './config';
import { pool } from './db';
import { ApiError } from './errors';

export type BillingInterval = 'monthly' | 'yearly';

export interface BillingPaymentMethod {
  id: string;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  wallet: string | null;
  billingName: string | null;
}

export const trialLengthDays = 14;
export const activeSubscriptionStatuses = new Set(['active', 'trialing']);

export function isSubscribed(status: string | null | undefined): boolean {
  return activeSubscriptionStatuses.has(status ?? '');
}

export function subscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  const withPeriod = subscription as Stripe.Subscription & { current_period_end?: number | null };
  return withPeriod.current_period_end ?? subscription.items.data[0]?.current_period_end ?? null;
}

export function stripeClient(): Stripe {
  if (!config.stripeSecretKey) {
    throw new ApiError('STRIPE_SECRET_KEY is required', 500);
  }

  return new Stripe(config.stripeSecretKey);
}

export function priceIdForInterval(interval: BillingInterval): string {
  const priceId = interval === 'yearly' ? config.stripeYearlyPriceId : config.stripeMonthlyPriceId;
  if (!priceId) {
    throw new ApiError(interval === 'yearly' ? 'STRIPE_YEARLY_PRICE_ID is required' : 'STRIPE_MONTHLY_PRICE_ID is required', 500);
  }
  return priceId;
}

export async function ensureBillingTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      stripe_customer_id TEXT UNIQUE,
      stripe_subscription_id TEXT UNIQUE,
      stripe_price_id TEXT,
      status TEXT NOT NULL DEFAULT 'none',
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      trial_started_at TIMESTAMPTZ,
      trial_ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE user_subscriptions
      ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_customer_id ON user_subscriptions (stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscription_id ON user_subscriptions (stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_trial_ends_at ON user_subscriptions (trial_ends_at);
  `);
}

function trialDaysRemaining(trialEndsAt: Date | string | null | undefined): number {
  if (!trialEndsAt) {
    return 0;
  }

  const endsAt = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  const millisecondsRemaining = endsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(millisecondsRemaining / (1000 * 60 * 60 * 24)));
}

function mapBillingStatus(row?: Record<string, unknown>) {
  const status = (row?.status as string | undefined) ?? 'none';
  const subscribed = isSubscribed(status);
  const trialStartedAt = (row?.trial_started_at as string | null | undefined) ?? null;
  const trialEndsAt = (row?.trial_ends_at as string | null | undefined) ?? null;
  const trialActive = Boolean(row?.trial_active);

  return {
    status,
    subscribed,
    currentPeriodEnd: (row?.current_period_end as string | null | undefined) ?? null,
    cancelAtPeriodEnd: (row?.cancel_at_period_end as boolean | undefined) ?? false,
    stripeSubscriptionId: (row?.stripe_subscription_id as string | null | undefined) ?? null,
    stripePriceId: (row?.stripe_price_id as string | null | undefined) ?? null,
    trialStartedAt,
    trialEndsAt,
    trialActive,
    trialDaysRemaining: trialDaysRemaining(trialEndsAt),
    hasAccess: subscribed || trialActive,
  };
}

export async function getOrCreateCustomer(params: { userId: string; email: string; name?: string | null }): Promise<string> {
  const existing = await pool.query(
    `
      SELECT stripe_customer_id
      FROM user_subscriptions
      WHERE user_id = $1;
    `,
    [params.userId]
  );

  const existingCustomerId = existing.rows[0]?.stripe_customer_id as string | undefined;
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const stripe = stripeClient();
  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name ?? undefined,
    metadata: {
      firebase_user_id: params.userId,
    },
  });

  await pool.query(
    `
      INSERT INTO user_subscriptions (user_id, email, stripe_customer_id, status)
      VALUES ($1, $2, $3, 'none')
      ON CONFLICT (user_id) DO UPDATE
      SET email = EXCLUDED.email,
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          updated_at = NOW();
    `,
    [params.userId, params.email, customer.id]
  );

  return customer.id;
}

export async function startTrialForUser(params: { userId: string; email: string }) {
  const result = await pool.query(
    `
      WITH existing AS (
        SELECT trial_started_at, status
        FROM user_subscriptions
        WHERE user_id = $1
      ),
      upserted AS (
        INSERT INTO user_subscriptions (user_id, email, status, trial_started_at, trial_ends_at)
        VALUES ($1, $2, 'none', NOW(), NOW() + ($3::text || ' days')::interval)
        ON CONFLICT (user_id) DO UPDATE
        SET email = EXCLUDED.email,
            trial_started_at = CASE
              WHEN user_subscriptions.trial_started_at IS NULL
                AND user_subscriptions.status <> ALL($4::text[])
                THEN EXCLUDED.trial_started_at
              ELSE user_subscriptions.trial_started_at
            END,
            trial_ends_at = CASE
              WHEN user_subscriptions.trial_ends_at IS NULL
                AND user_subscriptions.status <> ALL($4::text[])
                THEN EXCLUDED.trial_ends_at
              ELSE user_subscriptions.trial_ends_at
            END,
            updated_at = NOW()
        RETURNING user_id
      )
      SELECT EXISTS(SELECT 1 FROM upserted)
        AND NOT EXISTS(
          SELECT 1
          FROM existing
          WHERE trial_started_at IS NOT NULL
            OR status = ANY($4::text[])
        ) AS trial_started_now;
    `,
    [params.userId, params.email, trialLengthDays, Array.from(activeSubscriptionStatuses)]
  );

  const status = await getBillingStatus(params.userId);
  return {
    ...status,
    trialStartedNow: Boolean(result.rows[0]?.trial_started_now),
  };
}

export async function getBillingReference(userId: string): Promise<{ customerId: string | null; subscriptionId: string | null }> {
  const result = await pool.query(
    `
      SELECT stripe_customer_id, stripe_subscription_id
      FROM user_subscriptions
      WHERE user_id = $1;
    `,
    [userId]
  );

  const row = result.rows[0];
  return {
    customerId: (row?.stripe_customer_id as string | null | undefined) ?? null,
    subscriptionId: (row?.stripe_subscription_id as string | null | undefined) ?? null,
  };
}

export function formatPaymentMethod(paymentMethod: Stripe.PaymentMethod): BillingPaymentMethod {
  return {
    id: paymentMethod.id,
    type: paymentMethod.type,
    brand: paymentMethod.card?.brand ?? null,
    last4: paymentMethod.card?.last4 ?? null,
    expMonth: paymentMethod.card?.exp_month ?? null,
    expYear: paymentMethod.card?.exp_year ?? null,
    wallet: paymentMethod.card?.wallet?.type ?? null,
    billingName: paymentMethod.billing_details.name ?? null,
  };
}

function isPaymentMethod(value: Stripe.PaymentMethod | string | null | undefined): value is Stripe.PaymentMethod {
  return typeof value === 'object' && value !== null && value.object === 'payment_method';
}

async function retrievePaymentMethod(paymentMethod: Stripe.PaymentMethod | string | null | undefined): Promise<Stripe.PaymentMethod | null> {
  if (!paymentMethod) {
    return null;
  }

  if (isPaymentMethod(paymentMethod)) {
    return paymentMethod;
  }

  return stripeClient().paymentMethods.retrieve(paymentMethod);
}

export async function getDefaultPaymentMethodForUser(userId: string): Promise<BillingPaymentMethod | null> {
  const reference = await getBillingReference(userId);

  if (!reference.subscriptionId && !reference.customerId) {
    return null;
  }

  const stripe = stripeClient();

  if (reference.subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(reference.subscriptionId, {
      expand: ['default_payment_method'],
    });
    const paymentMethod = await retrievePaymentMethod(subscription.default_payment_method);
    if (paymentMethod) {
      return formatPaymentMethod(paymentMethod);
    }
  }

  if (!reference.customerId) {
    return null;
  }

  const customer = await stripe.customers.retrieve(reference.customerId, {
    expand: ['invoice_settings.default_payment_method'],
  });

  if ('deleted' in customer && customer.deleted) {
    return null;
  }

  const paymentMethod = await retrievePaymentMethod(customer.invoice_settings.default_payment_method);
  return paymentMethod ? formatPaymentMethod(paymentMethod) : null;
}

export async function upsertSubscriptionForUser(params: {
  userId: string;
  email: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  priceId?: string | null;
  status: string;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean | null;
}) {
  await pool.query(
    `
      INSERT INTO user_subscriptions (
        user_id,
        email,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        current_period_end,
        cancel_at_period_end
      )
      VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7::bigint IS NULL THEN NULL ELSE to_timestamp($7::bigint) END, COALESCE($8, FALSE))
      ON CONFLICT (user_id) DO UPDATE
      SET email = EXCLUDED.email,
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, user_subscriptions.stripe_customer_id),
          stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, user_subscriptions.stripe_subscription_id),
          stripe_price_id = COALESCE(EXCLUDED.stripe_price_id, user_subscriptions.stripe_price_id),
          status = EXCLUDED.status,
          current_period_end = EXCLUDED.current_period_end,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          updated_at = NOW();
    `,
    [
      params.userId,
      params.email,
      params.customerId ?? null,
      params.subscriptionId ?? null,
      params.priceId ?? null,
      params.status,
      params.currentPeriodEnd ?? null,
      params.cancelAtPeriodEnd ?? false,
    ]
  );
}

export async function updateSubscriptionByStripeSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const customer = typeof subscription.customer === 'string' ? await stripeClient().customers.retrieve(customerId) : subscription.customer;
  const deletedCustomer = 'deleted' in customer && customer.deleted;
  const userId = deletedCustomer ? undefined : customer.metadata?.firebase_user_id;
  const email = deletedCustomer ? undefined : customer.email;

  if (!userId || !email) {
    const existing = await pool.query(
      `
        UPDATE user_subscriptions
        SET stripe_subscription_id = $1,
            stripe_price_id = $2,
            status = $3,
            current_period_end = CASE WHEN $4::bigint IS NULL THEN NULL ELSE to_timestamp($4::bigint) END,
            cancel_at_period_end = $5,
            updated_at = NOW()
        WHERE stripe_customer_id = $6
        RETURNING user_id;
      `,
      [
        subscription.id,
        subscription.items.data[0]?.price.id ?? null,
        subscription.status,
        subscriptionPeriodEnd(subscription),
        subscription.cancel_at_period_end,
        customerId,
      ]
    );
    return existing.rows[0]?.user_id as string | undefined;
  }

  await upsertSubscriptionForUser({
    userId,
    email,
    customerId,
    subscriptionId: subscription.id,
    priceId: subscription.items.data[0]?.price.id ?? null,
    status: subscription.status,
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  return userId;
}

export async function getBillingStatus(userId: string) {
  const result = await pool.query(
    `
      SELECT user_id, email, stripe_customer_id, stripe_subscription_id, stripe_price_id, status,
             current_period_end::text AS current_period_end,
             cancel_at_period_end,
             trial_started_at::text AS trial_started_at,
             trial_ends_at::text AS trial_ends_at,
             trial_ends_at > NOW() AS trial_active
      FROM user_subscriptions
      WHERE user_id = $1;
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    return mapBillingStatus();
  }

  return mapBillingStatus(row);
}
