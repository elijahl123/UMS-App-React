import { vi } from 'vitest';
import { dbRows, mockUser } from '@/app/test/fixtures';
import type { AppUser, StagingAccessUser, StudyPlan } from '@/app/data/types';
import type { AccountEmailAddress } from '@/app/lib/accountEmails/client';
import type { BillingConfig, BillingPaymentMethod, BillingStatus } from '@/app/lib/billing/client';
import type { GoogleCalendarStatus } from '@/app/lib/googleCalendar/client';
import type { OnboardingState } from '@/app/lib/onboarding/client';

type AuthActionResult = {
  success: boolean;
  error?: string;
  trialStartedNow?: boolean;
  verificationEmailSent?: boolean;
};

export const authState = {
  user: mockUser as AppUser | null,
  idToken: 'mock-id-token' as string | null,
  stagingAccess: { uid: mockUser.id, email: mockUser.email, role: 'admin' } as StagingAccessUser | null,
  isStagingAccessControlEnabled: false,
  isLoading: false,
  isStagingAccessLoading: false,
  isGoogleSignInAvailable: true,
  isProcessingGoogleRedirect: false,
  googleSignInError: null as string | null,
};

export const authActions = {
  login: vi.fn(async (): Promise<AuthActionResult> => ({ success: true })),
  signup: vi.fn(async (): Promise<AuthActionResult> => ({ success: true })),
  logout: vi.fn(),
  updateProfile: vi.fn(async () => ({ success: true })),
  changePassword: vi.fn(async () => ({ success: true })),
  resendVerificationEmail: vi.fn(async () => ({ success: true })),
  verifyEmailWithToken: vi.fn(async () => ({ success: true })),
  requestPasswordReset: vi.fn(async () => ({ success: true })),
  resetPasswordWithToken: vi.fn(async () => ({ success: true })),
  signInWithGoogle: vi.fn(async (): Promise<AuthActionResult> => ({ success: true })),
  deleteAccount: vi.fn(async () => ({ success: true })),
  refreshStagingAccess: vi.fn(async () => true),
  consumeTrialStartedRedirect: vi.fn(() => false),
};

export const accountEmailState = {
  emails: [] as AccountEmailAddress[],
};

export const accountEmailActions = {
  listAccountEmails: vi.fn(async () => ({ emails: accountEmailState.emails })),
  addAccountEmail: vi.fn(async (email: string) => {
    const nextEmail: AccountEmailAddress = {
      id: `email-${accountEmailState.emails.length + 1}`,
      email: email.trim().toLowerCase(),
      verified: false,
      verifiedAt: null,
      verificationExpiresAt: '2026-07-13T00:00:00.000Z',
      createdAt: '2026-07-12T00:00:00.000Z',
    };
    accountEmailState.emails = [nextEmail, ...accountEmailState.emails];
    return { email: nextEmail };
  }),
  resendAccountEmailVerification: vi.fn(async (id: string) => {
    const email = accountEmailState.emails.find((candidate) => candidate.id === id);
    if (!email) {
      throw { error: { message: 'Email address was not found or is already verified.' } };
    }
    return { email };
  }),
  verifyAccountEmailToken: vi.fn(async () => ({
    email: {
      id: 'email-verified',
      email: 'alt@example.com',
      verified: true,
      verifiedAt: '2026-07-12T00:00:00.000Z',
      verificationExpiresAt: null,
      createdAt: '2026-07-12T00:00:00.000Z',
    } satisfies AccountEmailAddress,
  })),
};

export const apiState = {
  loads: { ...dbRows } as Record<string, unknown>,
  mutations: [] as Array<{ name: string; params?: Record<string, unknown> }>,
};

export const billingState = {
  config: {
    publishableKey: 'pk_test_mock',
    prices: {
      monthly: 'price_monthly',
      yearly: 'price_yearly',
    },
  } as BillingConfig,
  status: {
    status: 'active',
    subscribed: true,
    currentPeriodEnd: '2026-08-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: 'sub_mock',
    stripePriceId: 'price_monthly',
    trialStartedAt: null,
    trialEndsAt: null,
    trialActive: false,
    trialDaysRemaining: 0,
    hasAccess: true,
  } as BillingStatus,
  paymentMethod: {
    id: 'pm_mock',
    type: 'card',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
    wallet: null,
    billingName: 'Jane Doe',
  } as BillingPaymentMethod | null,
};

export const googleCalendarState = {
  status: {
    configured: true,
    connected: false,
    googleEmail: null,
    calendarId: null,
    lastSyncedAt: null,
    lastError: null,
    syncInProgress: false,
    historyMonths: 6,
    selectedCalendarIds: [],
    setupCompleted: false,
    reauthorizationRequired: false,
  } as GoogleCalendarStatus,
};

