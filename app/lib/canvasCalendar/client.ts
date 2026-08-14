import { apiFetch } from '@/app/lib/api/client';
import type { CanvasCalendarPreviewRow } from './parser';

export type CanvasImportResponse = {
  createdCourses: number;
  createdAssignments: number;
  createdEvents: number;
  skippedDuplicates: number;
  errors: string[];
};

export function rowsForCanvasImport(rows: CanvasCalendarPreviewRow[]) {
  return rows.map((row) => ({
    sourceUid: row.sourceUid,
    title: row.title,
    courseCode: row.courseCode,
    courseName: row.courseName,
    entryKind: row.entryKind,
    date: row.date,
    time: row.time,
    endDate: row.endDate,
    endTime: row.endTime,
    timezone: row.timezone,
    description: row.description,
    sourceUrl: row.sourceUrl,
  }));
}

export async function importCanvasCalendarRows(rows: CanvasCalendarPreviewRow[]): Promise<CanvasImportResponse> {
  const response = await apiFetch('/canvas-calendar/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: rowsForCanvasImport(rows) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw payload ?? { error: { message: 'CANVAS_IMPORT_FAILED' } };
  return payload as CanvasImportResponse;
}
