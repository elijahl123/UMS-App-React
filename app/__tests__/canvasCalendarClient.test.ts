import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthToken } from '@/app/lib/api/client';
import { importCanvasCalendarRows } from '@/app/lib/canvasCalendar/client';
import type { CanvasCalendarPreviewRow } from '@/app/lib/canvasCalendar/parser';

const previewRow: CanvasCalendarPreviewRow = {
  sourceUid: 'canvas-assignment-42',
  title: 'Research paper',
  courseCode: 'ENGL100',
  courseName: 'English 100',
  entryKind: 'homework',
  date: '2026-09-07',
  time: '23:59',
  timezone: 'America/Los_Angeles',
  description: 'Submit the final draft.',
  sourceUrl: 'https://palomar.instructure.com/courses/123/assignments/42',
  rawText: 'BEGIN:VEVENT\nPRIVATE RAW CALENDAR CONTENT\nEND:VEVENT',
  defaultSelected: true,
};

afterEach(() => {
  setApiAuthToken(null);
  vi.unstubAllGlobals();
});

describe('Canvas calendar import client', () => {
  it('sends the app auth token with normalized rows and excludes raw calendar content', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      createdCourses: 0,
      createdAssignments: 1,
      createdEvents: 0,
      skippedDuplicates: 0,
      errors: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    setApiAuthToken('firebase-id-token');

    await importCanvasCalendarRows([previewRow]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const requestInit = init as RequestInit;
    expect(url).toBe('/api/canvas-calendar/import');
    expect(requestInit.headers).toMatchObject({
      Authorization: 'Bearer firebase-id-token',
      'Content-Type': 'application/json',
    });
    expect(requestInit.body).not.toContain('PRIVATE RAW CALENDAR CONTENT');
  });
});
