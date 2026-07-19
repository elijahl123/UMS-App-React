import type { AppUser, Assignment, CalendarEvent, ClassSession, Course, CourseLink, Note } from '@/app/data/types';

export const mockUser: AppUser = {
  id: 'user-1',
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  createdAt: '2026-01-01T00:00:00.000Z',
  emailVerified: false,
  connectedProviders: ['password'],
};

export const courses: Course[] = [
  { id: '1', code: 'MATH 101', name: 'Calculus I', color: 'course-blue' },
  { id: '2', code: 'ENG 205', name: 'Modern Literature', color: 'course-green' },
];

export const assignments: Assignment[] = [
  { id: '1', courseId: '1', name: 'Limits Worksheet', dueDate: '2026-07-10', dueTime: '23:59', dueTimeZone: 'America/Los_Angeles', status: 'upcoming' },
  { id: '2', courseId: '1', name: 'Derivative Quiz', dueDate: '2026-07-01', dueTimeZone: 'America/Los_Angeles', status: 'late' },
  { id: '3', courseId: '2', name: 'Reading Response', dueDate: '2026-07-08', dueTimeZone: 'America/Los_Angeles', status: 'completed' },
];

export const sessions: ClassSession[] = [
  { id: '1', courseId: '1', day: 'Fri', startTime: '09:00:00', endTime: '10:15:00' },
  { id: '2', courseId: '2', day: 'Mon', startTime: '13:00:00', endTime: '14:15:00' },
];

export const events: CalendarEvent[] = [
  { id: '1', title: 'Study Group', date: '2026-07-10', time: '16:00', timeZone: 'America/Los_Angeles', description: 'Library room 2' },
];

export const notes: Note[] = [
  {
    id: '1',
    courseId: '1',
    title: 'Chain Rule Notes',
    content: '<p>Differentiate the outside, then the inside.</p>',
    createdAt: '2026-07-02T10:00:00.000Z',
    updatedAt: '2026-07-03T10:00:00.000Z',
  },
];

export const links: CourseLink[] = [
  {
    id: '1',
    courseId: '1',
    label: 'Syllabus',
    url: 'https://example.com/syllabus',
    createdAt: '2026-07-01T10:00:00.000Z',
  },
];

export const dbRows = {
  loadCourses: courses.map((course) => ({
    id: Number(course.id),
    code: course.code,
    name: course.name,
    color: course.color,
  })),
  loadAssignments: assignments.map((assignment) => ({
    id: Number(assignment.id),
    course_id: Number(assignment.courseId),
    name: assignment.name,
    due_date: assignment.dueDate,
    due_time: assignment.dueTime ?? null,
    due_timezone: assignment.dueTimeZone,
    status: assignment.status,
    description: assignment.description ?? null,
  })),
  loadClassSessions: sessions.map((session) => ({
    id: Number(session.id),
    course_id: Number(session.courseId),
    day: session.day,
    start_time: session.startTime,
    end_time: session.endTime,
  })),
  loadEvents: events.map((event) => ({
    id: Number(event.id),
    title: event.title,
    event_date: event.date,
    event_time: event.time ?? null,
    event_timezone: event.timeZone,
    description: event.description ?? null,
  })),
  loadNotes: notes.map((note) => ({
    id: Number(note.id),
    course_id: note.courseId ? Number(note.courseId) : null,
    title: note.title,
    content: note.content,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  })),
  loadCourseLinks: links.map((link) => ({
    id: Number(link.id),
    course_id: Number(link.courseId),
    label: link.label,
    url: link.url,
    created_at: link.createdAt,
  })),
};
