export type BillingInterval = 'monthly' | 'yearly';

export interface BillingStatus {
  status: string;
  subscribed: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  stripePriceId?: string | null;
}

export interface BillingConfig {
  publishableKey: string | null;
  prices: {
    monthly: string | null;
    yearly: string | null;
  };
}

async function billingRequest<TResult>(path: string, options?: RequestInit): Promise<TResult> {
  const response = await fetch(`/api/billing${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }

  return payload as TResult;
}

export function getBillingConfig() {
  return billingRequest<BillingConfig>('/config');
}

export function getBillingStatus(userId: string) {
  return billingRequest<BillingStatus>(`/status?userId=${encodeURIComponent(userId)}`);
}

export function refreshBillingStatus(userId: string) {
  return billingRequest<BillingStatus>(`/status/refresh?userId=${encodeURIComponent(userId)}`);
}

export function createSubscription(params: {
  userId: string;
  email: string;
  name?: string;
  interval: BillingInterval;
}) {
  return billingRequest<{
    alreadySubscribed?: boolean;
    clientSecret?: string;
    subscriptionId?: string;
    status?: string;
    publishableKey?: string | null;
  }>('/create-subscription', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function cancelSubscription(userId: string) {
  return billingRequest<BillingStatus>('/cancel-subscription', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function resumeSubscription(userId: string) {
  return billingRequest<BillingStatus>('/resume-subscription', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function updateSubscriptionPlan(params: { userId: string; interval: BillingInterval }) {
  return billingRequest<BillingStatus>('/update-subscription', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
