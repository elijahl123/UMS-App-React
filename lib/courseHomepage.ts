export const COURSE_HOMEPAGE_ERROR = 'Enter a valid homepage URL using http:// or https://';

export function normalizeCourseHomepageUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(COURSE_HOMEPAGE_ERROR);

  const trimmed = value.trim();
  if (!trimmed) return null;
  const explicitScheme = trimmed.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  if (explicitScheme && !['http', 'https'].includes(explicitScheme)) {
    throw new Error(COURSE_HOMEPAGE_ERROR);
  }
  const candidate = explicitScheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(COURSE_HOMEPAGE_ERROR);
  }

  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error(COURSE_HOMEPAGE_ERROR);
  }
  return url.toString();
}
