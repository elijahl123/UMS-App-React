-- Migration to convert class_sessions start_time and end_time from TEXT to TIME
-- Converts text formats like "10:00 a.m." to TIME format "10:00"
ALTER TABLE class_sessions
ADD COLUMN start_time_new TIME;

ALTER TABLE class_sessions
ADD COLUMN end_time_new TIME;

-- Convert existing text times to TIME type
-- Handle formats like "10:00 a.m.", "10:50 p.m.", "11:00am", etc.
UPDATE class_sessions
SET 
  start_time_new = CASE 
    WHEN start_time ~ '^\d{1,2}:\d{2}\s*(a\.?m\.?|p\.?m\.?)$' THEN
      to_timestamp(
        CASE 
          WHEN start_time ~* 'p\.?m\.?' AND NOT start_time ~* '^12:' THEN
            (CAST(SUBSTRING(start_time, 1, POSITION(':' IN start_time) - 1) AS INTEGER) + 12)::TEXT || SUBSTRING(start_time, POSITION(':' IN start_time), 3)
          WHEN start_time ~* 'a\.?m\.?' AND start_time ~* '^12:' THEN
            '00' || SUBSTRING(start_time, POSITION(':' IN start_time), 3)
          ELSE
            SUBSTRING(start_time, 1, POSITION(':' IN start_time) - 1) || SUBSTRING(start_time, POSITION(':' IN start_time), 3)
        END,
        'HH24:MI'
      )::TIME
    ELSE start_time_new
  END,
  end_time_new = CASE 
    WHEN end_time ~ '^\d{1,2}:\d{2}\s*(a\.?m\.?|p\.?m\.?)$' THEN
      to_timestamp(
        CASE 
          WHEN end_time ~* 'p\.?m\.?' AND NOT end_time ~* '^12:' THEN
            (CAST(SUBSTRING(end_time, 1, POSITION(':' IN end_time) - 1) AS INTEGER) + 12)::TEXT || SUBSTRING(end_time, POSITION(':' IN end_time), 3)
          WHEN end_time ~* 'a\.?m\.?' AND end_time ~* '^12:' THEN
            '00' || SUBSTRING(end_time, POSITION(':' IN end_time), 3)
          ELSE
            SUBSTRING(end_time, 1, POSITION(':' IN end_time) - 1) || SUBSTRING(end_time, POSITION(':' IN end_time), 3)
        END,
        'HH24:MI'
      )::TIME
    ELSE end_time_new
  END;

-- Drop old columns and rename new ones
ALTER TABLE class_sessions DROP COLUMN start_time;

ALTER TABLE class_sessions DROP COLUMN end_time;

ALTER TABLE class_sessions RENAME COLUMN start_time_new TO start_time;

ALTER TABLE class_sessions RENAME COLUMN end_time_new TO end_time;

-- Add NOT NULL constraint
ALTER TABLE class_sessions
ALTER COLUMN start_time SET NOT NULL,
ALTER COLUMN end_time SET NOT NULL;
