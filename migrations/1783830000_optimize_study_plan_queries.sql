CREATE INDEX IF NOT EXISTS idx_study_plans_active_course_exam
  ON study_plans (course_id, exam_date)
  WHERE archived = FALSE;

DROP INDEX IF EXISTS idx_study_tasks_incomplete_date;

CREATE INDEX IF NOT EXISTS idx_study_tasks_incomplete_date_plan
  ON study_tasks (scheduled_date, plan_id, sequence)
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_study_tasks_plan_date_sequence
  ON study_tasks (plan_id, scheduled_date, sequence, id);

CREATE INDEX IF NOT EXISTS idx_study_topics_active_plan_position
  ON study_topics (plan_id, position)
  WHERE active = TRUE;
