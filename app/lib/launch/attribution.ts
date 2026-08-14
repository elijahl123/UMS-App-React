const STORAGE_KEY = 'ums_ucd_launch_attribution';
const VALUE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const queryKeys = ['source', 'campaign', 'ambassador', 'society', 'referral'] as const;

export type LaunchAttribution = Partial<Record<(typeof queryKeys)[number], string>> & {
  launchSession?: string;
};

function valid(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized && VALUE_PATTERN.test(normalized) ? normalized : undefined;
}

export function captureLaunchAttribution(params: URLSearchParams): LaunchAttribution | null {
  const next: LaunchAttribution = {};
  for (const key of queryKeys) {
    const value = valid(params.get(key));
    if (value) next[key] = value;
  }
  const launchSession = valid(params.get('launch_session'));
  if (launchSession) next.launchSession = launchSession;
  if (!next.source && params.get('source') === 'ucd_landing') next.source = 'ucd_landing';
  if (next.source !== 'ucd_landing') return getLaunchAttribution();
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getLaunchAttribution(): LaunchAttribution | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as LaunchAttribution | null;
    if (!parsed || parsed.source !== 'ucd_landing') return null;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string' && VALUE_PATTERN.test(value))
    ) as LaunchAttribution;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function isUcdLaunchJourney(): boolean {
  return getLaunchAttribution()?.source === 'ucd_landing';
}

export function isExactUcdEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return at > 0 && normalized.slice(at + 1) === 'ucdconnect.ie';
}
