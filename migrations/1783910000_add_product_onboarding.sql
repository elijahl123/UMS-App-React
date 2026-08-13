CREATE TABLE IF NOT EXISTS product_onboarding (
  user_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'skipped', 'completed')),
  current_step TEXT NOT NULL DEFAULT 'welcome',
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  deferred_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  checklist_dismissed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  skipped_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_onboarding_status
  ON product_onboarding (status, updated_at DESC);
