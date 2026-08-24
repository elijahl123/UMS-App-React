CREATE TABLE IF NOT EXISTS study_plan_capacity_overrides (
  plan_id BIGINT NOT NULL REFERENCES study_plans (id) ON DELETE CASCADE,
  study_date DATE NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 15 AND 720 AND minutes % 15 = 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_id, study_date)
);

ALTER TABLE study_plan_recovery_revisions
  ADD COLUMN IF NOT EXISTS before_capacity_overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS after_capacity_overrides JSONB NOT NULL DEFAULT '[]'::jsonb;
