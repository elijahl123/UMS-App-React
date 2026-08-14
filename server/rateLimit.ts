import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type RateBucket = { count: number; resetAt: number };

const rateBuckets = new Map<string, RateBucket>();

export function hashRateLimitValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function consumeRateLimit(key: string, windowMs: number, maximum: number): number | null {
  const now = Date.now();
  if (rateBuckets.size > 5_000) {
    for (const [candidateKey, candidate] of rateBuckets) {
      if (candidate.resetAt <= now) rateBuckets.delete(candidateKey);
    }
  }

  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (bucket.count >= maximum) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }

  bucket.count += 1;
  return null;
}

export function limited(windowMs: number, maximum: number, namespace = 'request') {
  return (req: Request, res: Response, next: NextFunction) => {
    const retryAfter = consumeRateLimit(`${namespace}:${req.ip}:${req.path}`, windowMs, maximum);
    if (retryAfter !== null) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: { message: 'TOO_MANY_REQUESTS' } });
      return;
    }
    next();
  };
}

export function resetRateLimitsForTests() {
  rateBuckets.clear();
}
