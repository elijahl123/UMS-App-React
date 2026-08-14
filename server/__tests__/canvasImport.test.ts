import { describe, expect, it } from 'vitest';
import {
  CANVAS_SOURCE_PROVIDER,
  importCanvasRows,
  normalizeCanvasImportRows,
  type CanvasImportRow,
} from '../canvasImport';

function row(overrides: Partial<CanvasImportRow> = {}): CanvasImportRow {
  return {
    sourceUid: 'canvas-assignment-42',
    title: 'Essay draft',
    courseCode: 'ENGL100',
    courseName: 'English Composition',
    entryKind: 'homework',
    date: '2026-10-01',
    time: '23:59',
    timezone: 'America/Los_Angeles',
    ...overrides,
  };
}

class FakeCanvasClient {
  courses = new Map<string, string>();
  assignments = new Set<string>();
  assignmentSourceKeys = new Set<string>();
  events = new Set<string>();

  async query(text: string, values?: unknown[]) {
    if (text.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (text.includes('SELECT a.id') && text.includes('FROM assignments')) {
      const sourceKey = String(values?.[2]);
      return this.assignmentSourceKeys.has(sourceKey) ? { rows: [{ id: '1' }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (text.includes('INSERT INTO courses')) {
      const key = `${String(values?.[0])}:${String(values?.[1])}`;
      const existing = this.courses.get(key);
      if (existing) return { rows: [{ id: existing, created: false }], rowCount: 1 };
      const id = String(this.courses.size + 1);
      this.courses.set(key, id);
      return { rows: [{ id, created: true }], rowCount: 1 };
    }
    if (text.includes('INSERT INTO assignments')) {
      expect(values?.[6]).toBe(CANVAS_SOURCE_PROVIDER);
      const key = `${String(values?.[0])}:${String(values?.[6])}:${String(values?.[7])}`;
      if (this.assignments.has(key)) return { rows: [], rowCount: 0 };
      this.assignments.add(key);
      this.assignmentSourceKeys.add(String(values?.[7]));
      return { rows: [{ id: this.assignments.size }], rowCount: 1 };
    }
    if (text.includes('INSERT INTO events')) {
      expect(values?.[8]).toBe(CANVAS_SOURCE_PROVIDER);
      const key = `${String(values?.[7])}:${String(values?.[8])}:${String(values?.[9])}`;
      if (this.events.has(key)) return { rows: [], rowCount: 0 };
      this.events.add(key);
      return { rows: [{ id: this.events.size }], rowCount: 1 };
    }
    if (text.includes('INSERT INTO launch_onboarding')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query: ${text}`);
  }
}

describe('Canvas calendar import', () => {
  it('normalizes fields, preserves explicit timezones, and discards unsafe URLs', () => {
    const [normalized] = normalizeCanvasImportRows([row({
      courseCode: ' engl100 ',
      time: '23:59:00',
      timezone: 'America/New_York',
      sourceUrl: 'https://palomar.instructure.com/courses/1/assignments/42?token=do-not-store#details',
    })]);
    expect(normalized).toMatchObject({
      courseCode: 'ENGL100',
      time: '23:59',
      timezone: 'America/New_York',
      sourceUrl: 'https://palomar.instructure.com/courses/1/assignments/42',
    });
    expect(normalizeCanvasImportRows([row({ sourceUrl: 'javascript:alert(1)' })])[0].sourceUrl).toBeUndefined();
  });

  it('requires courses for homework while allowing unassigned general events', () => {
    expect(() => normalizeCanvasImportRows([row({ courseCode: '', courseName: '' })])).toThrow('needs a course');
    expect(normalizeCanvasImportRows([row({
      sourceUid: 'general-1',
      entryKind: 'event',
      courseCode: '',
      courseName: '',
    })])[0]).toMatchObject({ entryKind: 'event', courseCode: '' });
  });

  it('rejects unsupported timezones and the server row limit', () => {
    expect(() => normalizeCanvasImportRows([row({ timezone: 'Mars/Olympus_Mons' })])).toThrow('Unsupported timezone');
    expect(() => normalizeCanvasImportRows(Array.from({ length: 2_001 }, () => row()))).toThrow('no more than 2,000');
  });

  it('creates selected normalized rows and skips stable UID duplicates on re-import', async () => {
    const client = new FakeCanvasClient();
    const rows = normalizeCanvasImportRows([
      row(),
      row({
        sourceUid: 'general-1',
        title: 'Student club meeting',
        entryKind: 'event',
        courseCode: '',
        courseName: '',
        time: '12:00',
      }),
    ]);

    expect(await importCanvasRows(client as any, 'user-1', rows)).toEqual({
      createdCourses: 1,
      createdAssignments: 1,
      createdEvents: 1,
      skippedDuplicates: 0,
      errors: [],
    });
    expect(await importCanvasRows(client as any, 'user-1', rows)).toMatchObject({
      createdCourses: 0,
      createdAssignments: 0,
      createdEvents: 0,
      skippedDuplicates: 2,
      errors: [],
    });

    const movedCourseResult = await importCanvasRows(client as any, 'user-1', normalizeCanvasImportRows([
      row({ courseCode: 'ENGL200', courseName: 'A different course association' }),
    ]));
    expect(movedCourseResult).toMatchObject({ createdCourses: 0, createdAssignments: 0, skippedDuplicates: 1, errors: [] });
  });
});
