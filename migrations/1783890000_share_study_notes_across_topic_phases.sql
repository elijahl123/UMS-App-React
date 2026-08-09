DROP INDEX IF EXISTS idx_notes_study_task;

WITH ranked_topic_notes AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY study_plan_id, study_topic_id
      ORDER BY updated_at DESC, id DESC
    ) AS topic_rank
  FROM notes
  WHERE study_plan_id IS NOT NULL
    AND study_topic_id IS NOT NULL
)
UPDATE notes AS note
SET
  study_plan_id = NULL,
  study_topic_id = NULL,
  study_phase = NULL
FROM ranked_topic_notes AS ranked
WHERE note.id = ranked.id
  AND ranked.topic_rank > 1;

UPDATE notes
SET study_phase = NULL
WHERE study_phase IS NOT NULL;

CREATE UNIQUE INDEX idx_notes_study_topic
  ON notes (study_plan_id, study_topic_id);
