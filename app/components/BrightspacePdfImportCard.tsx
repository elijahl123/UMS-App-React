import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileQuestion, FileUp, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { importBrightspaceCalendarRows, type BrightspaceImportResponse } from '@/app/lib/brightspaceCalendar/client';
import { parseBrightspacePdfFile } from '@/app/lib/brightspaceCalendar/pdf';
import type { BrightspaceCalendarPreviewRow } from '@/app/lib/brightspaceCalendar/parser';
import { useAuth } from '@/app/lib/auth/AuthContext';

const mutationEvent = 'ums-api-action-mutated';

type BrightspacePdfImportCardProps = {
  title?: string;
  description?: string;
};

const brightspaceGuideSteps = [
  {
    title: '1. Open Brightspace home',
    body: 'From the Brightspace home page, use the Calendar panel on the right to open your calendar.',
    imageSrc: '/brightspace-guide/brightspace-home.png',
    imageAlt: 'Brightspace home page with the Calendar panel visible on the right side.',
  },
  {
    title: '2. Switch to Agenda and choose Print',
    body: 'In Calendar, switch to Agenda and use the Print action in the top-right toolbar to generate the agenda-style view this importer expects.',
    imageSrc: '/brightspace-guide/brightspace-calendar.png',
    imageAlt: 'Brightspace calendar page in Agenda view with the Print button in the top-right toolbar.',
  },
  {
    title: '3. Keep event details on and save as PDF',
    body: 'Leave Show event details checked, update the preview if needed, then print or save the page as a PDF from your browser.',
    imageSrc: '/brightspace-guide/brightspace-print.png',
    imageAlt: 'Brightspace print options with Show event details enabled and the Print button at the bottom.',
  },
] as const;

function requestError(err: unknown, fallback: string): string {
  const response = err as { error?: { message?: string } };
  return response?.error?.message ?? (err instanceof Error ? err.message : fallback);
}

function formatPreviewDate(row: BrightspaceCalendarPreviewRow): string {
  const date = new Date(`${row.date}T00:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? row.date
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return row.time ? `${dateLabel} ${row.time}` : dateLabel;
}

function publishImportMutations() {
  ['createCourse', 'createAssignment', 'createEvent'].forEach((name) => {
    window.dispatchEvent(new CustomEvent(mutationEvent, { detail: { name } }));
  });
}

export default function BrightspacePdfImportCard({
  title = 'Import Brightspace PDF',
  description = 'Choose a text-based UCD Brightspace calendar PDF and review the entries before saving them.',
}: BrightspacePdfImportCardProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<BrightspaceCalendarPreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [parseLoading, setParseLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrightspaceImportResponse | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);

  const selectedRows = rows.filter((_, index) => selected.has(index));
  const currentGuideStep = brightspaceGuideSteps[guideStepIndex];

  useEffect(() => {
    if (guideOpen) {
      setGuideStepIndex(0);
    }
  }, [guideOpen]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setParseLoading(true);
    setError(null);
    setResult(null);
    try {
      const parsedRows = await parseBrightspacePdfFile(file);
      setRows(parsedRows);
      setSelected(new Set(parsedRows.map((_, index) => index)));
    } catch (err) {
      setRows([]);
      setSelected(new Set());
      setError(requestError(err, 'Unable to parse that Brightspace PDF.'));
    } finally {
      setParseLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const toggleRow = (index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedRows.length === 0) {
      setError('Select at least one Brightspace row to import.');
      return;
    }

    setImportLoading(true);
    setError(null);
    setResult(null);
    try {
      const importResult = await importBrightspaceCalendarRows(selectedRows, user?.id);
      setResult(importResult);
      publishImportMutations();
    } catch (err) {
      setError(requestError(err, 'Unable to import Brightspace rows.'));
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileUp className="h-5 w-5 text-primary" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <p className="text-sm font-semibold text-foreground">Need help downloading the PDF?</p>
            <p className="text-sm text-muted-foreground">Open a short screenshot walkthrough that shows exactly where to click in Brightspace.</p>
          </div>
          <Button type="button" variant="outline" className="gap-2 sm:w-auto" onClick={() => setGuideOpen(true)}>
            <FileQuestion className="h-4 w-4" />
            View walkthrough
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Brightspace calendar PDF"
            disabled={parseLoading || importLoading}
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            className="gap-2 sm:w-auto"
            disabled={parseLoading || importLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            {parseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {parseLoading ? 'Reading...' : 'Choose PDF'}
          </Button>
        </div>

        {error && (
          <p className="flex items-start gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {result && (
          <div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              Brightspace import complete
            </p>
            <p>
              {result.createdCourses} courses, {result.createdAssignments} assignments, and {result.createdEvents} events created.
              {result.skippedDuplicates > 0 ? ` ${result.skippedDuplicates} duplicates skipped.` : ''}
            </p>
            {result.errors.length > 0 && <p>{result.errors.length} rows could not be imported.</p>}
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{rows.length} found</Badge>
                <Badge variant="outline">{selectedRows.length} selected</Badge>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelected(new Set(rows.map((_, index) => index)))}>
                  Select all
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <span className="sr-only">Selected</span>
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.courseCode}-${row.title}-${row.date}-${index}`} data-state={selected.has(index) ? 'selected' : undefined}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          aria-label={`Select ${row.title}`}
                          checked={selected.has(index)}
                          onChange={() => toggleRow(index)}
                        />
                      </TableCell>
                      <TableCell className="min-w-48 font-medium">{row.title}</TableCell>
                      <TableCell className="min-w-40">
                        <span className="font-semibold">{row.courseCode}</span>
                        <span className="block text-xs text-muted-foreground">{row.courseName}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.entryKind === 'homework' ? 'default' : 'secondary'}>
                          {row.entryKind === 'homework' ? 'Homework' : 'Event'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatPreviewDate(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button type="button" className="w-full gap-2 sm:w-fit" disabled={importLoading || selectedRows.length === 0} onClick={handleImport}>
              {importLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {importLoading ? 'Importing...' : `Import ${selectedRows.length} selected`}
            </Button>
          </div>
        )}

        <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
            <DialogHeader className="border-b px-5 py-4 sm:px-6">
              <DialogTitle>How to download the Brightspace calendar PDF</DialogTitle>
              <DialogDescription>
                Follow these steps in Brightspace, then save the print output as a PDF and upload it here.
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[calc(90vh-5rem)] gap-4 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{currentGuideStep.title}</span>
                <span>
                  Step {guideStepIndex + 1} of {brightspaceGuideSteps.length}
                </span>
              </div>
              <div className="grid gap-4">
                <img
                  src={currentGuideStep.imageSrc}
                  alt={currentGuideStep.imageAlt}
                  className="max-h-[58vh] w-full rounded-md border object-contain object-top bg-muted/20"
                  loading="lazy"
                />
                <div className="grid gap-2 rounded-md border bg-background p-4">
                  <p className="text-base font-semibold text-foreground">{currentGuideStep.title}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{currentGuideStep.body}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Keep event details visible in the print preview. Image-only scans still will not import.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={guideStepIndex === 0}
                    onClick={() => setGuideStepIndex((index) => Math.max(index - 1, 0))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={guideStepIndex === brightspaceGuideSteps.length - 1}
                    onClick={() => setGuideStepIndex((index) => Math.min(index + 1, brightspaceGuideSteps.length - 1))}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
