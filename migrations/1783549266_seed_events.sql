-- Add event seed data for Calendar testing
INSERT INTO events (title, event_date, event_time, description)
VALUES
  (
    'Study Group - ML',
    '2026-03-15',
    '14:00',
    'Machine Learning algorithms review with classmates'
  ),
  (
    'Project Submission Deadline',
    '2026-03-20',
    NULL,
    'Software Engineering Project final submission'
  ),
  (
    'Mid-semester Review',
    '2026-03-25',
    '10:00',
    'Check in with academic advisor'
  );
