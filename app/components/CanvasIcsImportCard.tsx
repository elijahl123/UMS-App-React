import { Fragment, useEffect, useId, useMemo, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CalendarArrowDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  FileUp,
  Loader2,
  Pencil,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { importCanvasCalendarRows, type CanvasImportResponse } from '@/app/lib/canvasCalendar/client';
import { parseCanvasIcsText, type CanvasCalendarPreviewRow } from '@/app/lib/canvasCalendar/parser';
import { trackProductEvent } from '@/app/lib/launch/client';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 50;
const mutationEvent = 'ums-api-action-mutated';

type ReviewFilter = 'all' | 'selected' | 'homework' | 'events' | 'needs_review';

function requestError(err: unknown): string {
  const response = err as { error?: { message?: string } };
  return response?.error?.message ?? (err instanceof Error ? err.message : 'Unable to import that Canvas calendar.');
}

function formatPreviewDate(row: CanvasCalendarPreviewRow): string {
  const date = new Date(`${row.date}T00:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? row.date
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return row.time ? `${dateLabel} ${row.time}` : `${dateLabel} · All day`;
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [page, setPage] = useState(1);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setResult(null);
    setRows([]);
    setSelected(new Set());
    setWarnings([]);
    setEditingIndex(null);
    setQuery('');
    setReviewFilter('all');
    setPage(1);
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
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.flatMap((row, index) => {
      const matchesQuery = !normalizedQuery || [row.title, row.courseCode, row.courseName]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesReviewFilter = reviewFilter === 'all'
        || (reviewFilter === 'selected' && selected.has(index))
        || (reviewFilter === 'homework' && row.entryKind === 'homework')
        || (reviewFilter === 'events' && row.entryKind === 'event')
        || (reviewFilter === 'needs_review' && Boolean(row.warning || (row.entryKind === 'homework' && !row.courseCode.trim())));
      return matchesQuery && matchesReviewFilter ? [{ row, index }] : [];
    });
  }, [query, reviewFilter, rows, selected]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const setFilteredSelection = (shouldSelect: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      filteredRows.forEach(({ index }) => {
        if (shouldSelect) next.add(index);
        else next.delete(index);
      });
      return next;
    });
  };

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
    <Card className="h-auto">
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarArrowDown className="h-5 w-5 shrink-0 text-primary" />
          <CardTitle className="min-w-0 break-words text-lg leading-snug sm:text-2xl">Import Canvas calendar</CardTitle>
        </div>
        <CardDescription className="break-words">Choose a Canvas .ics file, review the calendar in a compact list, and save only what you want.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="grid min-w-0 gap-1">
            <p className="text-sm font-semibold text-foreground">Need help finding the Canvas .ics file?</p>
            <p className="text-sm text-muted-foreground">Open the short Canvas Calendar Feed instructions.</p>
          </div>
          <Button type="button" variant="outline" className="w-full shrink-0 gap-2 sm:w-auto" onClick={() => setGuideOpen(true)}>
            <FileQuestion className="h-4 w-4" />
            View instructions
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <input id={inputId} className="sr-only" type="file" accept=".ics,text/calendar" aria-label="Canvas calendar .ics file" onChange={handleFile} />
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <label htmlFor={inputId} className="cursor-pointer gap-2"><FileUp className="h-4 w-4" />Choose Canvas .ics file</label>
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">Parsed in this browser. The raw file and Canvas feed token are never uploaded.</p>
        </div>

        {warnings.length > 0 && (
          <details className="rounded-md border border-[color-mix(in_srgb,var(--course-citrine)_50%,var(--surface))] bg-[color-mix(in_srgb,var(--course-citrine)_24%,var(--surface))] p-3 text-sm text-[color-mix(in_srgb,var(--course-citrine)_68%,var(--secondary-accent))]">
            <summary className="cursor-pointer font-semibold">{warnings.length} file warning{warnings.length === 1 ? '' : 's'}</summary>
            <div className="mt-2 max-h-32 space-y-2 overflow-auto">
              {warnings.map((warning) => <p key={warning} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</p>)}
            </div>
          </details>
        )}
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

        {rows.length > 0 && (
          <div className="flex min-w-0 flex-col gap-3" aria-label="Canvas calendar import preview">
            <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">Review calendar</p>
                  <Badge variant="secondary">{rows.length} found</Badge>
                  <Badge variant="outline">{selected.size} selected</Badge>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={filteredRows.length === 0} onClick={() => setFilteredSelection(true)}>Select shown</Button>
                  <Button type="button" variant="outline" size="sm" disabled={filteredRows.length === 0} onClick={() => setFilteredSelection(false)}>Clear shown</Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <label className="relative min-w-0">
                  <span className="sr-only">Search Canvas events</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search title or course" />
                </label>
                <label>
                  <span className="sr-only">Filter Canvas events</span>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reviewFilter} onChange={(event) => { setReviewFilter(event.target.value as ReviewFilter); setPage(1); }}>
                    <option value="all">All items</option>
                    <option value="selected">Selected</option>
                    <option value="homework">Homework</option>
                    <option value="events">Events</option>
                    <option value="needs_review">Needs review</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="max-h-[28rem] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="w-10"><span className="sr-only">Selected</span></TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden md:table-cell">Course</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-20">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map(({ row, index }) => (
                    <Fragment key={`${row.sourceUid}-${index}`}>
                      <TableRow data-state={selected.has(index) ? 'selected' : undefined}>
                        <TableCell>
                          <input className="h-4 w-4 accent-primary" type="checkbox" aria-label={`Select ${row.title}`} checked={selected.has(index)} onChange={() => toggle(index)} />
                        </TableCell>
                        <TableCell className="min-w-44 font-medium">
                          <span className="flex items-start gap-2">
                            <span className="min-w-0 break-words">{row.title}</span>
                            {row.warning && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color-mix(in_srgb,var(--course-citrine)_62%,var(--secondary-accent))]" aria-label="Needs review" />}
                          </span>
                          <span className="mt-1 block text-xs font-normal text-muted-foreground md:hidden">{row.courseCode || row.courseName || 'No course'}</span>
                        </TableCell>
                        <TableCell className="hidden min-w-32 md:table-cell">
                          <span className="font-semibold">{row.courseCode || '—'}</span>
                          {row.courseName && <span className="block max-w-48 truncate text-xs text-muted-foreground">{row.courseName}</span>}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell"><Badge variant={row.entryKind === 'homework' ? 'default' : 'secondary'}>{row.entryKind === 'homework' ? 'Homework' : 'Event'}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap text-xs sm:text-sm">{formatPreviewDate(row)}</TableCell>
                        <TableCell><Button type="button" variant="ghost" size="sm" className="gap-1" aria-expanded={editingIndex === index} onClick={() => setEditingIndex(editingIndex === index ? null : index)}><Pencil className="h-3.5 w-3.5" />Edit</Button></TableCell>
                      </TableRow>
                      {editingIndex === index && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/20">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                            {row.warning && <p className="mt-3 flex gap-2 text-xs text-[color-mix(in_srgb,var(--course-citrine)_62%,var(--secondary-accent))]"><AlertTriangle className="h-4 w-4 shrink-0" />{row.warning}</p>}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                  {visibleRows.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No calendar items match this review filter.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-between gap-3 sm:justify-start">
                <p className="text-xs text-muted-foreground">Page {page} of {pageCount} · {filteredRows.length} shown</p>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" aria-label="Previous Canvas events page" disabled={page === 1} onClick={() => { setPage((current) => Math.max(1, current - 1)); setEditingIndex(null); }}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button type="button" variant="outline" size="sm" aria-label="Next Canvas events page" disabled={page === pageCount} onClick={() => { setPage((current) => Math.min(pageCount, current + 1)); setEditingIndex(null); }}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
              <Button className="w-full gap-2 sm:w-fit" disabled={loading || selectedRows.length === 0 || missingCourse} onClick={() => void handleImport()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {loading ? 'Importing…' : `Import ${selectedRows.length} selected`}
              </Button>
            </div>
            {missingCourse && <p role="alert" className="text-sm text-destructive">Every selected homework item needs a course code. Use the Needs review filter to find them.</p>}
          </div>
        )}

        {result && (
          <div role="status" className="rounded-lg border border-[color-mix(in_srgb,var(--course-emerald)_64%,var(--surface))] bg-[color-mix(in_srgb,var(--course-emerald)_34%,var(--surface))] p-3 text-sm text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Canvas import complete</p>
            <p>Created {result.createdCourses} course{result.createdCourses === 1 ? '' : 's'}, {result.createdAssignments} homework item{result.createdAssignments === 1 ? '' : 's'}, and {result.createdEvents} event{result.createdEvents === 1 ? '' : 's'}. Skipped {result.skippedDuplicates} duplicate{result.skippedDuplicates === 1 ? '' : 's'}.</p>
            {result.errors.map((message) => <p key={message}>{message}</p>)}
          </div>
        )}

        <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
          <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 sm:px-6 sm:py-4">
              <DialogTitle className="text-base leading-snug sm:text-lg">How to download your Canvas .ics file</DialogTitle>
              <DialogDescription className="text-xs leading-5 sm:text-sm">Use Canvas Calendar Feed to download the file, then return here to review it before importing.</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <ol className="grid gap-3">
                <li className="rounded-md border bg-muted/20 p-3"><strong className="block text-sm text-foreground">1. Log in to Canvas</strong><span className="text-sm text-muted-foreground">Open your school’s Canvas account.</span></li>
                <li className="rounded-md border bg-muted/20 p-3"><strong className="block text-sm text-foreground">2. Open Calendar</strong><span className="text-sm text-muted-foreground">Click Calendar in the global navigation menu on the left.</span></li>
                <li className="rounded-md border bg-muted/20 p-3"><strong className="block text-sm text-foreground">3. Select Calendar Feed</strong><span className="text-sm text-muted-foreground">At the bottom-right of the calendar page, click Calendar Feed.</span></li>
                <li className="rounded-md border bg-muted/20 p-3"><strong className="block text-sm text-foreground">4. Download the feed</strong><span className="text-sm text-muted-foreground">In the pop-out window, click “click here to view this feed”.</span></li>
                <li className="rounded-md border bg-muted/20 p-3"><strong className="block text-sm text-foreground">5. Find the downloaded file</strong><span className="text-sm text-muted-foreground">Your browser will download the .ics file to its default Downloads folder.</span></li>
              </ol>
              <div className="mt-4 rounded-md border bg-background p-3 text-sm text-muted-foreground">
                Return to UMS, choose that .ics file, review the events, and import only the items you want. The raw file stays in your browser.
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
