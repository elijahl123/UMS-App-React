ALTER TABLE courses
  ADD COLUMN homepage_url TEXT;

ALTER TABLE notes
  ADD COLUMN study_plan_id BIGINT REFERENCES study_plans (id) ON DELETE SET NULL,
  ADD COLUMN study_topic_id BIGINT REFERENCES study_topics (id) ON DELETE SET NULL,
  ADD COLUMN study_phase SMALLINT CHECK (study_phase BETWEEN 0 AND 2);

CREATE UNIQUE INDEX idx_notes_study_task
  ON notes (study_plan_id, study_topic_id, study_phase);