export const googleCalendarActions = {
  getGoogleCalendarStatus: vi.fn(async () => googleCalendarState.status),
  getOwnedGoogleCalendars: vi.fn(async () => [
    {
      id: 'primary',
      summary: 'Primary calendar',
      timeZone: 'America/Los_Angeles',
      backgroundColor: '#4285f4',
      primary: true,
      selected: true,
    },
  ]),
  updateGoogleCalendarSettings: vi.fn(async () => googleCalendarState.status),
  previewGoogleCalendarImport: vi.fn(async () => ({
    reviewedCount: 1,
    items: [{
      calendarId: 'primary',
      calendarSummary: 'Primary calendar',
      title: 'Study group',
      date: '2026-07-22',
      time: '16:00',
      inferredCourseCode: null,
      academicClass: false,
    }],
  })),
  connectGoogleCalendar: vi.fn(async () => ({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1' })),
  syncGoogleCalendar: vi.fn(async () => ({
    importedCount: 1,
    updatedCount: 0,
    deletedCount: 0,
    pushedCount: 0,
    fullSync: false,
  })),
  disconnectGoogleCalendar: vi.fn(async () => ({ ok: true })),
};

export const studyPlanState = {
  plans: [] as StudyPlan[],
};

export const studyPlanActions = {
  saveStudyPlan: vi.fn(async (_input: unknown, planId?: string) => ({
    planId: planId ?? 'plan-1',
  })),
  refreshStudyPlan: vi.fn(async (planId: string) => ({ planId, refreshed: true })),
  setStudyTaskCompleted: vi.fn(async (_planId: string, taskId: string, completed: boolean) => ({
    id: taskId,
    completedAt: completed ? '2026-07-25T12:00:00.000Z' : null,
  })),
  openStudyTaskNote: vi.fn(async () => ({ noteId: '99', created: true })),
  setStudyPlanArchived: vi.fn(async (planId: string, archived: boolean) => ({ id: planId, archived })),
  deleteStudyPlan: vi.fn(async () => undefined),
  studyPlanErrorMessage: vi.fn(() => 'Unable to save the study plan.'),
  parseStudyTopics: (value: string) =>
    value
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+|(?:week|topic|module)\s+\d+\s*[:.-]?\s*)/i, '').trim())
      .filter(Boolean),
};

export const onboardingState = {
  value: null as OnboardingState | null,
};

export const onboardingActions = {
  getOnboarding: vi.fn(async () => onboardingState.value),
  initializeOnboarding: vi.fn(async () => onboardingState.value),
  updateOnboarding: vi.fn(async (input: { action: string; step?: string; nextStep?: string }) => {
    if (!onboardingState.value) throw new Error('No onboarding state');
    const current = onboardingState.value;
    const next: OnboardingState = {
      ...current,
      status: input.action === 'skip' ? 'skipped' : input.action === 'complete' ? 'completed' : 'active',
      currentStep: (input.nextStep ?? current.currentStep) as OnboardingState['currentStep'],
      completedSteps: input.action === 'complete_step' && input.step
        ? [...new Set([...current.completedSteps, input.step as OnboardingState['currentStep']])]
        : current.completedSteps,
      deferredSteps: input.action === 'defer_step' && input.step
        ? [...new Set([...current.deferredSteps, input.step as OnboardingState['currentStep']])]
        : current.deferredSteps,
      checklistDismissedAt: input.action === 'dismiss_checklist' ? new Date().toISOString() : current.checklistDismissedAt,
    };
    onboardingState.value = next;
    return next;
  }),
  restartOnboarding: vi.fn(async () => {
    if (!onboardingState.value) throw new Error('No onboarding state');
    onboardingState.value = { ...onboardingState.value, status: 'active', currentStep: 'welcome', checklistDismissedAt: null };
    return onboardingState.value;
  }),
};

export function resetMockState() {
  authState.user = mockUser;
  authState.idToken = 'mock-id-token';
  authState.stagingAccess = { uid: mockUser.id, email: mockUser.email, role: 'admin' };
  authState.isStagingAccessControlEnabled = false;
  authState.isLoading = false;
  authState.isStagingAccessLoading = false;
  authState.isGoogleSignInAvailable = true;
  authState.isProcessingGoogleRedirect = false;
  authState.googleSignInError = null;
  accountEmailState.emails = [];
  apiState.loads = { ...dbRows };
  apiState.mutations = [];
  billingState.status = {
    status: 'active',
    subscribed: true,
    currentPeriodEnd: '2026-08-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: 'sub_mock',
    stripePriceId: 'price_monthly',
    trialStartedAt: null,
    trialEndsAt: null,
    trialActive: false,
    trialDaysRemaining: 0,
    hasAccess: true,
  };
  billingState.paymentMethod = {
    id: 'pm_mock',
    type: 'card',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
    wallet: null,
    billingName: 'Jane Doe',
  };
  googleCalendarState.status = {
    configured: true,
    connected: false,
    googleEmail: null,
    calendarId: null,
    lastSyncedAt: null,
    lastError: null,
    syncInProgress: false,
    historyMonths: 6,
    selectedCalendarIds: [],
    setupCompleted: false,
    reauthorizationRequired: false,
  };
  studyPlanState.plans = [];
  onboardingState.value = null;
  Object.values(authActions).forEach((mock) => mock.mockClear());
  Object.values(accountEmailActions).forEach((mock) => mock.mockClear());
  Object.values(googleCalendarActions).forEach((mock) => mock.mockClear());
  Object.values(studyPlanActions).forEach((mock) => {
    if (typeof mock === 'function' && 'mockClear' in mock) mock.mockClear();
  });
  Object.values(onboardingActions).forEach((mock) => mock.mockClear());
}
