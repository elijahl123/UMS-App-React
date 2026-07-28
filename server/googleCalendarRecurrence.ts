import * as rruleNamespace from 'rrule';

const rruleRuntime = (
  rruleNamespace as typeof rruleNamespace & { default?: typeof rruleNamespace }
).default ?? rruleNamespace;
const { rrulestr } = rruleRuntime;

export type RecurringEventRow = {
  id: string | number;
  title: string;
  event_date: string;
  end_date?: string | null;
  event_time: string | null;
  end_time: string | null;
  event_timezone: string | null;
  description: string | null;
  source_provider: string | null;
  source_key: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
  google_etag: string | null;
  google_updated_at: string | Date | null;
  google_recurrence: string[] | null;
  google_recurring_event_id: string | null;
  google_original_start: string | null;
  google_cancelled: boolean;
  updated_at: string | Date | null;
};

export type ExpandedEventRow = RecurringEventRow & {
  id: string;
  recurring_series_id?: string;
  recurrence_original_start?: string;
};

function dateOnly(value: string): string {
  return value.split('T')[0];
}

function normalizedTime(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateOnly(dateIso)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eventDurationDays(row: RecurringEventRow): number {
  if (!row.end_date) return 0;
  const start = new Date(`${dateOnly(row.event_date)}T00:00:00.000Z`).getTime();
  const end = new Date(`${dateOnly(row.end_date)}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function compactDate(value: string): string {
  return value.replace(/-/g, '');
}

function compactTime(value: string): string {
  return value.replace(':', '') + '00';
}

function floatingRecurrenceLine(line: string): string {
  if (!/^(EXDATE|RDATE)/.test(line)) return line;
  const separator = line.indexOf(':');
  if (separator < 0) return line;
  const prefix = line
    .slice(0, separator)
    .replace(/;TZID=[^;:]+/, '')
    .replace(/;VALUE=DATE/, '');
  const values = line
    .slice(separator + 1)
    .split(',')
    .map((value) => {
      if (/^\d{8}$/.test(value)) return `${value}T000000Z`;
      return /^\d{8}T\d{6}$/.test(value) ? `${value}Z` : value;
    });
  return `${prefix}:${values.join(',')}`;
}

function floatingDateParts(value: Date) {
  return {
    date: value.toISOString().slice(0, 10),
    time: `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`,
  };
}

export function recurrenceKey(date: string, time: string | null): string {
  return time ? `${date}T${time.slice(0, 5)}` : date;
}

function occurrenceId(seriesId: string, originalStart: string): string {
  return `google-occurrence:${seriesId}:${Buffer.from(originalStart).toString('base64url')}`;
}

function eventDurationMinutes(row: RecurringEventRow): number | null {
  const start = normalizedTime(row.event_time);
  const end = normalizedTime(row.end_time);
  if (!start || !end) return null;
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  let duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (duration <= 0) duration += 24 * 60;
  return duration;
}

function endTimeForOccurrence(row: RecurringEventRow): string | null {
  const start = normalizedTime(row.event_time);
  const duration = eventDurationMinutes(row);
  if (!start || duration === null) return normalizedTime(row.end_time);
  const [hour, minute] = start.split(':').map(Number);
  const total = (hour * 60 + minute + duration) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function recurrenceSet(row: RecurringEventRow) {
  const startDate = dateOnly(row.event_date);
  const startTime = normalizedTime(row.event_time);
  const dtstart = startTime
    ? `DTSTART:${compactDate(startDate)}T${compactTime(startTime)}Z`
    : `DTSTART:${compactDate(startDate)}T000000Z`;
  const recurrence = (row.google_recurrence ?? []).map(floatingRecurrenceLine);
  return rrulestr([dtstart, ...recurrence].join('\n'), {
    compatible: true,
    forceset: true,
  });
}

function generatedOccurrence(row: RecurringEventRow, occurrence: Date): ExpandedEventRow {
  const seriesId = String(row.id);
  const isAllDay = !normalizedTime(row.event_time);
  const parts = isAllDay
    ? { date: occurrence.toISOString().slice(0, 10), time: null }
    : floatingDateParts(occurrence);
  const originalStart = recurrenceKey(parts.date, parts.time);
  return {
    ...row,
    id: occurrenceId(seriesId, originalStart),
    event_date: parts.date,
    end_date: eventDurationDays(row) > 0 ? addDays(parts.date, eventDurationDays(row)) : null,
    event_time: parts.time,
    end_time: endTimeForOccurrence(row),
    recurring_series_id: seriesId,
    recurrence_original_start: originalStart,
  };
}

function exceptionOccurrence(master: RecurringEventRow, exception: RecurringEventRow): ExpandedEventRow {
  const seriesId = String(master.id);
  const originalStart =
    exception.google_original_start
    ?? recurrenceKey(dateOnly(exception.event_date), normalizedTime(exception.event_time));
  return {
    ...exception,
    id: occurrenceId(seriesId, originalStart),
    recurring_series_id: seriesId,
    recurrence_original_start: originalStart,
  };
}

export function expandRecurringEventRows(
  rows: RecurringEventRow[],
  fromDate: string,
  toDateExclusive: string
): ExpandedEventRow[] {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDateExclusive}T00:00:00.000Z`);
  const masters = rows.filter((row) => (row.google_recurrence?.length ?? 0) > 0 && !row.google_recurring_event_id);
  const exceptionsByParent = new Map<string, RecurringEventRow[]>();

  for (const row of rows) {
    if (!row.google_recurring_event_id) continue;
    const key = `${row.google_calendar_id ?? ''}:${row.google_recurring_event_id}`;
    const existing = exceptionsByParent.get(key) ?? [];
    existing.push(row);
    exceptionsByParent.set(key, existing);
  }

  const expanded: ExpandedEventRow[] = [];
  for (const master of masters) {
    const parentKey = `${master.google_calendar_id ?? ''}:${master.google_event_id ?? ''}`;
    const exceptions = exceptionsByParent.get(parentKey) ?? [];
    const exceptionsByStart = new Map(
      exceptions
        .filter((row) => row.google_original_start)
        .map((row) => [row.google_original_start as string, row])
    );
    const usedExceptions = new Set<string>();

    const recurrenceFrom = new Date(from);
    recurrenceFrom.setUTCDate(recurrenceFrom.getUTCDate() - eventDurationDays(master));
    for (const occurrence of recurrenceSet(master).between(recurrenceFrom, to, true)) {
      const generated = generatedOccurrence(master, occurrence);
      const originalStart = generated.recurrence_original_start as string;
      const exception = exceptionsByStart.get(originalStart);
      if (exception) {
        usedExceptions.add(String(exception.id));
        if (!exception.google_cancelled) {
          const replacement = exceptionOccurrence(master, exception);
          if (
            replacement.event_date < toDateExclusive
            && (replacement.end_date ?? replacement.event_date) >= fromDate
          ) {
            expanded.push(replacement);
          }
        }
      } else if ((generated.end_date ?? generated.event_date) >= fromDate) {
        expanded.push(generated);
      }
    }

    for (const exception of exceptions) {
      if (usedExceptions.has(String(exception.id)) || exception.google_cancelled) continue;
      const replacement = exceptionOccurrence(master, exception);
      if (
        replacement.event_date < toDateExclusive
        && (replacement.end_date ?? replacement.event_date) >= fromDate
      ) {
        expanded.push(replacement);
      }
    }
  }

  const recurringIds = new Set([
    ...masters.map((row) => String(row.id)),
    ...rows.filter((row) => row.google_recurring_event_id).map((row) => String(row.id)),
  ]);
  const singles = rows
    .filter((row) => !recurringIds.has(String(row.id)) && !row.google_cancelled)
    .filter((row) =>
      dateOnly(row.event_date) < toDateExclusive
      && dateOnly(row.end_date ?? row.event_date) >= fromDate
    )
    .map((row) => ({ ...row, id: String(row.id) }));

  return [...singles, ...expanded].sort((a, b) =>
    `${dateOnly(a.event_date)} ${normalizedTime(a.event_time) ?? ''} ${a.title}`.localeCompare(
      `${dateOnly(b.event_date)} ${normalizedTime(b.event_time) ?? ''} ${b.title}`
    )
  );
}
