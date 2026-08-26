ALTER TABLE study_plans
  ADD COLUMN topic_mode TEXT NOT NULL DEFAULT 'phases' CHECK (topic_mode IN ('phases', 'single'));

ALTER TABLE study_tasks
  DROP CONSTRAINT study_tasks_phase_check,
  ADD CONSTRAINT study_tasks_phase_check CHECK (phase BETWEEN 0 AND 3);

COMMENT ON COLUMN study_plans.topic_mode IS
  'phases = Learn & Review, Practice, and Recall tasks per topic; single = one review task per topic';
COMMENT ON COLUMN study_tasks.phase IS '0 = learn, 1 = practice, 2 = recall, 3 = review (single pass-through)';
