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

  it('parses Due entries and coursework availability rows as homework', () => {
    const rows = parseBrightspaceCalendarText(`
      Agenda
      Page 1 of 2
      COMP30870-Graph Algorithms-2025/26 Spring
      Mid-Term Assignment (50%) - Due 01 March 2026 11:59 PM
      Practical 2 - Available 03 February 2026 4:00 PM
      Office Hours - Available 04 February 2026 2:00 PM
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
        entryKind: 'homework',
        date: '2026-02-03',
        time: '16:00',
        sourceLabel: 'Available',
      }),
      expect.objectContaining({
        title: 'Office Hours',
        courseCode: 'COMP30870',
        entryKind: 'event',
        date: '2026-02-04',
        time: '14:00',
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

  it('parses pasted Brightspace print text with encoded dashes and duplicate detail rows', () => {
    const rows = parseBrightspaceCalendarText(`
      Practical 2 â€“ Available 03 February 2026 4:00 PM
      MATH10210-Found. of Math. for Com.Sc. I-2025/26 Spring
      Homework 2 solutions â€“ Available 03 February 2026 5:00 PM
      MATH10210-Found. of Math. for Com.Sc. I-2025/26 Spring
      7/14/26, 4:50 PM Print - University College Dublin
      https://brightspace.ucd.ie/d2l/le/calendar/6606 1/12
      Mid-Term Assignment - Due 01 March 2026 11:59 PM
      COMP30870-Graph Algorithms-2025/26 Spring
      Mid-Term Assignment
      Mid-Term Assignment (50%) - Due 01 March 2026 11:59 PM
      COMP30870-Graph Algorithms-2025/26 Spring
      Due 1 March at 11:59 PM
      Due 1 March at 11:59 PM
      Mid-Term Assignment
      Assignment
      Mid-Term Assignment (50%) - Due 01 March 2026 11:59 PM
      COMP30870-Graph Algorithms-2025/26 Spring
      Group Project (30% of your final grade) - Due 22 March 2026 11:30 PM
      COMP30770- Programming for Big Data-2025/26 Spring
    `);

    expect(rows).toEqual([
      expect.objectContaining({
        title: 'Practical 2',
        courseCode: 'MATH10210',
        entryKind: 'homework',
        date: '2026-02-03',
        time: '16:00',
        sourceLabel: 'Available',
      }),
      expect.objectContaining({
        title: 'Homework 2 solutions',
        courseCode: 'MATH10210',
        entryKind: 'homework',
        date: '2026-02-03',
        time: '17:00',
      }),
      expect.objectContaining({
        title: 'Mid-Term Assignment',
        courseCode: 'COMP30870',
        entryKind: 'homework',
        date: '2026-03-01',
        time: '23:59',
      }),
      expect.objectContaining({
        title: 'Mid-Term Assignment (50%)',
        courseCode: 'COMP30870',
        entryKind: 'homework',
        date: '2026-03-01',
        time: '23:59',
      }),
      expect.objectContaining({
        title: 'Group Project (30% of your final grade)',
        courseCode: 'COMP30770',
        courseName: 'Programming for Big Data',
        entryKind: 'homework',
        date: '2026-03-22',
        time: '23:30',
      }),
    ]);
  });
});
