import { getApiAuthHeaders } from '@/app/lib/api/client';
import type { BrightspaceCalendarPreviewRow } from './parser';

export type BrightspaceImportResponse = {
  createdCourses: number;
  createdAssignments: number;
  createdEvents: number;
  skippedDuplicates: number;
  errors: string[];
};

export async function importBrightspaceCalendarRows(
  rows: BrightspaceCalendarPreviewRow[],
  userId?: string
): Promise<BrightspaceImportResponse> {
  const response = await fetch('/api/brightspace-calendar/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
    body: JSON.stringify({ rows, userId }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }

  return payload as BrightspaceImportResponse;
}
