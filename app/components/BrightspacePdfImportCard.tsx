import { useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { importBrightspaceCalendarRows, type BrightspaceImportResponse } from '@/app/lib/brightspaceCalendar/client';
import { parseBrightspacePdfFile } from '@/app/lib/brightspaceCalendar/pdf';
import type { BrightspaceCalendarPreviewRow } from '@/app/lib/brightspaceCalendar/parser';
import { useAuth } from '@/app/lib/auth/AuthContext';

const mutationEvent = 'ums-api-action-mutated';

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

export default function BrightspacePdfImportCard() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<BrightspaceCalendarPreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [parseLoading, setParseLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrightspaceImportResponse | null>(null);

  const selectedRows = rows.filter((_, index) => selected.has(index));

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
          <CardTitle>Import Brightspace PDF</CardTitle>
        </div>
        <CardDescription>Choose a text-based UCD Brightspace calendar PDF and review the entries before saving them.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Brightspace calendar PDF"
            disabled={parseLoading || importLoading}
            onChange={handleFileChange}
          />
          <Button type="button" variant="outline" className="gap-2 sm:w-auto" disabled={parseLoading || importLoading} onClick={() => fileInputRef.current?.click()}>
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
      </CardContent>
    </Card>
  );
}
