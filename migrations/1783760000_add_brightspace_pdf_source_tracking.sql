ALTER TABLE assignments
  ADD COLUMN source_provider TEXT,
  ADD COLUMN source_key TEXT;

ALTER TABLE events
  ADD COLUMN source_provider TEXT,
  ADD COLUMN source_key TEXT;

CREATE UNIQUE INDEX idx_courses_user_code_unique
  ON courses (user_id, code)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX idx_assignments_source_unique
  ON assignments (course_id, source_provider, source_key)
  WHERE source_provider IS NOT NULL AND source_key IS NOT NULL;

CREATE UNIQUE INDEX idx_events_source_unique
  ON events (user_id, source_provider, source_key)
  WHERE user_id IS NOT NULL AND source_provider IS NOT NULL AND source_key IS NOT NULL;
