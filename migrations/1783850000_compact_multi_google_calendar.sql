ALTER TABLE google_calendar_connections
  ADD COLUMN IF NOT EXISTS history_months INTEGER NOT NULL DEFAULT 6
    CHECK (history_months IN (1, 3, 6, 12, 24)),
  ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calendar_list_scope_granted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sync_format_version INTEGER NOT NULL DEFAULT 1;

UPDATE google_calendar_connections
SET setup_completed = TRUE
WHERE encrypted_refresh_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS google_calendar_selections (
  user_id TEXT NOT NULL REFERENCES google_calendar_connections(user_id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  time_zone TEXT NOT NULL DEFAULT 'UTC',
  background_color TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, calendar_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_google_calendar_selections_primary
  ON google_calendar_selections (user_id)
  WHERE is_primary;

INSERT INTO google_calendar_selections (
  user_id,
  calendar_id,
  summary,
  is_primary,
  selected
)
SELECT
  user_id,
  calendar_id,
  COALESCE(google_email, 'Primary calendar'),
  TRUE,
  TRUE
FROM google_calendar_connections
ON CONFLICT (user_id, calendar_id) DO UPDATE SET
  is_primary = TRUE,
  selected = TRUE,
  updated_at = NOW();

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS google_recurrence TEXT[],
  ADD COLUMN IF NOT EXISTS google_recurring_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_original_start TEXT,
  ADD COLUMN IF NOT EXISTS google_cancelled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE events
SET source_key = google_calendar_id || ':' || google_event_id
WHERE source_provider = 'google_calendar'
  AND google_calendar_id IS NOT NULL
  AND google_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_google_recurring_parent
  ON events (user_id, google_calendar_id, google_recurring_event_id)
  WHERE google_recurring_event_id IS NOT NULL;
