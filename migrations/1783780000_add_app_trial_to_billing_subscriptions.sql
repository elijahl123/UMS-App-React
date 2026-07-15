-- Add app-owned no-card trial tracking to billing subscriptions.
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_trial_ends_at ON user_subscriptions (trial_ends_at);
