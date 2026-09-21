-- Class session times are wall-clock values (e.g. Mon 09:00). Without the zone
-- they were entered in, they cannot be re-expressed for a student who has since
-- moved. Existing rows stay NULL, which keeps rendering them exactly as entered.
ALTER TABLE class_sessions
ADD COLUMN timezone TEXT;
