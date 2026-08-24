-- Track Apple/RevenueCat-sourced subscriptions alongside the existing Stripe columns
-- on the same user_id-keyed row.
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS rc_app_user_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS rc_original_transaction_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS rc_product_id TEXT,
  ADD COLUMN IF NOT EXISTS rc_entitlement_id TEXT,
  ADD COLUMN IF NOT EXISTS rc_expiration_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rc_will_renew BOOLEAN,
  ADD COLUMN IF NOT EXISTS rc_environment TEXT;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_rc_app_user_id ON user_subscriptions (rc_app_user_id);
