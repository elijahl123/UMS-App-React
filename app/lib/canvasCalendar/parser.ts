export type CanvasEntryKind = 'homework' | 'event';

export type CanvasCalendarPreviewRow = {
  sourceUid: string;
  title: string;
  courseCode: string;
  courseName: string;
  entryKind: CanvasEntryKind;
  date: string;
  time?: string;
  endDate?: string;
  endTime?: string;
  timezone: string;
  description: string;
  sourceUrl?: string;
  rawText: string;
  defaultSelected: boolean;
  warning?: string;
};

export type CanvasCalendarParseResult = {
  rows: CanvasCalendarPreviewRow[];
  warnings: string[];
};

type IcsProperty = { value: string; params: Record<string, string> };
type IcsEvent = Record<string, IcsProperty[]>;

const MAX_EVENTS = 2_000;
const PALOMAR_TIMEZONE = 'America/Los_Angeles';

function unfoldLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescapeText(value: string): string {
  return value
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseProperty(line: string): { name: string; property: IcsProperty } | null {
  const separator = line.indexOf(':');
  if (separator <= 0) return null;
  const head = line.slice(0, separator).split(';');
  const name = head.shift()?.toUpperCase();
  if (!name) return null;
  const params: Record<string, string> = {};
  head.forEach((part) => {
    const equals = part.indexOf('=');
    if (equals > 0) params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1).replace(/^"|"$/g, '');
  });
  return { name, property: { value: unescapeText(line.slice(separator + 1)), params } };
}

function readEvents(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: IcsEvent | null = null;
  for (const line of unfoldLines(text)) {
    if (line.toUpperCase() === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line.toUpperCase() === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      if (events.length > MAX_EVENTS) throw new Error(`Canvas calendars can contain at most ${MAX_EVENTS.toLocaleString()} events.`);
      continue;
    }
    if (!current) continue;
    const parsed = parseProperty(line);
    if (!parsed) continue;
    current[parsed.name] = [...(current[parsed.name] ?? []), parsed.property];
  }
  return events;
}

function first(event: IcsEvent, name: string): IcsProperty | undefined {
  return event[name]?.[0];
}

function parseDateTime(property: IcsProperty | undefined): { date: string; time?: string; timezone: string } | null {
  if (!property) return null;
  const compact = property.value.trim();
  const match = compact.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (!match[4]) return { date, timezone: property.params.TZID || PALOMAR_TIMEZONE };
  return {
    date,
    time: `${match[4]}:${match[5]}`,
    timezone: match[7] ? 'UTC' : property.params.TZID || PALOMAR_TIMEZONE,
  };
}

function courseSuggestion(event: IcsEvent, title: string): { code: string; name: string } {
  const category = first(event, 'CATEGORIES')?.value.split(',')[0]?.trim() ?? '';
  const candidates = [category, title];
  const code = candidates
    .map((value) => value.match(/\b([A-Z]{2,}\s*-?\s*\d{2,}[A-Z0-9-]*)\b/i)?.[1])
    .find(Boolean)
    ?.replace(/\s+/g, '')
    .toUpperCase() ?? '';
  return { code, name: category || code };
}

function isAssignment(event: IcsEvent): boolean {
  const url = first(event, 'URL')?.value ?? first(event, 'DESCRIPTION')?.value ?? '';
  return /\/assignments\/(?:\d+|syllabus)/i.test(url) || /assignment_/i.test(first(event, 'UID')?.value ?? '');
}

export function parseCanvasIcsText(text: string): CanvasCalendarParseResult {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Choose a valid Canvas .ics calendar file.');
  const events = readEvents(text);
  const warnings: string[] = [];
  const seen = new Set<string>();
  const rows = events.flatMap((event, index): CanvasCalendarPreviewRow[] => {
    const title = first(event, 'SUMMARY')?.value.trim() ?? '';
    const uid = first(event, 'UID')?.value.trim() ?? '';
    const recurrenceId = first(event, 'RECURRENCE-ID')?.value.trim();
    const sourceUid = recurrenceId ? `${uid}|${recurrenceId}` : uid;
    const start = parseDateTime(first(event, 'DTSTART'));
    if (!title || !uid || !start) {
      warnings.push(`Event ${index + 1} was skipped because its title, UID, or start date is missing.`);
      return [];
    }
    const end = parseDateTime(first(event, 'DTEND'));
    const duplicate = seen.has(sourceUid);
    seen.add(sourceUid);
    const recurring = Boolean(first(event, 'RRULE')) && !recurrenceId;
    const assignment = isAssignment(event);
    const course = courseSuggestion(event, title);
    const rowWarnings = [
      duplicate ? 'Duplicate Canvas UID; leave only one copy selected.' : '',
      recurring ? 'Recurring rules are not expanded. Import explicit occurrences only.' : '',
      assignment && !course.code ? 'Choose a course before importing this assignment.' : '',
    ].filter(Boolean);
    return [{
      sourceUid,
      title,
      courseCode: course.code,
      courseName: course.name,
      entryKind: assignment ? 'homework' : 'event',
      date: start.date,
      time: start.time,
      endDate: end?.date,
      endTime: end?.time,
      timezone: start.timezone,
      description: first(event, 'DESCRIPTION')?.value ?? '',
      sourceUrl: first(event, 'URL')?.value,
      rawText: [title, first(event, 'DTSTART')?.value, first(event, 'URL')?.value].filter(Boolean).join('\n'),
      defaultSelected: !duplicate && !recurring && (!assignment || Boolean(course.code)),
      warning: rowWarnings.join(' ' ) || undefined,
    }];
  });
  if (events.length === 0) warnings.push('No Canvas calendar events were found in this file.');
  return { rows, warnings };
}
