import type { CorsOptions } from 'cors';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

function expandLoopbackOrigin(origin: string): string[] {
  try {
    const url = new URL(origin);

    if (!['http:', 'https:'].includes(url.protocol) || !loopbackHosts.has(url.hostname)) {
      return [origin];
    }

    return Array.from(loopbackHosts, (host) => {
      url.hostname = host;
      return url.origin;
    });
  } catch {
    return [origin];
  }
}

export function parseAllowedOrigins(appOrigin: string, rawAppOrigins?: string): string[] {
  const origins = (rawAppOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const configuredOrigins = origins.length ? origins : [appOrigin];
  return Array.from(new Set(configuredOrigins.flatMap(expandLoopbackOrigin)));
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
