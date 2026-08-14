const STORAGE_KEY = 'ums_launch_attribution';
const LEGACY_STORAGE_KEY = 'ums_ucd_launch_attribution';
const VALUE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const queryKeys = ['source', 'campaign', 'ambassador', 'society', 'referral'] as const;

export type LaunchSource = 'ucd_landing' | 'palomar_landing';

export type LaunchInstitution = {
  key: 'ucd' | 'palomar';
  name: 'UCD' | 'Palomar';
  source: LaunchSource;
  emailDomain: 'ucdconnect.ie' | 'student.palomar.edu';
  incomingList: 'ucd_incoming' | 'palomar_incoming';
};

const institutions: LaunchInstitution[] = [
  { key: 'ucd', name: 'UCD', source: 'ucd_landing', emailDomain: 'ucdconnect.ie', incomingList: 'ucd_incoming' },
  { key: 'palomar', name: 'Palomar', source: 'palomar_landing', emailDomain: 'student.palomar.edu', incomingList: 'palomar_incoming' },
];

export type LaunchAttribution = Partial<Record<(typeof queryKeys)[number], string>> & {
  launchSession?: string;
};

function valid(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized && VALUE_PATTERN.test(normalized) ? normalized : undefined;
}

export function institutionForLaunchSource(source: string | null | undefined): LaunchInstitution | null {
  return institutions.find((institution) => institution.source === source) ?? null;
}

export function captureLaunchAttribution(params: URLSearchParams): LaunchAttribution | null {
  const next: LaunchAttribution = {};
  for (const key of queryKeys) {
    const value = valid(params.get(key));
    if (value) next[key] = value;
  }
  const launchSession = valid(params.get('launch_session'));
  if (launchSession) next.launchSession = launchSession;
  const source = institutionForLaunchSource(params.get('source'))?.source;
  if (!next.source && source) next.source = source;
  if (!institutionForLaunchSource(next.source)) return getLaunchAttribution();
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  return next;
}

export function getLaunchAttribution(): LaunchAttribution | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = JSON.parse(stored ?? 'null') as LaunchAttribution | null;
    if (!parsed || !institutionForLaunchSource(parsed.source)) return null;
    const cleaned = Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string' && VALUE_PATTERN.test(value))
    ) as LaunchAttribution;
    if (!sessionStorage.getItem(STORAGE_KEY)) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    return cleaned;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    return null;
  }
}

export function getLaunchInstitution(): LaunchInstitution | null {
  return institutionForLaunchSource(getLaunchAttribution()?.source);
}

export function isLaunchJourney(): boolean {
  return Boolean(getLaunchInstitution());
}

export function isExactInstitutionEmail(email: string, institution: LaunchInstitution): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return at > 0 && normalized.slice(at + 1) === institution.emailDomain;
}

export function isKnownInstitutionEmail(email: string): boolean {
  return institutions.some((institution) => isExactInstitutionEmail(email, institution));
}

export function isUcdLaunchJourney(): boolean {
  return getLaunchInstitution()?.key === 'ucd';
}

export function isExactUcdEmail(email: string): boolean {
  return isExactInstitutionEmail(email, institutions[0]);
}
