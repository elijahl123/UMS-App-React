import { describe, expect, it } from 'vitest';
import { rowsForCanvasImport } from '@/app/lib/canvasCalendar/client';
import { parseCanvasIcsText } from '@/app/lib/canvasCalendar/parser';

function calendar(events: string) {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Canvas//Calendar//EN\r\n${events}\r\nEND:VCALENDAR`;
}

describe('Canvas calendar parser', () => {
  it('parses all-day, UTC, TZID, and floating events without uploading raw ICS text', () => {
    const parsed = parseCanvasIcsText(calendar(`BEGIN:VEVENT
UID:all-day-1
SUMMARY:Campus closure
DTSTART;VALUE=DATE:20260907
DTEND;VALUE=DATE:20260908
END:VEVENT
BEGIN:VEVENT
UID:utc-1
SUMMARY:Online review
DTSTART:20260908T170000Z
END:VEVENT
BEGIN:VEVENT
UID:tzid-1
SUMMARY:Evening workshop
DTSTART;TZID=America/New_York:20260909T183000
END:VEVENT
BEGIN:VEVENT
UID:floating-1
SUMMARY:Study group
DTSTART:20260910T140000
END:VEVENT`));

    expect(parsed.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceUid: 'all-day-1', date: '2026-09-07', endDate: '2026-09-08', time: undefined }),
      expect.objectContaining({ sourceUid: 'utc-1', date: '2026-09-08', time: '17:00', timezone: 'UTC' }),
      expect.objectContaining({ sourceUid: 'tzid-1', time: '18:30', timezone: 'America/New_York' }),
      expect.objectContaining({ sourceUid: 'floating-1', time: '14:00', timezone: 'America/Los_Angeles' }),
    ]));

    const uploadRows = rowsForCanvasImport(parsed.rows);
    expect(uploadRows[0]).not.toHaveProperty('rawText');
    expect(uploadRows[0]).not.toHaveProperty('warning');
    expect(uploadRows[0]).not.toHaveProperty('defaultSelected');
  });

  it('unfolds and unescapes fields and recognizes Canvas assignment URLs', () => {
    const [row] = parseCanvasIcsText(calendar(`BEGIN:VEVENT
UID:assignment_42
SUMMARY:ENGL 100 Essay\\, draft
DESCRIPTION:Read chapter 4\\nThen write the
 next section
URL:https://palomar.instructure.com/courses/123/assignments/42
DTSTART;TZID=America/Los_Angeles:20261001T235900
CATEGORIES:ENGL 100
END:VEVENT`)).rows;

    expect(row).toMatchObject({
      title: 'ENGL 100 Essay, draft',
      description: 'Read chapter 4\nThen write thenext section',
      entryKind: 'homework',
      courseCode: 'ENGL100',
      date: '2026-10-01',
      time: '23:59',
      defaultSelected: true,
    });
  });

  it('defaults uncertain entries to events and requires course review for assignments', () => {
    const parsed = parseCanvasIcsText(calendar(`BEGIN:VEVENT
UID:general-1
SUMMARY:Student club meeting
DTSTART:20260911T120000
END:VEVENT
BEGIN:VEVENT
UID:assignment_99
SUMMARY:Final essay
URL:https://palomar.instructure.com/courses/123/assignments/99
DTSTART:20261201T235900
END:VEVENT`));

    expect(parsed.rows[0]).toMatchObject({ entryKind: 'event', courseCode: '', defaultSelected: true });
    expect(parsed.rows[1]).toMatchObject({ entryKind: 'homework', courseCode: '', defaultSelected: false });
    expect(parsed.rows[1].warning).toContain('Choose a course');
  });

  it('warns about duplicate UIDs, recurrence rules, and malformed entries', () => {
    const parsed = parseCanvasIcsText(calendar(`BEGIN:VEVENT
UID:repeat-1
SUMMARY:Recurring office hours
DTSTART:20260907T090000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
BEGIN:VEVENT
UID:repeat-1
SUMMARY:Duplicate office hours
DTSTART:20260914T090000
END:VEVENT
BEGIN:VEVENT
UID:missing-start
SUMMARY:Malformed event
END:VEVENT`));

    expect(parsed.rows[0]).toMatchObject({ defaultSelected: false });
    expect(parsed.rows[0].warning).toContain('Recurring rules are not expanded');
    expect(parsed.rows[1]).toMatchObject({ defaultSelected: false });
    expect(parsed.rows[1].warning).toContain('Duplicate Canvas UID');
    expect(parsed.warnings).toContain('Event 3 was skipped because its title, UID, or start date is missing.');
  });

  it('rejects non-calendars and more than 2,000 explicit events', () => {
    expect(() => parseCanvasIcsText('not a calendar')).toThrow('valid Canvas .ics');
    const events = Array.from({ length: 2_001 }, (_, index) => `BEGIN:VEVENT\nUID:${index}\nSUMMARY:Event ${index}\nDTSTART:20260907\nEND:VEVENT`).join('\n');
    expect(() => parseCanvasIcsText(calendar(events))).toThrow('at most 2,000 events');
  });
});
