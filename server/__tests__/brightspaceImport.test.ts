import { describe, expect, it } from 'vitest';
import {
  BRIGHTSPACE_SOURCE_PROVIDER,
  buildBrightspaceSourceKey,
  importBrightspaceRows,
  normalizeBrightspaceImportRows,
  type BrightspaceImportRow,
} from '../brightspaceImport';

function row(overrides: Partial<BrightspaceImportRow> = {}): BrightspaceImportRow {
  return {
    title: 'Mid-Term Assignment (50%)',
    courseCode: 'COMP30870',
    courseName: 'Graph Algorithms',
    entryKind: 'homework',
    date: '2026-03-01',
    time: '23:59',
    sourceLabel: 'Due',
    rawText: 'COMP30870-Graph Algorithms-2025/26 Spring\nMid-Term Assignment (50%) - Due 01 March 2026 11:59 PM',
    ...overrides,
  };
}

class FakeImportClient {
  courses = new Map<string, { id: string; created: boolean }>();
  assignments = new Set<string>();
  events = new Set<string>();

  async query(text: string, values?: unknown[]) {
    if (text.includes('INSERT INTO courses')) {
      const userId = String(values?.[0]);
      const code = String(values?.[1]);
      const key = `${userId}:${code}`;
      const existing = this.courses.get(key);
      if (existing) {
        return { rows: [{ id: existing.id, created: false }], rowCount: 1 };
      }

      const course = { id: String(this.courses.size + 1), created: true };
      this.courses.set(key, course);
      return { rows: [course], rowCount: 1 };
    }

    if (text.includes('INSERT INTO assignments')) {
      const courseId = String(values?.[0]);
      const sourceProvider = String(values?.[6]);
      const sourceKey = String(values?.[7]);
      expect(sourceProvider).toBe(BRIGHTSPACE_SOURCE_PROVIDER);
      const key = `${courseId}:${sourceProvider}:${sourceKey}`;
      if (this.assignments.has(key)) {
        return { rows: [], rowCount: 0 };
      }

      this.assignments.add(key);
      return { rows: [{ id: this.assignments.size }], rowCount: 1 };
    }

    if (text.includes('INSERT INTO events')) {
      const userId = String(values?.[5]);
      const sourceProvider = String(values?.[6]);
      const sourceKey = String(values?.[7]);
      expect(sourceProvider).toBe(BRIGHTSPACE_SOURCE_PROVIDER);
      const key = `${userId}:${sourceProvider}:${sourceKey}`;
      if (this.events.has(key)) {
        return { rows: [], rowCount: 0 };
      }

      this.events.add(key);
      return { rows: [{ id: this.events.size }], rowCount: 1 };
    }

    throw new Error(`Unexpected query: ${text}`);
  }
}

describe('Brightspace PDF importer', () => {
  it('normalizes submitted rows and builds deterministic source keys', () => {
    const normalized = normalizeBrightspaceImportRows([
      row({
        courseCode: ' comp30870 ',
        time: '23:59:00',
      }),
    ]);

    expect(normalized[0]).toMatchObject({ courseCode: 'COMP30870', time: '23:59' });
    expect(buildBrightspaceSourceKey(normalized[0])).toBe('comp30870|mid-term assignment (50%)|homework|2026-03-01|23:59');
  });

  it('creates each missing course once and imports assignments and events', async () => {
    const client = new FakeImportClient();
    const result = await importBrightspaceRows(client as any, 'user-1', [
      row(),
      row({
        title: 'Practical 2',
        entryKind: 'event',
        date: '2026-02-03',
        time: '16:00',
        sourceLabel: 'Available',
        rawText: 'COMP30870-Graph Algorithms-2025/26 Spring\nPractical 2 - Available 03 February 2026 4:00 PM',
      }),
    ]);

    expect(result).toEqual({
      createdCourses: 1,
      createdAssignments: 1,
      createdEvents: 1,
      skippedDuplicates: 0,
      errors: [],
    });
  });

  it('skips duplicate imported rows without creating another local record', async () => {
    const client = new FakeImportClient();
    const rows = [row()];

    await importBrightspaceRows(client as any, 'user-1', rows);
    const result = await importBrightspaceRows(client as any, 'user-1', rows);

    expect(result).toMatchObject({
      createdCourses: 0,
      createdAssignments: 0,
      createdEvents: 0,
      skippedDuplicates: 1,
      errors: [],
    });
  });
});
