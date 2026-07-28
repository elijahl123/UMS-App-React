ALTER TABLE study_tasks
  ADD COLUMN title_override TEXT;

UPDATE study_tasks task
SET title_override = task.title
FROM study_topics topic
WHERE topic.id = task.topic_id
  AND task.title IS DISTINCT FROM (
    CASE task.phase
      WHEN 'learn' THEN 'Learn & review'
      WHEN 'practice' THEN 'Practice'
      ELSE 'Recall'
    END || ': ' || topic.title
  );

ALTER TABLE study_tasks
  DROP CONSTRAINT IF EXISTS study_tasks_phase_check,
  DROP CONSTRAINT IF EXISTS study_tasks_estimated_minutes_check;

ALTER TABLE study_tasks
  ALTER COLUMN phase TYPE SMALLINT
    USING (
      CASE phase
        WHEN 'learn' THEN 0
        WHEN 'practice' THEN 1
        WHEN 'recall' THEN 2
      END
    )::SMALLINT,
  ALTER COLUMN estimated_minutes TYPE SMALLINT
    USING estimated_minutes::SMALLINT;

ALTER TABLE study_tasks
  DROP COLUMN title,
  DROP COLUMN created_at,
  ADD CONSTRAINT study_tasks_phase_check CHECK (phase BETWEEN 0 AND 2),
  ADD CONSTRAINT study_tasks_estimated_minutes_check
    CHECK (estimated_minutes BETWEEN 15 AND 720 AND estimated_minutes % 15 = 0);

DROP INDEX IF EXISTS idx_study_tasks_plan_date;

COMMENT ON COLUMN study_tasks.phase IS '0 = learn, 1 = practice, 2 = recall';
COMMENT ON COLUMN study_tasks.title_override IS
  'Historical task label retained only when it differs from the title derived from phase and topic';
