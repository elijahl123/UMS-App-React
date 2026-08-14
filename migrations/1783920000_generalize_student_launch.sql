DO $$
BEGIN
  IF to_regclass('public.ucd_onboarding') IS NOT NULL
     AND to_regclass('public.launch_onboarding') IS NULL THEN
    ALTER TABLE ucd_onboarding RENAME TO launch_onboarding;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'launch_onboarding' AND column_name = 'ucd_verified_at'
  ) THEN
    ALTER TABLE launch_onboarding RENAME COLUMN ucd_verified_at TO institution_verified_at;
  END IF;
END $$;

ALTER TABLE launch_onboarding
  ADD COLUMN IF NOT EXISTS institution_key TEXT;

UPDATE launch_onboarding
SET institution_key = 'ucd'
WHERE institution_key IS NULL AND institution_verified_at IS NOT NULL;

ALTER TABLE launch_onboarding
  DROP CONSTRAINT IF EXISTS launch_onboarding_institution_key_check;

ALTER TABLE launch_onboarding
  ADD CONSTRAINT launch_onboarding_institution_key_check
  CHECK (institution_key IS NULL OR institution_key IN ('ucd', 'palomar'));

ALTER TABLE waitlist_subscriptions
  DROP CONSTRAINT IF EXISTS waitlist_subscriptions_list_key_check;

ALTER TABLE waitlist_subscriptions
  ADD CONSTRAINT waitlist_subscriptions_list_key_check
  CHECK (list_key IN ('ucd_incoming', 'palomar_incoming', 'ios'));

CREATE INDEX IF NOT EXISTS idx_access_entitlements_entitlement_key
  ON access_entitlements (entitlement_key, ends_at, grace_ends_at)
  WHERE revoked_at IS NULL;

DROP INDEX IF EXISTS idx_product_events_unique_user_milestone;

CREATE UNIQUE INDEX idx_product_events_unique_user_milestone
  ON product_events (user_id, event_name)
  WHERE user_id IS NOT NULL
    AND event_name IN ('ucd_verified', 'palomar_verified', 'onboarding_started', 'onboarding_completed');
