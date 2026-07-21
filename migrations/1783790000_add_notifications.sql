ALTER TABLE events
  ALTER COLUMN event_time TYPE TIME USING NULLIF(event_time, '')::time,
  ADD COLUMN event_timezone TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  assignment_24h_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  assignment_1h_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  event_10m_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  class_10m_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  time_zone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_instances (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('assignment', 'event', 'class_session')),
  source_id BIGINT NOT NULL,
  occurrence_key TEXT NOT NULL,
  fire_at TIMESTAMPTZ NOT NULL,
  target_at TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reminder_offset_minutes INTEGER NOT NULL,
  local_notification_id INTEGER NOT NULL,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_notification_instances_unique
  ON notification_instances (user_id, source_type, source_id, occurrence_key, reminder_offset_minutes);

CREATE INDEX idx_notification_instances_user_fire_at
  ON notification_instances (user_id, fire_at);

CREATE INDEX idx_notification_instances_user_unread
  ON notification_instances (user_id, fire_at)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
