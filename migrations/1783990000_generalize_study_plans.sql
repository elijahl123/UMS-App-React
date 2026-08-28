ALTER TABLE study_plans
  DROP CONSTRAINT IF EXISTS study_plans_target_type_check,
  ADD CONSTRAINT study_plans_target_type_check
    CHECK (target_type IN ('exam', 'assignment', 'project', 'general'));

ALTER TABLE study_plans
  DROP CONSTRAINT IF EXISTS study_plans_date_window_check,
  ADD CONSTRAINT study_plans_date_window_check
    CHECK (start_date <= COALESCE(target_date, exam_date));

ALTER TABLE study_plans
  ADD COLUMN IF NOT EXISTS phase_preset TEXT NOT NULL DEFAULT 'study';

ALTER TABLE study_plans
  DROP CONSTRAINT IF EXISTS study_plans_phase_preset_check,
  ADD CONSTRAINT study_plans_phase_preset_check
    CHECK (phase_preset IN ('study', 'general'));

COMMENT ON COLUMN study_plans.target_type IS
  'exam, assignment, project, or general. Only a label and a deadline; every type is planned from topics.';
COMMENT ON COLUMN study_plans.phase_preset IS
  'Wording for phase-derived task titles. study = Learn & review/Practice/Recall/Review; general = First pass/Deepen/Review/Work through';
