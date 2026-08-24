import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { config } from '../config';
import { updateSubscriptionByRevenueCatEvent, type AppleSubscriptionEvent } from '../appleBilling';

export const appleBillingWebhookRouter = Router();

function timingSafeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function parseRevenueCatEvent(body: Record<string, unknown>): AppleSubscriptionEvent | null {
  const event = body?.event as Record<string, unknown> | undefined;
  if (!event) {
    return null;
  }

  const appUserId = event.app_user_id as string | undefined;
  const eventType = event.type as string | undefined;
  if (!appUserId || !eventType) {
    return null;
  }

  return {
    appUserId,
    email: (event.subscriber_attributes as { $email?: { value?: string } } | undefined)?.$email?.value ?? null,
    productId: (event.product_id as string | undefined) ?? null,
    entitlementId: Array.isArray(event.entitlement_ids) ? ((event.entitlement_ids as string[])[0] ?? null) : null,
    originalTransactionId: (event.original_transaction_id as string | undefined) ?? null,
    expirationAtMs: typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null,
    willRenew: typeof event.auto_resume_at_ms === 'number' ? true : (event.cancel_reason ? false : null),
    environment: (event.environment as 'PRODUCTION' | 'SANDBOX' | undefined) ?? null,
    eventType,
  };
}

appleBillingWebhookRouter.post('/', async (req: Request, res: Response) => {
  if (!config.revenueCatWebhookAuthHeader) {
    return res.status(500).json({ error: { message: 'REVENUECAT_WEBHOOK_AUTH_HEADER is required' } });
  }

  const authHeader = req.header('Authorization') ?? '';
  if (!timingSafeEqual(authHeader, `Bearer ${config.revenueCatWebhookAuthHeader}`)) {
    return res.status(401).json({ error: { message: 'Invalid RevenueCat webhook auth' } });
  }

  const event = parseRevenueCatEvent(req.body);
  if (!event) {
    return res.status(400).json({ error: { message: 'Malformed RevenueCat webhook payload' } });
  }

  try {
    await updateSubscriptionByRevenueCatEvent(event);
    return res.json({ received: true });
  } catch (err) {
    console.error('[AppleBilling] Webhook failed:', err);
    return res.status(500).json({ error: { message: 'SERVER_ERROR' } });
  }
});
