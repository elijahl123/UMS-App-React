export type BrightspaceEntryKind = 'homework' | 'event';

export type BrightspaceCalendarPreviewRow = {
  title: string;
  courseCode: string;
  courseName: string;
  entryKind: BrightspaceEntryKind;
  date: string;
  time?: string;
  endDate?: string;
  endTime?: string;
  sourceLabel: string;
  rawText: string;
  defaultSelected?: boolean;
  ambiguousDuplicate?: boolean;
};

type CourseToken = {
  type: 'course';
  lineIndex: number;
  code: string;
  name: string;
  raw: string;
};

type EntryToken = {
  type: 'entry';
  lineIndex: number;
  title: string;
  entryKind: BrightspaceEntryKind;
  date: string;
  time?: string;
  sourceLabel: string;
  raw: string;
};

type Token = CourseToken | EntryToken;

const monthNumbers: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

function compactLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function isIgnorableLine(line: string): boolean {
  return (
    !line ||
    /^page\s+\d+(\s+of\s+\d+)?$/i.test(line) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}\s*(AM|PM)\s+Print\b/i.test(line) ||
    /^https?:\/\//i.test(line) ||
    /^printed\b/i.test(line) ||
    /^calendar$/i.test(line) ||
    /^agenda$/i.test(line) ||
    /^brightspace$/i.test(line) ||
    /^ucd\b/i.test(line) ||
    /^[A-Z][a-z]+,\s+\d{1,2}\s+[A-Z][a-z]+\s+\d{4}$/.test(line)
  );
}

export function parseBrightspaceCourseLine(line: string): Pick<CourseToken, 'code' | 'name' | 'raw'> | null {
  const match = compactLine(line).match(/^([A-Z]{2,}\d[A-Z0-9]*)-(.+)-(\d{4}\/\d{2}\s+.+)$/);
  if (!match) return null;

  return {
    code: match[1].trim().toUpperCase(),
    name: match[2].trim(),
    raw: compactLine(line),
  };
}

function toIsoDate(day: string, month: string, year: string): string | null {
  const monthNumber = monthNumbers[month.toLowerCase()];
  if (!monthNumber) return null;

  return `${year}-${monthNumber}-${day.padStart(2, '0')}`;
}

function toTwentyFourHour(hour: string, minute: string, meridiem: string): string {
  const hourNumber = Number(hour);
  const normalized = meridiem.toUpperCase();
  const adjusted = normalized === 'PM' && hourNumber !== 12 ? hourNumber + 12 : normalized === 'AM' && hourNumber === 12 ? 0 : hourNumber;
  return `${String(adjusted).padStart(2, '0')}:${minute}`;
}

function inferEntryKind(title: string, sourceLabel: string): BrightspaceEntryKind {
  if (sourceLabel.toLowerCase() === 'due') return 'homework';
  if (/^(homework|practical)\b/i.test(title.trim())) return 'homework';
  return 'event';
}

function parseEntryLine(line: string): Omit<EntryToken, 'type' | 'lineIndex'> | null {
  const match = compactLine(line).match(
    /^(.+?)\s+(?:-|–|—|â€“|â€”)\s+(Due|Available|Availability Ends)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i
  );
  if (!match) return null;

  const date = toIsoDate(match[3], match[4], match[5]);
  if (!date) return null;

  const sourceLabel = match[2].replace(/\b\w/g, (letter) => letter.toUpperCase());
  const title = match[1].trim();

  return {
    title,
    entryKind: inferEntryKind(title, sourceLabel),
    date,
    time: match[6] && match[7] && match[8] ? toTwentyFourHour(match[6], match[7], match[8]) : undefined,
    sourceLabel,
    raw: compactLine(line),
  };
}

function tokenizeBrightspaceText(text: string): Token[] {
  const lines = text
    .split(/\r?\n/)
    .map(compactLine)
    .filter((line) => !isIgnorableLine(line));
  const tokens: Token[] = [];
  let entryBuffer = '';
  let entryStartIndex = 0;

  const flushEntry = () => {
    if (!entryBuffer) return false;
    const entry = parseEntryLine(entryBuffer);
    if (!entry) return false;

    tokens.push({ type: 'entry', lineIndex: entryStartIndex, ...entry });
    entryBuffer = '';
    return true;
  };

  lines.forEach((line, lineIndex) => {
    const course = parseBrightspaceCourseLine(line);
    if (course) {
      flushEntry();
      tokens.push({ type: 'course', lineIndex, ...course });
      return;
    }

    const directEntry = parseEntryLine(line);
    if (directEntry) {
      flushEntry();
      tokens.push({ type: 'entry', lineIndex, ...directEntry });
      return;
    }

    if (entryBuffer) {
      entryBuffer = `${entryBuffer} ${line}`;
      flushEntry();
    } else if (/\s+(?:-|–|—|â€“|â€”)\s+(Due|Available|Availability Ends)\b/i.test(line)) {
      entryBuffer = line;
      entryStartIndex = lineIndex;
      flushEntry();
    }
  });

  flushEntry();
  return tokens;
}

