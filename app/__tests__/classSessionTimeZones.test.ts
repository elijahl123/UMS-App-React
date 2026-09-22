import { describe, expect, it } from 'vitest';
import {
  isClassSessionRezoned,
  localizeClassSession,
  normalizeClockTime,
  scheduledClassTime,
  scheduledClassTimeLabel,
  shiftWeeklyClassTime,
} from '@/app/data/classSchedule';
import {
  describeTimeZone,
  formatUtcOffset,
  isValidTimeZone,
  normalizeTimeZone,
  timeZoneOffsetMinutes,
  timeZoneOptionGroups,
  zonedDateTimeToUtc,
} from '@/lib/timeZones';
import type { ClassSession } from '@/app/data/types';

// Mid-February: no daylight saving anywhere in the zones used below.
const winter = new Date('2026-02-10T12:00:00Z');
const summer = new Date('2026-07-10T12:00:00Z');

describe('time zone primitives', () => {
  it('resolves a wall clock to the instant it names', () => {
    expect(zonedDateTimeToUtc('2026-07-10', '23:59', 'America/Los_Angeles').toISOString()).toBe(
      '2026-07-11T06:59:00.000Z'
    );
    expect(zonedDateTimeToUtc('2026-01-10', '09:00', 'Europe/Dublin').toISOString()).toBe('2026-01-10T09:00:00.000Z');
  });

  it('measures offsets and formats them', () => {
    expect(timeZoneOffsetMinutes('America/New_York', winter)).toBe(-300);
    expect(timeZoneOffsetMinutes('America/New_York', summer)).toBe(-240);
    expect(formatUtcOffset(-300)).toBe('GMT-05:00');
    expect(formatUtcOffset(330)).toBe('GMT+05:30');
    expect(formatUtcOffset(0)).toBe('GMT+00:00');
  });

  it('falls back instead of throwing on an unusable zone', () => {
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(normalizeTimeZone('Mars/Olympus_Mons')).toBe('UTC');
    expect(normalizeTimeZone('', 'America/Denver')).toBe('America/Denver');
    expect(normalizeTimeZone('Europe/Paris')).toBe('Europe/Paris');
  });

  it('offers every zone grouped by region', () => {
    const groups = timeZoneOptionGroups([], winter);
    const america = groups.find((group) => group.region === 'America');
    expect(america?.zones.some((zone) => zone.value === 'America/New_York')).toBe(true);
    expect(describeTimeZone('America/New_York', winter)).toMatchObject({
      city: 'New York',
      region: 'America',
      offsetLabel: 'GMT-05:00',
    });
  });

  it('keeps a zone the runtime does not enumerate selectable', () => {
    const groups = timeZoneOptionGroups(['Mars/Olympus_Mons', 'Pacific/Chatham'], winter);
    const values = groups.flatMap((group) => group.zones.map((zone) => zone.value));
    expect(values).toContain('Pacific/Chatham');
    expect(values).not.toContain('Mars/Olympus_Mons');
  });
});

describe('normalizeClockTime', () => {
  it('reduces stored and human formats to HH:MM', () => {
    expect(normalizeClockTime('09:00:00')).toBe('09:00');
    expect(normalizeClockTime('09:00')).toBe('09:00');
    expect(normalizeClockTime('2:00 p.m.')).toBe('14:00');
    expect(normalizeClockTime('12:00 a.m.')).toBe('00:00');
    expect(normalizeClockTime('12:30 p.m.')).toBe('12:30');
  });

  it('leaves what it cannot parse alone', () => {
    expect(normalizeClockTime('')).toBe('');
    expect(normalizeClockTime('noon')).toBe('noon');
  });
});

