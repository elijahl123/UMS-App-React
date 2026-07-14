export type BrightspaceEntryKind = 'homework' | 'event';

export type BrightspaceCalendarPreviewRow = {
  title: string;
  courseCode: string;
  courseName: string;
  entryKind: BrightspaceEntryKind;
  date: string;
  time?: string;
  sourceLabel: string;
  rawText: string;
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

function parseEntryLine(line: string): Omit<EntryToken, 'type' | 'lineIndex'> | null {
  const match = compactLine(line).match(
    /^(.+?)\s+-\s+(Due|Available)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i
  );
  if (!match) return null;

  const date = toIsoDate(match[3], match[4], match[5]);
  if (!date) return null;

  return {
    title: match[1].trim(),
    entryKind: match[2].toLowerCase() === 'due' ? 'homework' : 'event',
    date,
    time: match[6] && match[7] && match[8] ? toTwentyFourHour(match[6], match[7], match[8]) : undefined,
    sourceLabel: match[2][0].toUpperCase() + match[2].slice(1).toLowerCase(),
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
    } else if (/\s+-\s+(Due|Available)\b/i.test(line)) {
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

  if (next && (!previous || next.lineIndex - entry.lineIndex <= 2 && entry.lineIndex - previous.lineIndex > 2)) {
    return next;
  }

  return previous ?? next ?? null;
}

export function parseBrightspaceCalendarText(text: string): BrightspaceCalendarPreviewRow[] {
  const tokens = tokenizeBrightspaceText(text);

  return tokens.flatMap((token, index) => {
    if (token.type !== 'entry') return [];

    const course = nearestCourseForEntry(tokens, index);
    if (!course) return [];

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
      },
    ];
  });
}

export function parseBrightspaceCalendarPages(pages: string[]): BrightspaceCalendarPreviewRow[] {
  return parseBrightspaceCalendarText(pages.join('\n'));
}
