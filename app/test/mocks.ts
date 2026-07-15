import { vi } from 'vitest';
import { dbRows, mockUser } from '@/app/test/fixtures';
import type { AppUser, StagingAccessUser } from '@/app/data/types';
import type { AccountEmailAddress } from '@/app/lib/accountEmails/client';
import type { BillingConfig, BillingPaymentMethod, BillingStatus } from '@/app/lib/billing/client';

type AuthActionResult = { success: boolean; error?: string; trialStartedNow?: boolean };

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
  Object.values(authActions).forEach((mock) => mock.mockClear());
  Object.values(accountEmailActions).forEach((mock) => mock.mockClear());
}
