-- Migration to create core tables for Untitled Management Software
CREATE TABLE
  courses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'course-gray',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
  );

CREATE TABLE
  assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'upcoming',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
  );

CREATE INDEX idx_assignments_course_id ON assignments (course_id);

CREATE INDEX idx_assignments_status ON assignments (status);

CREATE TABLE
  class_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
  );

CREATE INDEX idx_class_sessions_course_id ON class_sessions (course_id);

CREATE TABLE
  events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_time TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
  );

-- Seed data matching current mock data
INSERT INTO
  courses (code, name, color)
VALUES
  ('COMP30870', 'Software Engineering Project', 'course-green'),
  ('COMP30770', 'Enterprise Software Systems', 'course-gray'),
  ('COMP31020', 'Cloud Computing', 'course-yellow'),
  ('COMP30940', 'Machine Learning', 'course-blue');

INSERT INTO
  assignments (course_id, name, due_date, status)
VALUES
  (
    (
      SELECT id
      FROM courses
      WHERE
        code = 'COMP30870'
    ),
    'Additional Class Time',
    '2026-03-19',
    'late'
  ),
  (
    (
      SELECT id
      FROM courses
      WHERE
        code = 'COMP30770'
    ),
    'Additional Class Time',
    '2026-03-20',
    'late'
  ),
  (
    (
      SELECT id
      FROM courses
      WHERE
        code = 'COMP31020'
    ),
    'Resit Exam',
    '2026-03-27',
    'late'
  ),
  (
    (
      SELECT id
      FROM courses
      WHERE
        code = 'COMP30940'
    ),
    'Resit Exam',
    '2026-04-20',
    'late'
  );

INSERT INTO
  class_sessions (course_id, day, start_time, end_time)
VALUES
  (
    (
      SELECT id
      FROM courses
      WHERE
        code = 'COMP30870'
    ),
    'Mon',
    '10:00 a.m.',
    '10:50 a.m.'
  ),
  (
    (
      SELECT id
      FROM courses
      WHERE
        code = 'COMP30870'
    ),
    'Mon',
    '11:00 a.m.',
    '12:50 p.m.'
  ),
  (
    (
      SELECT id
      FROM courses
      WHERE
        code = 'COMP30870'
    ),
    'Mon',
    '02:00 p.m.',
    '03:50 p.m.'
  ),
  (
    (
      SELECT id
      FROM courses
      WHERE
        code = 'COMP30770'
    ),
    'Tue',
    '09:00 a.m.',
    '10:50 a.m.'
  ),
  (
    (
      SELECT id
      FROM courses
      WHERE
        code = 'COMP31020'
    ),
    'Wed',
    '01:00 p.m.',
    '02:50 p.m.'
  );
