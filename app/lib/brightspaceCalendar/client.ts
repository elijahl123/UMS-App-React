import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';
import type { BrightspaceCalendarPreviewRow } from './parser';

export type BrightspaceImportResponse = {
  createdCourses: number;
  createdAssignments: number;
  createdEvents: number;
  skippedDuplicates: number;
  errors: string[];
};

export function rowsForBrightspaceImport(rows: BrightspaceCalendarPreviewRow[]) {
  return rows.map((row) => ({
    title: row.title,
    courseCode: row.courseCode,
    courseName: row.courseName,
    entryKind: row.entryKind,
    date: row.date,
    time: row.time,
    endDate: row.endDate,
    endTime: row.endTime,
    sourceLabel: row.sourceLabel,
  }));
}

export async function importBrightspaceCalendarRows(
  rows: BrightspaceCalendarPreviewRow[],
  userId?: string
): Promise<BrightspaceImportResponse> {
  const response = await apiFetch('/brightspace-calendar/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
    body: JSON.stringify({ rows: rowsForBrightspaceImport(rows), userId }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }

  return payload as BrightspaceImportResponse;
}