function nearestCourseForEntry(tokens: Token[], entryIndex: number): CourseToken | null {
  const entry = tokens[entryIndex] as EntryToken;
  const previous = tokens
    .slice(0, entryIndex)
    .reverse()
    .find((token): token is CourseToken => token.type === 'course');
  const next = tokens.slice(entryIndex + 1).find((token): token is CourseToken => token.type === 'course');
  const nextDistance = next ? next.lineIndex - entry.lineIndex : Number.POSITIVE_INFINITY;

  if (next && (!previous || nextDistance <= 1 || (nextDistance <= 2 && entry.lineIndex - previous.lineIndex > 2))) {
    return next;
  }

  return previous ?? next ?? null;
}

export function parseBrightspaceCalendarText(text: string): BrightspaceCalendarPreviewRow[] {
  const tokens = tokenizeBrightspaceText(text);
  const seenRows = new Set<string>();

  const rows = tokens.flatMap((token, index) => {
    if (token.type !== 'entry') return [];

    const course = nearestCourseForEntry(tokens, index);
    if (!course) return [];

    const rowKey = [course.code, token.title, token.entryKind, token.sourceLabel, token.date, token.time ?? '']
      .map((part) => part.toLowerCase().replace(/\s+/g, ' ').trim())
      .join('|');
    if (seenRows.has(rowKey)) return [];
    seenRows.add(rowKey);

    return [
      {
        title: token.title,
        courseCode: course.code,
        courseName: course.name,
        entryKind: token.entryKind,
        date: token.date,
        time: token.time,
        sourceLabel: token.sourceLabel,
        rawText: `${course.raw}\n${token.raw}`,
        defaultSelected: token.sourceLabel !== 'Available' && !/\b(solution|solutions|resource|resources|sample answer|answers)\b/i.test(token.title),
        ambiguousDuplicate: false,
      },
    ];
  });

  const normalizedKey = (row: BrightspaceCalendarPreviewRow) =>
    `${row.courseCode}|${row.title}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const availableByKey = new Map<string, BrightspaceCalendarPreviewRow[]>();
  const endsByKey = new Map<string, BrightspaceCalendarPreviewRow[]>();
  rows.forEach((row) => {
    const map = row.sourceLabel === 'Available' ? availableByKey : row.sourceLabel === 'Availability Ends' ? endsByKey : null;
    if (!map) return;
    const key = normalizedKey(row);
    map.set(key, [...(map.get(key) ?? []), row]);
  });

  const consumed = new Set<BrightspaceCalendarPreviewRow>();
  const paired: BrightspaceCalendarPreviewRow[] = [];
  for (const [key, starts] of availableByKey) {
    const ends = endsByKey.get(key) ?? [];
    const sortedStarts = [...starts].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
    const sortedEnds = [...ends].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
    for (const start of sortedStarts) {
      const end = sortedEnds.find((candidate) => !consumed.has(candidate)
        && `${candidate.date} ${candidate.time ?? '23:59'}` >= `${start.date} ${start.time ?? '00:00'}`);
      if (!end) continue;
      consumed.add(start);
      consumed.add(end);
      paired.push({
        ...start,
        endDate: end.date,
        endTime: start.time ? end.time : undefined,
        sourceLabel: 'Available → Availability Ends',
        rawText: `${start.rawText}\n${end.rawText}`,
        defaultSelected: !/\b(solution|solutions|resource|resources|sample answer|answers)\b/i.test(start.title),
        ambiguousDuplicate: starts.length > 1 || ends.length > 1,
      });
    }
  }

  const combined = [...rows.filter((row) => !consumed.has(row)), ...paired];
  const titleGroups = new Map<string, BrightspaceCalendarPreviewRow[]>();
  combined.forEach((row) => {
    const key = normalizedKey(row);
    titleGroups.set(key, [...(titleGroups.get(key) ?? []), row]);
  });
  return combined.map((row) => ({
    ...row,
    ambiguousDuplicate: row.ambiguousDuplicate || (titleGroups.get(normalizedKey(row))?.length ?? 0) > 1,
  })).sort((a, b) => `${a.date} ${a.time ?? ''} ${a.courseCode} ${a.title}`.localeCompare(`${b.date} ${b.time ?? ''} ${b.courseCode} ${b.title}`));
}

export function parseBrightspaceCalendarPages(pages: string[]): BrightspaceCalendarPreviewRow[] {
  return parseBrightspaceCalendarText(pages.join('\n'));
}
