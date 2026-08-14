import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';

export const ONBOARDING_STEPS = [
  'welcome', 'course', 'coursework', 'schedule', 'services', 'dashboard', 'calendar',
  'homework', 'class_schedule', 'notes', 'courses', 'navigation', 'account', 'complete',
] as const;

export type OnboardingStep = typeof ONBOARDING_STEPS[number];
export type OnboardingStatus = 'active' | 'skipped' | 'completed';

export type OnboardingState = {
  version: number;
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  deferredSteps: OnboardingStep[];
  inferredCompletedSteps: OnboardingStep[];
  checklistDismissedAt: string | null;
  startedAt: string;
  skippedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

async function request(path: string, init?: RequestInit): Promise<OnboardingState | null> {
  const response = await apiFetch(`/onboarding${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders(), ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw payload ?? { error: { message: 'ONBOARDING_REQUEST_FAILED' } };
  return payload as OnboardingState | null;
}

export function getOnboarding() {
  return request('');
}

export function initializeOnboarding() {
  return request('/initialize', { method: 'POST', body: '{}' }) as Promise<OnboardingState>;
}

export function updateOnboarding(input:
  | { action: 'complete_step' | 'defer_step'; step: OnboardingStep; nextStep: OnboardingStep }
  | { action: 'skip' | 'complete' | 'dismiss_checklist' | 'resume' }
) {
  return request('', { method: 'PUT', body: JSON.stringify(input) }) as Promise<OnboardingState>;
}

export function restartOnboarding() {
  return request('/restart', { method: 'POST', body: '{}' }) as Promise<OnboardingState>;
}

export const ONBOARDING_INITIALIZE_PENDING_KEY = 'ums_onboarding_initialize_pending';
