import { describe, expect, it } from 'vitest';
import { parseBrightspaceCalendarPages, parseBrightspaceCalendarText, parseBrightspaceCourseLine } from '@/app/lib/brightspaceCalendar/parser';

describe('Brightspace calendar parser', () => {
  it('parses course lines', () => {
    expect(parseBrightspaceCourseLine('COMP30870-Graph Algorithms-2025/26 Spring')).toEqual({
      code: 'COMP30870',
      name: 'Graph Algorithms',
      raw: 'COMP30870-Graph Algorithms-2025/26 Spring',
    });
  });

  it('parses Due entries as homework and Available entries as events', () => {
    const rows = parseBrightspaceCalendarText(`
      Agenda
      Page 1 of 2
      COMP30870-Graph Algorithms-2025/26 Spring
      Mid-Term Assignment (50%) - Due 01 March 2026 11:59 PM
      Practical 2 - Available 03 February 2026 4:00 PM
    `);

    expect(rows).toEqual([
      expect.objectContaining({
        title: 'Mid-Term Assignment (50%)',
        courseCode: 'COMP30870',
        courseName: 'Graph Algorithms',
        entryKind: 'homework',
        date: '2026-03-01',
        time: '23:59',
        sourceLabel: 'Due',
      }),
      expect.objectContaining({
        title: 'Practical 2',
        courseCode: 'COMP30870',
        entryKind: 'event',
        date: '2026-02-03',
        time: '16:00',
        sourceLabel: 'Available',
      }),
    ]);
  });

  it('associates entry-first agenda rows with the following course line', () => {
    const rows = parseBrightspaceCalendarText(`
      Mid-Term Assignment (50%) - Due 01 March 2026 11:59 PM
      COMP30870-Graph Algorithms-2025/26 Spring
    `);

    expect(rows[0]).toMatchObject({
      title: 'Mid-Term Assignment (50%)',
      courseCode: 'COMP30870',
    });
  });

  it('ignores headers and joins page-break continuations', () => {
    const rows = parseBrightspaceCalendarPages([
      `
        Calendar
        COMP30870-Graph Algorithms-2025/26 Spring
        Research Essay - Due 12 April
      `,
      `
        Page 2 of 2
        2026 11:59 PM
      `,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Research Essay',
      entryKind: 'homework',
      date: '2026-04-12',
      time: '23:59',
    });
  });
});
