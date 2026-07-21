import type { QueryConfig } from './db';
import { required, type Params } from './errors';

type ActionBuilder = (params: Params) => QueryConfig;

const assignmentSelectColumns = `
  a.id,
  a.course_id,
  a.name,
  a.due_date::text AS due_date,
  a.due_time::text AS due_time,
  COALESCE(NULLIF(a.due_timezone, ''), 'UTC') AS due_timezone,
  CASE
    WHEN a.status = 'completed' THEN 'completed'
    WHEN a.due_date < (NOW() AT TIME ZONE COALESCE(NULLIF(a.due_timezone, ''), 'UTC'))::date THEN 'late'
    WHEN a.due_date = (NOW() AT TIME ZONE COALESCE(NULLIF(a.due_timezone, ''), 'UTC'))::date THEN 'due_today'
    ELSE 'upcoming'
  END AS status,
  a.description
`;

const actionBuilders: Record<string, ActionBuilder> = {
  loadCourses: (params) => ({
    text: `
      SELECT id, code, name, color
      FROM courses
      WHERE user_id = $1
      ORDER BY code;
    `,
    values: [required(params, 'userId')],
  }),

  createCourse: (params) => ({
    text: `
      INSERT INTO courses (code, name, color, user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, code, name, color;
    `,
    values: [required(params, 'code'), required(params, 'name'), params.color ?? 'course-gray', required(params, 'userId')],
  }),

  updateCourse: (params) => ({
    text: `
      UPDATE courses
      SET code = $1,
          name = $2,
          color = $3
      WHERE id = $4::bigint AND user_id = $5
      RETURNING id, code, name, color;
    `,
    values: [required(params, 'code'), required(params, 'name'), required(params, 'color'), required(params, 'id'), required(params, 'userId')],
  }),

  deleteCourse: (params) => ({
    text: `
      DELETE FROM courses
      WHERE id = $1::bigint AND user_id = $2;
    `,
    values: [required(params, 'id'), required(params, 'userId')],
  }),

  loadAssignments: (params) => ({
    text: `
      SELECT ${assignmentSelectColumns}
      FROM assignments a
      JOIN courses c ON c.id = a.course_id
      WHERE c.user_id = $1
      ORDER BY a.due_date, a.due_time NULLS LAST;
    `,
    values: [required(params, 'userId')],
  }),

  createAssignment: (params) => ({
    text: `
      WITH inserted AS (
        INSERT INTO assignments (course_id, name, due_date, due_time, due_timezone, status, description)
        SELECT c.id, $1, $2::date, NULLIF($3, '')::time, $4, 'upcoming', $5
        FROM courses c
        WHERE c.id = $6::bigint AND c.user_id = $7
        RETURNING *
      )
      SELECT ${assignmentSelectColumns}
      FROM inserted a;
    `,
    values: [
      required(params, 'name'),
      required(params, 'dueDate'),
      params.dueTime ?? null,
      params.dueTimeZone ?? 'UTC',
      params.description ?? null,
      required(params, 'courseId'),
      required(params, 'userId'),
    ],
  }),

  updateAssignment: (params) => ({
    text: `
      WITH updated AS (
        UPDATE assignments
        SET course_id = $1::bigint,
            name = $2,
            due_date = $3::date,
            due_time = NULLIF($4, '')::time,
            due_timezone = $5,
            status = CASE WHEN $6 = 'completed' THEN 'completed' ELSE 'upcoming' END,
            description = $7
        WHERE id = $8::bigint
          AND EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = $1::bigint AND c.user_id = $9
          )
        RETURNING *
      )
      SELECT ${assignmentSelectColumns}
      FROM updated a;
    `,
    values: [
      required(params, 'courseId'),
      required(params, 'name'),
      required(params, 'dueDate'),
      params.dueTime ?? null,
      params.dueTimeZone ?? 'UTC',
      params.status ?? 'upcoming',
      params.description ?? null,
      required(params, 'id'),
      required(params, 'userId'),
    ],
  }),

  deleteAssignment: (params) => ({
    text: `
      DELETE FROM assignments a
      USING courses c
      WHERE a.id = $1::bigint AND a.course_id = c.id AND c.user_id = $2;
    `,
    values: [required(params, 'id'), required(params, 'userId')],
  }),

  loadClassSessions: (params) => ({
    text: `
      SELECT s.id, s.course_id, s.day, s.start_time::text AS start_time, s.end_time::text AS end_time, s.location
      FROM class_sessions s
      JOIN courses c ON c.id = s.course_id
      WHERE c.user_id = $1
      ORDER BY s.id;
    `,
    values: [required(params, 'userId')],
  }),

  createClassSession: (params) => ({
    text: `
      INSERT INTO class_sessions (course_id, day, start_time, end_time, location)
      SELECT c.id, $1, $2::time, $3::time, NULLIF($4, '')
      FROM courses c
      WHERE c.id = $5::bigint AND c.user_id = $6
      RETURNING id, course_id, day, start_time::text AS start_time, end_time::text AS end_time, location;
    `,
    values: [
      required(params, 'day'),
      required(params, 'startTime'),
      required(params, 'endTime'),
      params.location ?? null,
      required(params, 'courseId'),
      required(params, 'userId'),
    ],
  }),

  updateClassSession: (params) => ({
    text: `
      UPDATE class_sessions
      SET course_id = $1::bigint,
          day = $2,
          start_time = $3::time,
          end_time = $4::time,
          location = NULLIF($5, '')
      WHERE id = $6::bigint
        AND EXISTS (
          SELECT 1 FROM courses c
          WHERE c.id = $1::bigint AND c.user_id = $7
        )
      RETURNING id, course_id, day, start_time::text AS start_time, end_time::text AS end_time, location;
    `,
    values: [
      required(params, 'courseId'),
      required(params, 'day'),
      required(params, 'startTime'),
      required(params, 'endTime'),
      params.location ?? null,
      required(params, 'id'),
      required(params, 'userId'),
    ],
  }),

  deleteClassSession: (params) => ({
    text: `
      DELETE FROM class_sessions s
      USING courses c
      WHERE s.id = $1::bigint AND s.course_id = c.id AND c.user_id = $2;
    `,
    values: [required(params, 'id'), required(params, 'userId')],
  }),

  loadEvents: (params) => ({
    text: `
      SELECT
        id,
        title,
        event_date::text AS event_date,
        event_time::text AS event_time,
        COALESCE(NULLIF(event_timezone, ''), 'UTC') AS event_timezone,
        description
      FROM events
      WHERE user_id = $1
      ORDER BY event_date, event_time NULLS LAST;
    `,
    values: [required(params, 'userId')],
  }),

  createEvent: (params) => ({
    text: `
      INSERT INTO events (title, event_date, event_time, event_timezone, description, user_id)
      VALUES ($1, $2::date, NULLIF($3, '')::time, $4, $5, $6)
      RETURNING
        id,
        title,
        event_date::text AS event_date,
        event_time::text AS event_time,
        COALESCE(NULLIF(event_timezone, ''), 'UTC') AS event_timezone,
        description;
    `,
    values: [
      required(params, 'title'),
      required(params, 'date'),
      params.time ?? null,
      params.timeZone ?? 'UTC',
      params.description ?? null,
      required(params, 'userId'),
    ],
  }),

  updateEvent: (params) => ({
    text: `
      UPDATE events
      SET title = $1,
          event_date = $2::date,
          event_time = NULLIF($3, '')::time,
          event_timezone = $4,
          description = $5
      WHERE id = $6::bigint AND user_id = $7
      RETURNING
        id,
        title,
        event_date::text AS event_date,
        event_time::text AS event_time,
        COALESCE(NULLIF(event_timezone, ''), 'UTC') AS event_timezone,
        description;
    `,
    values: [
      required(params, 'title'),
      required(params, 'date'),
      params.time ?? null,
      params.timeZone ?? 'UTC',
      params.description ?? null,
      required(params, 'id'),
      required(params, 'userId'),
    ],
  }),

  deleteEvent: (params) => ({
    text: `
      DELETE FROM events
      WHERE id = $1::bigint AND user_id = $2;
    `,
    values: [required(params, 'id'), required(params, 'userId')],
  }),

  loadNotes: (params) => ({
    text: `
      SELECT id, course_id, title, content, created_at, updated_at
      FROM notes
      WHERE user_id = $1
      ORDER BY updated_at DESC;
    `,
    values: [required(params, 'userId')],
  }),

  createNote: (params) => ({
    text: `
      INSERT INTO notes (course_id, title, content, user_id)
      VALUES ($1::bigint, $2, $3, $4)
      RETURNING id, course_id, title, content, created_at, updated_at;
    `,
    values: [params.courseId ?? null, required(params, 'title'), params.content ?? '', required(params, 'userId')],
  }),

  updateNote: (params) => ({
    text: `
      UPDATE notes
      SET course_id = $1::bigint,
          title = $2,
          content = $3,
          updated_at = NOW()
      WHERE id = $4::bigint AND user_id = $5
      RETURNING id, course_id, title, content, created_at, updated_at;
    `,
    values: [params.courseId ?? null, required(params, 'title'), params.content ?? '', required(params, 'id'), required(params, 'userId')],
  }),

  deleteNote: (params) => ({
    text: `
      DELETE FROM notes
      WHERE id = $1::bigint AND user_id = $2;
    `,
    values: [required(params, 'id'), required(params, 'userId')],
  }),

  loadCourseLinks: (params) => ({
    text: `
      SELECT id, course_id, label, url, created_at
      FROM course_links
      WHERE user_id = $1
      ORDER BY created_at ASC;
    `,
    values: [required(params, 'userId')],
  }),

  createCourseLink: (params) => ({
    text: `
      INSERT INTO course_links (course_id, label, url, user_id)
      SELECT c.id, $1, $2, $3
      FROM courses c
      WHERE c.id = $4::bigint AND c.user_id = $3
      RETURNING id, course_id, label, url, created_at;
    `,
    values: [required(params, 'label'), required(params, 'url'), required(params, 'userId'), required(params, 'courseId')],
  }),

  updateCourseLink: (params) => ({
    text: `
      UPDATE course_links
      SET label = $1, url = $2
      WHERE id = $3::bigint AND user_id = $4
      RETURNING id, course_id, label, url, created_at;
    `,
    values: [required(params, 'label'), required(params, 'url'), required(params, 'id'), required(params, 'userId')],
  }),

  deleteCourseLink: (params) => ({
    text: `
      DELETE FROM course_links
      WHERE id = $1::bigint AND user_id = $2;
    `,
    values: [required(params, 'id'), required(params, 'userId')],
  }),
};

export function getActionQuery(name: string, params: Params): QueryConfig | null {
  return actionBuilders[name]?.(params) ?? null;
}
