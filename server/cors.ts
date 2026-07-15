import type { CorsOptions } from 'cors';

export function parseAllowedOrigins(appOrigin: string, rawAppOrigins?: string): string[] {
  const origins = (rawAppOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length ? origins : [appOrigin];
}

export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.toLowerCase();
  return allowedOrigins.some((allowedOrigin) => allowedOrigin.toLowerCase() === normalizedOrigin);
}

export function createCorsOptions(allowedOrigins: string[]): CorsOptions {
  return {
    origin(origin, callback) {
      if (isCorsOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
  };
}
