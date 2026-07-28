ALTER TABLE events
  ADD COLUMN IF NOT EXISTS end_date DATE;

UPDATE events
SET end_date = event_date + 1
WHERE end_date IS NULL
  AND event_time IS NOT NULL
  AND end_time IS NOT NULL
  AND end_time <= event_time;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_end_date_not_before_start;

ALTER TABLE events
  ADD CONSTRAINT events_end_date_not_before_start
  CHECK (end_date IS NULL OR end_date >= event_date);
