// Remembers the last known subscription state so the route guard does not lock
// the whole app out when the billing check cannot reach the server.

import type { BillingStatus } from '@/app/lib/billing/client';
import { META_STORE, readRecord, writeRecord } from '@/app/lib/offline/db';
import { isOfflineModeActive } from '@/app/lib/offline/runtime';

function billingKey(userId: string): string {
  return `${userId}|billingStatus`;
}

export async function cacheBillingStatus(userId: string, status: BillingStatus): Promise<void> {
  if (!isOfflineModeActive()) return;
  await writeRecord(META_STORE, billingKey(userId), status);
}

export async function readCachedBillingStatus(userId: string): Promise<BillingStatus | null> {
  if (!isOfflineModeActive()) return null;
  return readRecord<BillingStatus>(META_STORE, billingKey(userId));
}
