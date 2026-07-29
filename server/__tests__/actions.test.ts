import { describe, expect, it } from 'vitest';
import { getActionQuery } from '../actions';

describe('event action ranges', () => {
  it('persists an inclusive end date for multi-day events', () => {
    const query = getActionQuery('createEvent', {
      title: 'Conference',
      date: '2026-07-20',
      endDate: '2026-07-23',
      time: null,
      endTime: null,
      timeZone: 'America/Los_Angeles',
      userId: 'user-1',
    });

    expect(query?.values).toEqual([
      'Conference',
      '2026-07-20',
      '2026-07-23',
      null,
      null,
      'America/Los_Angeles',
      null,
      'user-1',
    ]);
  });

  it('normalizes same-day ranges and rejects invalid timed ranges', () => {
    expect(
      getActionQuery('createEvent', {
        title: 'Office hours',
        date: '2026-07-20',
        endDate: '2026-07-20',
        userId: 'user-1',
      })?.values?.[2]
    ).toBeNull();

    expect(() =>
      getActionQuery('createEvent', {
        title: 'Backwards',
        date: '2026-07-20',
        endDate: '2026-07-19',
        userId: 'user-1',
      })
    ).toThrow(/cannot be before/i);

    expect(() =>
      getActionQuery('createEvent', {
        title: 'Bad time',
        date: '2026-07-20',
        time: '18:00',
        endTime: '17:00',
        userId: 'user-1',
      })
    ).toThrow(/must be after/i);
  });
});

describe('course homepage actions', () => {
  it('normalizes and persists homepage URLs for course creates and updates', () => {
    const create = getActionQuery('createCourse', {
      code: 'MATH 101',
      name: 'Calculus',
      color: 'course-blue',
      homepageUrl: ' courses.example.edu/math ',
      userId: 'user-1',
    });
    const update = getActionQuery('updateCourse', {
      id: '1',
      code: 'MATH 101',
      name: 'Calculus',
      color: 'course-blue',
      homepageUrl: '',
      userId: 'user-1',
    });

    expect(create?.values).toEqual([
      'MATH 101',
      'Calculus',
      'course-blue',
      'https://courses.example.edu/math',
      'user-1',
    ]);
    expect(update?.values?.[3]).toBeNull();
    expect(create?.text).toContain('homepage_url');
    expect(update?.text).toContain('homepage_url = $4');
  });

  it('rejects unsupported course homepage protocols', () => {
    expect(() => getActionQuery('createCourse', {
      code: 'MATH 101',
      name: 'Calculus',
      homepageUrl: 'ftp://courses.example.edu',
      userId: 'user-1',
    })).toThrow(/valid homepage url/i);
  });
});
