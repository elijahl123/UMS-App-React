-- Migration to scope app data (courses, events, notes, course_links) per Firebase user
ALTER TABLE courses ADD COLUMN user_id TEXT;

CREATE INDEX idx_courses_user_id ON courses (user_id);

ALTER TABLE events ADD COLUMN user_id TEXT;

CREATE INDEX idx_events_user_id ON events (user_id);

ALTER TABLE notes ADD COLUMN user_id TEXT;

CREATE INDEX idx_notes_user_id ON notes (user_id);

ALTER TABLE course_links ADD COLUMN user_id TEXT;

CREATE INDEX idx_course_links_user_id ON course_links (user_id);
