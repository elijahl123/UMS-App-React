import { describe, expect, it } from 'vitest';
import { buildCalendarItems, toIsoDate } from '@/app/data/calendarUtils';
import { getCourseColor } from '@/app/data/courseColors';
import {
  mapAssignment,
  mapClassSession,
  mapCourse,
  mapCourseLink,
  mapEvent,
  mapFirebaseUser,
  mapNote,
  mapNotificationInstance,
} from '@/app/data/mappers';
import { assignments, courses, events, links, notes, sessions } from '@/app/test/fixtures';

describe('data mappers and calendar utilities', () => {
  it('maps database rows into app models', () => {
    expect(mapCourse({
      id: 1,
      code: 'MATH 101',
      name: 'Calculus I',
      color: 'course-blue',
      homepage_url: 'https://courses.example.edu/math-101',
    })).toEqual(courses[0]);
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
    expect(
      mapClassSession({
        id: 1,
        course_id: 1,
        day: 'Fri',
        start_time: '09:00:00',
        end_time: '10:15:00',
        location: 'Science Center S202',
      })
    ).toEqual(sessions[0]);
    expect(
      mapEvent({
        id: 1,
        title: 'Study Group',
        event_date: '2026-07-22T00:00:00.000Z',
        event_time: '16:00:00',
        event_timezone: 'America/Los_Angeles',
        description: 'Library room 2',
      })
    ).toEqual(events[0]);
    expect(
      mapEvent({
        id: 2,
        title: 'Conference',
        event_date: '2026-07-22',
        end_date: '2026-07-25',
        event_time: null,
        event_timezone: 'America/Los_Angeles',
        description: null,
      })
    ).toMatchObject({ date: '2026-07-22', endDate: '2026-07-25' });
    expect(mapNote({ id: 1, course_id: 1, title: notes[0].title, content: notes[0].content, created_at: notes[0].createdAt, updated_at: notes[0].updatedAt })).toEqual(notes[0]);
    expect(mapCourseLink({ id: 1, course_id: 1, label: links[0].label, url: links[0].url, created_at: links[0].createdAt })).toEqual(links[0]);
    expect(
      mapNotificationInstance({
        id: 1,
        source_type: 'assignment',
        source_id: 2,
        occurrence_key: '2026-07-10:23:59',
        fire_at: '2026-07-10T22:59:00.000Z',
        target_at: '2026-07-10T23:59:00.000Z',
        title: 'MATH 101: Limits Worksheet',
        body: 'Assignment due in 1 hour.',
        reminder_offset_minutes: 60,
        local_notification_id: 123,
        read_at: null,
        dismissed_at: null,
      })
    ).toMatchObject({
      id: '1',
      sourceType: 'assignment',
      sourceId: '2',
      reminderOffsetMinutes: 60,
      localNotificationId: 123,
    });
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
    expect(itemsByDate.get('2026-07-10')?.map((item) => item.title)).toEqual(expect.arrayContaining(['MATH 101: Limits Worksheet']));
    expect(itemsByDate.get('2026-07-22')?.map((item) => item.title)).toEqual(expect.arrayContaining(['Study Group']));
    expect(itemsByDate.get('2026-07-22')?.find((item) => item.type === 'event')).toMatchObject({
      color: 'var(--calendar-event-bg)',
      textColor: 'var(--calendar-event-text)',
      borderColor: 'var(--calendar-event-border)',
    });
    expect(getCourseColor('course-blue').border).toBeTruthy();
  });

  it('expands event ranges and groups only consecutive study-plan days', () => {
    const rangedEvent = {
      ...events[0],
      id: 'range-1',
      date: '2026-07-30',
      endDate: '2026-08-02',
    };
    const plan = {
      id: 'plan-1',
      courseId: courses[0].id,
      courseCode: courses[0].code,
      courseName: courses[0].name,
      courseColor: courses[0].color,
      courseHomepageUrl: courses[0].homepageUrl,
      examType: 'final' as const,
      examDate: '2026-08-15',
      startDate: '2026-07-01',
      timeZone: 'America/Los_Angeles',
      archived: false,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
      totalTasks: 3,
      completedTasks: 0,
      overdueTasks: 0,
      studyDaysLeft: 3,
      activeTopics: 1,
      nextStudyDate: '2026-07-20',
      nextTaskTitle: 'Read',
    };
    const studyCalendar = {
      from: '2026-06-28',
      to: '2026-08-09',
      plans: [plan],
      tasks: ['2026-07-20', '2026-07-21', '2026-07-23'].map((scheduledDate, index) => ({
        id: `task-${index}`,
        planId: plan.id,
        topicId: 'topic-1',
        phase: 'learn' as const,
        title: `Task ${index}`,
        scheduledDate,
        estimatedMinutes: 30,
        completedAt: null,
        sequence: index,
      })),
    };

    const itemsByDate = buildCalendarItems(2026, 6, [], [], [rangedEvent], courses, studyCalendar);
    const eventSegments = ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'].map(
      (date) => itemsByDate.get(date)?.find((item) => item.type === 'event')
    );
    expect(eventSegments.map((item) => item?.segmentPosition)).toEqual(['start', 'middle', 'middle', 'end']);
    expect(itemsByDate.get('2026-07-20')?.find((item) => item.type === 'study')?.rangeEnd).toBe('2026-07-21');
    expect(itemsByDate.get('2026-07-23')?.find((item) => item.type === 'study')?.segmentPosition).toBe('single');
  });
});
