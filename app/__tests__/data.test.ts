import { describe, expect, it } from 'vitest';
import { buildCalendarItems, toIsoDate } from '@/app/data/calendarUtils';
import { getCourseColor } from '@/app/data/courseColors';
import { mapAssignment, mapClassSession, mapCourse, mapCourseLink, mapEvent, mapFirebaseUser, mapNote } from '@/app/data/mappers';
import { assignments, courses, events, links, notes, sessions } from '@/app/test/fixtures';

describe('data mappers and calendar utilities', () => {
  it('maps database rows into app models', () => {
    expect(mapCourse({ id: 1, code: 'MATH 101', name: 'Calculus I', color: 'course-blue' })).toEqual(courses[0]);
    expect(
      mapAssignment({
        id: 1,
        course_id: 1,
        name: 'Limits Worksheet',
        due_date: '2026-07-10T00:00:00.000Z',
        due_time: '23:59:00',
        due_timezone: 'America/Los_Angeles',
        status: 'upcoming',
        description: null,
      })
    ).toEqual(assignments[0]);
    expect(mapClassSession({ id: 1, course_id: 1, day: 'Fri', start_time: '09:00:00', end_time: '10:15:00' })).toEqual(sessions[0]);
    expect(mapEvent({ id: 1, title: 'Study Group', event_date: '2026-07-10T00:00:00.000Z', event_time: '16:00', description: 'Library room 2' })).toEqual(events[0]);
    expect(mapNote({ id: 1, course_id: 1, title: notes[0].title, content: notes[0].content, created_at: notes[0].createdAt, updated_at: notes[0].updatedAt })).toEqual(notes[0]);
    expect(mapCourseLink({ id: 1, course_id: 1, label: links[0].label, url: links[0].url, created_at: links[0].createdAt })).toEqual(links[0]);
  });

  it('maps Firebase users and calendar items', () => {
    expect(
      mapFirebaseUser({
        localId: 'user-1',
        email: 'jane@example.com',
        displayName: 'Jane Doe',
        emailVerified: true,
        createdAt: '1767225600000',
        providerUserInfo: [{ providerId: 'password' }, { providerId: 'google.com' }],
      })
    ).toMatchObject({ id: 'user-1', firstName: 'Jane', lastName: 'Doe', emailVerified: true, connectedProviders: ['password', 'google.com'] });

    const itemsByDate = buildCalendarItems(2026, 6, assignments, sessions, events, courses);

    expect(toIsoDate(new Date(2026, 6, 10))).toBe('2026-07-10');
    expect(itemsByDate.get('2026-07-10')?.map((item) => item.title)).toEqual(
      expect.arrayContaining(['MATH 101: Limits Worksheet', 'Study Group'])
    );
    expect(getCourseColor('course-blue').border).toBeTruthy();
  });
});
