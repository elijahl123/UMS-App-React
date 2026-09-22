/**
 * Time zone helpers shared by the client and the API server.
 *
 * Wall-clock values in this app (an assignment due time, a class session start
 * time) are stored alongside the IANA zone they were entered in. These helpers
 * turn those pairs into instants and back so a value entered in one zone still
 * reads correctly for someone sitting in another.
 */

export const DEFAULT_TIME_ZONE = 'UTC';

/** Offered when the runtime cannot enumerate the zone database itself. */
const FALLBACK_TIME_ZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Halifax',
  'America/Lima',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Berlin',
  'Europe/Brussels',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Oslo',
  'Europe/Paris',
  'Europe/Prague',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Vienna',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Falls back rather than throwing: a bad zone should never break a page or a reminder. */
export function normalizeTimeZone(value: string | null | undefined, fallback = DEFAULT_TIME_ZONE): string {
  const candidate = (value ?? '').trim();
  if (candidate && isValidTimeZone(candidate)) return candidate;
  return isValidTimeZone(fallback) ? fallback : DEFAULT_TIME_ZONE;
}

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function partsInTimeZone(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

/** The instant at which `time` (HH:MM) reads on the clock in `timeZone` on `isoDate`. */
export function zonedDateTimeToUtc(isoDate: string, time: string, timeZone: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  let utc = targetUtc;

  // Converge on the instant: the first guess can land on the wrong side of a
  // DST boundary, so re-measure the zone offset and correct.
  for (let i = 0; i < 3; i += 1) {
    const parts = partsInTimeZone(new Date(utc), normalizedTimeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    utc -= asUtc - targetUtc;
  }

  return new Date(utc);
}

/** YYYY-MM-DD as it reads in `timeZone` at `date`. */
export function isoDateInTimeZone(date: Date, timeZone: string): string {
  const parts = partsInTimeZone(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** HH:MM as it reads in `timeZone` at `date`. */
export function timeInTimeZone(date: Date, timeZone: string): string {
  const parts = partsInTimeZone(date, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function timeZoneOffsetMinutes(timeZone: string, date = new Date()): number {
  const parts = partsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `GMT${sign}${hours}:${minutes}`;
}

/** The short name the zone is currently using, e.g. `EDT`. */
export function timeZoneAbbreviation(timeZone: string, date = new Date()): string {
  const normalized = normalizeTimeZone(timeZone);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: normalized, timeZoneName: 'short' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  return name ?? normalized;
}

/** `America/New_York` -> `New York`. */
export function timeZoneCityLabel(timeZone: string): string {
  const segments = timeZone.split('/');
  return segments[segments.length - 1].replace(/_/g, ' ');
}

/** `America/New_York` -> `America`; zones without a region land under `Other`. */
export function timeZoneRegionLabel(timeZone: string): string {
  const [region, ...rest] = timeZone.split('/');
  return rest.length > 0 ? region.replace(/_/g, ' ') : 'Other';
}

export function listTimeZones(): string[] {
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supportedValuesOf === 'function') {
    try {
      const zones = supportedValuesOf.call(Intl, 'timeZone');
      if (Array.isArray(zones) && zones.length > 0) return zones;
    } catch {
      // Fall through to the curated list below.
    }
  }
  return FALLBACK_TIME_ZONES;
}

export interface TimeZoneOption {
  value: string;
  city: string;
  region: string;
  offsetMinutes: number;
  offsetLabel: string;
  abbreviation: string;
}

// Describing every zone in the database means two Intl formatters each, which
// is slow enough to show on a phone. Offsets only move at DST boundaries, so
// results are reused for the hour they were measured in.
const describeCache = new Map<string, TimeZoneOption>();
const HOUR_MS = 60 * 60 * 1000;

export function describeTimeZone(timeZone: string, date = new Date()): TimeZoneOption {
  const key = `${timeZone}|${Math.floor(date.getTime() / HOUR_MS)}`;
  const cached = describeCache.get(key);
  if (cached) return cached;

  const offsetMinutes = timeZoneOffsetMinutes(timeZone, date);
  const described: TimeZoneOption = {
    value: timeZone,
    city: timeZoneCityLabel(timeZone),
    region: timeZoneRegionLabel(timeZone),
    offsetMinutes,
    offsetLabel: formatUtcOffset(offsetMinutes),
    abbreviation: timeZoneAbbreviation(timeZone, date),
  };

  // One hour of zones is all that is worth holding on to.
  if (describeCache.size > 2000) describeCache.clear();
  describeCache.set(key, described);
  return described;
}

/** Every selectable zone, grouped by region and ordered west to east within a region. */
export function timeZoneOptionGroups(extraZones: string[] = [], date = new Date()): { region: string; zones: TimeZoneOption[] }[] {
  const zones = new Set(listTimeZones());
  extraZones.filter((zone) => zone && isValidTimeZone(zone)).forEach((zone) => zones.add(zone));

  const groups = new Map<string, TimeZoneOption[]>();
  for (const zone of zones) {
    const option = describeTimeZone(zone, date);
    const bucket = groups.get(option.region);
    if (bucket) bucket.push(option);
    else groups.set(option.region, [option]);
  }

  return [...groups.entries()]
    .map(([region, options]) => ({
      region,
      zones: options.sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.city.localeCompare(b.city)),
    }))
    .sort((a, b) => (a.region === 'Other' ? 1 : b.region === 'Other' ? -1 : a.region.localeCompare(b.region)));
}
