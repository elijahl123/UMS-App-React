ALTER TABLE google_calendar_connections
  ADD COLUMN IF NOT EXISTS calendar_list_scope_granted BOOLEAN NOT NULL DEFAULT FALSE;
