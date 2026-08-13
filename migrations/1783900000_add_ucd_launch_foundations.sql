CREATE TABLE IF NOT EXISTS access_entitlements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  qualifying_email TEXT NOT NULL,
  grant_source TEXT NOT NULL CHECK (grant_source IN ('primary_email', 'secondary_email', 'admin')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  grace_ends_at TIMESTAMPTZ NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entitlement_key),
  CHECK (ends_at > starts_at),
  CHECK (grace_ends_at > ends_at)
);

CREATE INDEX IF NOT EXISTS idx_access_entitlements_user_active
  ON access_entitlements (user_id, ends_at, grace_ends_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS ucd_onboarding (
  user_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ucd_verified_at TIMESTAMPTZ,
  first_course_at TIMESTAMPTZ,
  dashboard_opened_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waitlist_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  list_key TEXT NOT NULL CHECK (list_key IN ('ucd_incoming', 'ios')),
  consent BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  confirmation_token_hash TEXT,
  confirmation_expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  unsubscribe_token_hash TEXT NOT NULL,
  unsubscribed_at TIMESTAMPTZ,
  source TEXT,
  campaign TEXT,
  ambassador TEXT,
  society TEXT,
  referral TEXT,
  launch_session TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, list_key)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_confirmation_token
  ON waitlist_subscriptions (confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_unsubscribe_token
  ON waitlist_subscriptions (unsubscribe_token_hash);

CREATE TABLE IF NOT EXISTS campaign_attributions (
  user_id TEXT PRIMARY KEY,
  first_source TEXT,
  first_campaign TEXT,
  first_ambassador TEXT,
  first_society TEXT,
  first_referral TEXT,
  first_launch_session TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_source TEXT,
  last_campaign TEXT,
  last_ambassador TEXT,
  last_society TEXT,
  last_referral TEXT,
  last_launch_session TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT,
  launch_session TEXT,
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  page TEXT,
  source TEXT,
  campaign TEXT,
  ambassador TEXT,
  society TEXT,
  referral TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_events_occurred_at
  ON product_events (occurred_at);

CREATE INDEX IF NOT EXISTS idx_product_events_user_occurred
  ON product_events (user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_events_unique_user_milestone
  ON product_events (user_id, event_name)
  WHERE user_id IS NOT NULL
    AND event_name IN ('ucd_verified', 'onboarding_started', 'onboarding_completed');

CREATE TABLE IF NOT EXISTS deletion_tombstones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id_hash TEXT NOT NULL,
  email_hashes TEXT[] NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purge_after TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS course_id BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS academic_kind TEXT;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_academic_kind_check;

ALTER TABLE events
  ADD CONSTRAINT events_academic_kind_check
  CHECK (academic_kind IS NULL OR academic_kind IN ('class'));

CREATE INDEX IF NOT EXISTS idx_events_course_id
  ON events (course_id)
  WHERE course_id IS NOT NULL;

ALTER TABLE google_calendar_connections
  ADD COLUMN IF NOT EXISTS shared_calendar_scope_granted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE study_plans
  ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'exam',
  ADD COLUMN IF NOT EXISTS target_assignment_id BIGINT REFERENCES assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_title TEXT,
  ADD COLUMN IF NOT EXISTS target_date DATE,
  ADD COLUMN IF NOT EXISTS target_time TIME,
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS daily_cap_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS scheduler_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS scheduler_explanation TEXT,
  ADD COLUMN IF NOT EXISTS unscheduled_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_plan_acknowledged BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE study_plans
SET target_type = 'exam',
    target_date = COALESCE(target_date, exam_date),
    target_title = COALESCE(target_title, CASE exam_type WHEN 'midterm' THEN 'Midterm exam' ELSE 'Final exam' END)
WHERE target_date IS NULL OR target_title IS NULL;

ALTER TABLE study_plans
  DROP CONSTRAINT IF EXISTS study_plans_target_type_check,
  ADD CONSTRAINT study_plans_target_type_check CHECK (target_type IN ('exam', 'assignment', 'project')),
  DROP CONSTRAINT IF EXISTS study_plans_estimated_minutes_check,
  ADD CONSTRAINT study_plans_estimated_minutes_check
    CHECK (estimated_minutes IS NULL OR (estimated_minutes BETWEEN 15 AND 10080 AND estimated_minutes % 15 = 0)),
  DROP CONSTRAINT IF EXISTS study_plans_daily_cap_minutes_check,
  ADD CONSTRAINT study_plans_daily_cap_minutes_check
    CHECK (daily_cap_minutes IS NULL OR (daily_cap_minutes BETWEEN 15 AND 720 AND daily_cap_minutes % 15 = 0)),
  DROP CONSTRAINT IF EXISTS study_plans_unscheduled_minutes_check,
  ADD CONSTRAINT study_plans_unscheduled_minutes_check CHECK (unscheduled_minutes >= 0);

ALTER TABLE study_plans
  DROP CONSTRAINT IF EXISTS study_plans_check,
  DROP CONSTRAINT IF EXISTS study_plans_date_window_check,
  ADD CONSTRAINT study_plans_date_window_check CHECK (
    (target_type = 'exam' AND start_date < exam_date)
    OR (target_type IN ('assignment', 'project') AND start_date <= COALESCE(target_date, exam_date))
  );

CREATE INDEX IF NOT EXISTS idx_study_plans_target_assignment
  ON study_plans (target_assignment_id)
  WHERE target_assignment_id IS NOT NULL;

ALTER TABLE study_tasks
  ADD COLUMN IF NOT EXISTS manually_edited_at TIMESTAMPTZ;
