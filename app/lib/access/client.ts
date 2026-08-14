import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';
import { getLaunchAttribution, type LaunchAttribution } from '@/app/lib/launch/attribution';

export type AccessMode = 'full' | 'read_only' | 'billing_required';

export type AccessStatus = {
  status: string;
  subscribed: boolean;
  trialActive: boolean;
  hasAccess: boolean;
  accessMode: AccessMode;
  canRead: boolean;
  canWrite: boolean;
  canExport: boolean;
  billingWarning: string | null;
  entitlement: null | {
    key: string;
    qualifyingEmail: string;
    grantSource: 'primary_email' | 'secondary_email' | 'admin';
    startsAt: string;
    endsAt: string;
    graceEndsAt: string;
    grantedAt: string;
    active: boolean;
    inGrace: boolean;
  };
};

async function accessRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`/access${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders(), ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  return payload as T;
}

export function getAccessStatus() {
  return accessRequest<AccessStatus>('/status');
}

export function reconcileAccess(attribution: LaunchAttribution | null = getLaunchAttribution()) {
  return accessRequest<AccessStatus>('/reconcile', {
    method: 'POST',
    body: JSON.stringify({ attribution }),
  });
}

export type UcdOnboarding = {
  started_at: string;
  ucd_verified_at: string | null;
  first_course_at: string | null;
  dashboard_opened_at: string | null;
  completed_at: string | null;
} | null;

export function getUcdOnboarding() {
  return accessRequest<UcdOnboarding>('/onboarding');
}

export function recordOnboardingMilestone(milestone: 'course_created' | 'dashboard_opened') {
  return accessRequest<{ ok: true; onboarding: UcdOnboarding; completedNow: boolean }>('/onboarding/milestones', {
    method: 'POST',
    body: JSON.stringify({ milestone }),
  });
}