describe('shiftWeeklyClassTime', () => {
  it('re-expresses a class in the zone it is being viewed from', () => {
    expect(
      shiftWeeklyClassTime(
        { day: 'Fri', startTime: '09:00', endTime: '10:15' },
        'America/New_York',
        'America/Los_Angeles',
        winter
      )
    ).toEqual({ day: 'Fri', startTime: '06:00', endTime: '07:15' });
  });

  it('follows daylight saving at the date being viewed', () => {
    expect(
      shiftWeeklyClassTime({ day: 'Fri', startTime: '09:00', endTime: '10:00' }, 'America/New_York', 'Europe/Dublin', summer)
    ).toEqual({ day: 'Fri', startTime: '14:00', endTime: '15:00' });
    expect(
      shiftWeeklyClassTime({ day: 'Fri', startTime: '09:00', endTime: '10:00' }, 'America/New_York', 'Europe/Dublin', winter)
    ).toEqual({ day: 'Fri', startTime: '14:00', endTime: '15:00' });
  });

  it('moves the weekday when the conversion crosses midnight', () => {
    expect(
      shiftWeeklyClassTime({ day: 'Mon', startTime: '09:00', endTime: '10:30' }, 'Asia/Tokyo', 'America/New_York', winter)
    ).toEqual({ day: 'Sun', startTime: '19:00', endTime: '20:30' });
    expect(
      shiftWeeklyClassTime(
        { day: 'Fri', startTime: '23:00', endTime: '23:45' },
        'America/Los_Angeles',
        'America/New_York',
        winter
      )
    ).toEqual({ day: 'Sat', startTime: '02:00', endTime: '02:45' });
  });

  it('stops a block that would spill past local midnight at the end of its day', () => {
    expect(
      shiftWeeklyClassTime(
        { day: 'Fri', startTime: '20:30', endTime: '21:30' },
        'America/Los_Angeles',
        'America/New_York',
        winter
      )
    ).toEqual({ day: 'Fri', startTime: '23:30', endTime: '23:59' });
  });

  it('leaves a session alone when it has no zone or is already local', () => {
    expect(
      shiftWeeklyClassTime({ day: 'Wed', startTime: '09:00:00', endTime: '10:15:00' }, null, 'Asia/Tokyo', winter)
    ).toEqual({ day: 'Wed', startTime: '09:00', endTime: '10:15' });
    expect(
      shiftWeeklyClassTime({ day: 'Wed', startTime: '09:00', endTime: '10:15' }, 'Asia/Tokyo', 'Asia/Tokyo', winter)
    ).toEqual({ day: 'Wed', startTime: '09:00', endTime: '10:15' });
  });
});

describe('localizeClassSession', () => {
  const stored = {
    id: '1',
    courseId: '7',
    day: 'Fri' as const,
    startTime: '09:00:00',
    endTime: '10:15:00',
    location: 'Science Center S202',
    timeZone: 'America/New_York',
  };

  it('shows viewer-zone times while keeping what was scheduled', () => {
    const session = localizeClassSession(stored, 'America/Los_Angeles', winter);

    expect(session).toMatchObject({
      id: '1',
      courseId: '7',
      location: 'Science Center S202',
      day: 'Fri',
      startTime: '06:00',
      endTime: '07:15',
      timeZone: 'America/New_York',
      scheduledDay: 'Fri',
      scheduledStartTime: '09:00',
      scheduledEndTime: '10:15',
    });
    expect(scheduledClassTime(session)).toMatchObject({ day: 'Fri', startTime: '09:00', endTime: '10:15' });
  });

  it('treats a session with no stored zone as floating', () => {
    const session = localizeClassSession({ ...stored, timeZone: null }, 'America/Los_Angeles', winter);

    expect(session).toMatchObject({ day: 'Fri', startTime: '09:00', endTime: '10:15', timeZone: undefined });
    expect(isClassSessionRezoned(session, 'America/Los_Angeles')).toBe(false);
  });

  it('flags a session held in another zone', () => {
    const session = localizeClassSession(stored, 'America/Los_Angeles', winter) as ClassSession;

    expect(isClassSessionRezoned(session, 'America/Los_Angeles')).toBe(true);
    expect(isClassSessionRezoned(session, 'America/New_York')).toBe(false);
    expect(scheduledClassTimeLabel(session)).toMatch(/^Friday 9:00 a\.m\. - 10:15 a\.m\. /);
    expect(scheduledClassTimeLabel({ ...session, timeZone: undefined })).toBeNull();
  });
});
