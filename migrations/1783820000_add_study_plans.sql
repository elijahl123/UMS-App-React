CREATE TABLE study_plans (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('midterm', 'final')),
  exam_date DATE NOT NULL,
  start_date DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_date < exam_date)
);

CREATE INDEX idx_study_plans_course_id ON study_plans (course_id);
CREATE INDEX idx_study_plans_exam_date ON study_plans (exam_date);

CREATE TABLE study_plan_availability (
  plan_id BIGINT NOT NULL REFERENCES study_plans (id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 0 AND 720 AND minutes % 15 = 0),
  PRIMARY KEY (plan_id, weekday)
);

CREATE TABLE study_topics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES study_plans (id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('light', 'medium', 'heavy')),
  position INTEGER NOT NULL CHECK (position >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_study_topics_plan_id ON study_topics (plan_id);

CREATE TABLE study_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES study_plans (id) ON DELETE CASCADE,
  topic_id BIGINT NOT NULL REFERENCES study_topics (id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('learn', 'practice', 'recall')),
  title TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0 AND estimated_minutes % 15 = 0),
  completed_at TIMESTAMPTZ,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_study_tasks_plan_date ON study_tasks (plan_id, scheduled_date);
CREATE INDEX idx_study_tasks_incomplete_date ON study_tasks (scheduled_date) WHERE completed_at IS NULL;
