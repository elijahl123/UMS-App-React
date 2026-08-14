import { useId, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CalendarArrowDown, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { importCanvasCalendarRows, type CanvasImportResponse } from '@/app/lib/canvasCalendar/client';
import { parseCanvasIcsText, type CanvasCalendarPreviewRow } from '@/app/lib/canvasCalendar/parser';
import { trackProductEvent } from '@/app/lib/launch/client';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const mutationEvent = 'ums-api-action-mutated';

function requestError(err: unknown): string {
  const response = err as { error?: { message?: string } };
  return response?.error?.message ?? (err instanceof Error ? err.message : 'Unable to import that Canvas calendar.');
}

function publishImportMutations() {
  ['createCourse', 'createAssignment', 'createEvent'].forEach((name) => {
    window.dispatchEvent(new CustomEvent(mutationEvent, { detail: { name } }));
  });
}

export default function CanvasIcsImportCard() {
  const inputId = useId();
  const [rows, setRows] = useState<CanvasCalendarPreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CanvasImportResponse | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setResult(null);
    setRows([]);
    setSelected(new Set());
    setWarnings([]);
    if (file.size > MAX_FILE_BYTES) {
      setError('Choose a Canvas calendar file smaller than 5 MiB.');
      return;
    }
    try {
      const parsed = parseCanvasIcsText(await file.text());
      setRows(parsed.rows);
      setWarnings(parsed.warnings);
      setSelected(new Set(parsed.rows.flatMap((row, index) => row.defaultSelected ? [index] : [])));
      void trackProductEvent('import_started', { sourceType: 'canvas_ics' });
    } catch (err) {
      setError(requestError(err));
      void trackProductEvent('import_failed', { sourceType: 'canvas_ics', errorCount: 1 });
    }
  };

  const updateRow = (index: number, patch: Partial<CanvasCalendarPreviewRow>) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const toggle = (index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectedRows = rows.filter((_row, index) => selected.has(index));
  const missingCourse = selectedRows.some((row) => row.entryKind === 'homework' && !row.courseCode.trim());

  const handleImport = async () => {
    if (!selectedRows.length || missingCourse) return;
    setLoading(true);
    setError(null);
    setResult(null);
    void trackProductEvent('import_reviewed', {
      sourceType: 'canvas_ics',
      savedCount: selectedRows.length,
      rejectedCount: rows.length - selectedRows.length,
    });
    try {
      const response = await importCanvasCalendarRows(selectedRows);
      setResult(response);
      publishImportMutations();
      const savedCount = response.createdAssignments + response.createdEvents;
      if (savedCount >= 3) void trackProductEvent('import_completed', { sourceType: 'canvas_ics', savedCount });
    } catch (err) {
      setError(requestError(err));
      void trackProductEvent('import_failed', { sourceType: 'canvas_ics', errorCount: 1 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><CalendarArrowDown className="h-5 w-5" /></div>
          <div>
            <CardTitle>Import Canvas calendar</CardTitle>
            <CardDescription>Export your Canvas calendar as an .ics file, review every item here, then save only what you choose.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
          The file is read only in this browser. UMS sends no raw calendar file, Canvas password, or calendar-feed token to the server.
        </div>
        <div>
          <input id={inputId} className="sr-only" type="file" accept=".ics,text/calendar" onChange={handleFile} />
          <Button asChild variant="outline"><label htmlFor={inputId} className="cursor-pointer gap-2"><FileUp className="h-4 w-4" />Choose Canvas .ics file</label></Button>
        </div>
        {warnings.map((warning) => <p key={warning} className="flex gap-2 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</p>)}
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        {rows.length > 0 && (
          <div className="grid gap-3" aria-label="Canvas calendar import preview">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Review {rows.length} event{rows.length === 1 ? '' : 's'}</p>
              <p className="text-xs text-muted-foreground">{selected.size} selected</p>
            </div>
            {rows.map((row, index) => (
              <article key={`${row.sourceUid}-${index}`} className="grid gap-3 rounded-lg border p-3">
                <label className="flex items-start gap-3">
                  <input className="mt-1 h-4 w-4 accent-primary" type="checkbox" checked={selected.has(index)} onChange={() => toggle(index)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{row.title}</span>
                    <span className="block text-xs text-muted-foreground">{row.date}{row.time ? ` at ${row.time}` : ' · all day'} · {row.timezone}</span>
                  </span>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-medium">Title<Input value={row.title} onChange={(event) => updateRow(index, { title: event.target.value })} /></label>
                  <label className="grid gap-1 text-xs font-medium">Type
                    <select className="h-10 rounded-md border bg-background px-3 text-sm" value={row.entryKind} onChange={(event) => updateRow(index, { entryKind: event.target.value as CanvasCalendarPreviewRow['entryKind'] })}>
                      <option value="event">Event</option><option value="homework">Homework</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium">Date<Input type="date" value={row.date} onChange={(event) => updateRow(index, { date: event.target.value })} /></label>
                  <label className="grid gap-1 text-xs font-medium">Time<Input type="time" value={row.time ?? ''} onChange={(event) => updateRow(index, { time: event.target.value || undefined })} /></label>
                  <label className="grid gap-1 text-xs font-medium">Course code {row.entryKind === 'homework' ? '(required)' : '(optional)'}<Input value={row.courseCode} onChange={(event) => updateRow(index, { courseCode: event.target.value.toUpperCase() })} placeholder="ENG100" /></label>
                  <label className="grid gap-1 text-xs font-medium">Course name<Input value={row.courseName} onChange={(event) => updateRow(index, { courseName: event.target.value })} placeholder="English Composition" /></label>
                </div>
                {row.warning && <p className="flex gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />{row.warning}</p>}
              </article>
            ))}
            {missingCourse && <p role="alert" className="text-sm text-destructive">Every selected homework item needs a course code.</p>}
            <Button className="w-full gap-2 sm:w-fit" disabled={loading || selectedRows.length === 0 || missingCourse} onClick={() => void handleImport()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {loading ? 'Importing…' : `Import ${selectedRows.length} selected`}
            </Button>
          </div>
        )}
        {result && (
          <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/55 dark:text-emerald-100">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Canvas import complete</p>
            <p>Created {result.createdCourses} course{result.createdCourses === 1 ? '' : 's'}, {result.createdAssignments} homework item{result.createdAssignments === 1 ? '' : 's'}, and {result.createdEvents} event{result.createdEvents === 1 ? '' : 's'}. Skipped {result.skippedDuplicates} duplicate{result.skippedDuplicates === 1 ? '' : 's'}.</p>
            {result.errors.map((message) => <p key={message}>{message}</p>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
