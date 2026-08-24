CREATE TABLE study_plan_recovery_revisions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES study_plans (id) ON DELETE CASCADE,
  before_tasks JSONB NOT NULL,
  after_tasks JSONB NOT NULL,
  before_unscheduled_minutes INTEGER NOT NULL CHECK (before_unscheduled_minutes >= 0),
  after_unscheduled_minutes INTEGER NOT NULL CHECK (after_unscheduled_minutes >= 0),
  before_state_hash TEXT NOT NULL CHECK (char_length(before_state_hash) = 64),
  after_state_hash TEXT NOT NULL CHECK (char_length(after_state_hash) = 64),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ
);

CREATE INDEX idx_study_plan_recovery_latest
  ON study_plan_recovery_revisions (plan_id, applied_at DESC, id DESC)
  WHERE undone_at IS NULL;
