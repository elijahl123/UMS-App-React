import { pool } from './db';

export interface AppleSubscriptionEvent {
  appUserId: string;
  email?: string | null;
  productId: string | null;
  entitlementId: string | null;
  originalTransactionId: string | null;
  expirationAtMs: number | null;
  willRenew: boolean | null;
  environment: 'PRODUCTION' | 'SANDBOX' | null;
  eventType: string;
}

const activeEventTypes = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);

export function mapRevenueCatStatus(event: AppleSubscriptionEvent): string {
  switch (event.eventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
      return 'active';
    case 'CANCELLATION':
      // Apple subscriptions stay entitled through the paid period after cancellation,
      // mirroring Stripe's cancel_at_period_end semantics.
      return 'active';
    case 'EXPIRATION':
      return 'canceled';
    case 'BILLING_ISSUE':
      return 'past_due';
    default:
      return activeEventTypes.has(event.eventType) ? 'active' : 'none';
  }
}

export async function upsertAppleSubscriptionForUser(params: {
  userId: string;
  email?: string | null;
  productId?: string | null;
  entitlementId?: string | null;
  originalTransactionId?: string | null;
  status: string;
  expirationAtMs?: number | null;
  willRenew?: boolean | null;
  environment?: string | null;
}) {
  await pool.query(
    `
      INSERT INTO user_subscriptions (
        user_id,
        email,
        provider,
        rc_app_user_id,
        rc_product_id,
        rc_entitlement_id,
        rc_original_transaction_id,
        status,
        rc_expiration_at,
        rc_will_renew,
        rc_environment
      )
      VALUES ($1, $2, 'apple', $1, $3, $4, $5, $6, CASE WHEN $7::bigint IS NULL THEN NULL ELSE to_timestamp($7::bigint / 1000.0) END, $8, $9)
      ON CONFLICT (user_id) DO UPDATE
      SET email = CASE WHEN EXCLUDED.email = '' THEN user_subscriptions.email ELSE EXCLUDED.email END,
          provider = 'apple',
          rc_app_user_id = EXCLUDED.rc_app_user_id,
          rc_product_id = COALESCE(EXCLUDED.rc_product_id, user_subscriptions.rc_product_id),
          rc_entitlement_id = COALESCE(EXCLUDED.rc_entitlement_id, user_subscriptions.rc_entitlement_id),
          rc_original_transaction_id = COALESCE(EXCLUDED.rc_original_transaction_id, user_subscriptions.rc_original_transaction_id),
          status = EXCLUDED.status,
          rc_expiration_at = EXCLUDED.rc_expiration_at,
          rc_will_renew = EXCLUDED.rc_will_renew,
          rc_environment = COALESCE(EXCLUDED.rc_environment, user_subscriptions.rc_environment),
          updated_at = NOW();
    `,
    [
      params.userId,
      params.email ?? '',
      params.productId ?? null,
      params.entitlementId ?? null,
      params.originalTransactionId ?? null,
      params.status,
      params.expirationAtMs ?? null,
      params.willRenew ?? null,
      params.environment ?? null,
    ]
  );
}

export async function updateSubscriptionByRevenueCatEvent(event: AppleSubscriptionEvent): Promise<string> {
  await upsertAppleSubscriptionForUser({
    userId: event.appUserId,
    email: event.email,
    productId: event.productId,
    entitlementId: event.entitlementId,
    originalTransactionId: event.originalTransactionId,
    status: mapRevenueCatStatus(event),
    expirationAtMs: event.expirationAtMs,
    willRenew: event.willRenew,
    environment: event.environment,
  });

  return event.appUserId;
}
