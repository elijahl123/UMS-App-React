ALTER TABLE assignments
  ADD COLUMN due_time TIME,
  ADD COLUMN due_timezone TEXT NOT NULL DEFAULT 'UTC';

CREATE INDEX idx_assignments_due_date_time ON assignments (due_date, due_time);
