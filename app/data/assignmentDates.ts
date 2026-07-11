import type { Assignment } from '@/app/data/types';

export const DEFAULT_DUE_TIME_ZONE = 'UTC';

export function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_DUE_TIME_ZONE;
}

export function normalizeDateString(value: string): string {
  return value.split('T')[0];
}

export function normalizeTimeString(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 5);
}

function parseIsoDateParts(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function formatIsoDate(isoDate: string, options: Intl.DateTimeFormatOptions = {}): string {
  return parseIsoDateParts(isoDate).toLocaleDateString('en-US', options);
}

export function formatDueTime(time?: string): string | undefined {
  if (!time) return undefined;

  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTimeZoneLabel(timeZone: string, isoDate?: string): string {
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  })
    .formatToParts(isoDate ? parseIsoDateParts(isoDate) : new Date())
    .find((part) => part.type === 'timeZoneName')?.value;

  return timeZoneName ?? timeZone;
}

export function formatAssignmentDue(assignment: Pick<Assignment, 'dueDate' | 'dueTime' | 'dueTimeZone'>, options: Intl.DateTimeFormatOptions = {}): string {
  const dateLabel = formatIsoDate(assignment.dueDate, options);
  const timeLabel = formatDueTime(assignment.dueTime);
  if (!timeLabel) return dateLabel;

  return `${dateLabel} at ${timeLabel} ${formatTimeZoneLabel(assignment.dueTimeZone, assignment.dueDate)}`;
}
