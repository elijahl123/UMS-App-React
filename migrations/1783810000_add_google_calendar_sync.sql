ALTER TABLE events
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_etag TEXT,
  ADD COLUMN IF NOT EXISTS google_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_google_unique
  ON events (user_id, google_calendar_id, google_event_id)
  WHERE user_id IS NOT NULL AND google_calendar_id IS NOT NULL AND google_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  user_id TEXT PRIMARY KEY,
  google_sub TEXT,
  google_email TEXT,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  sync_in_progress BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_calendar_sync_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
  imported_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  pushed_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_sync_runs_user_started
  ON google_calendar_sync_runs (user_id, started_at DESC);
