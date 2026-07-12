import { vi } from 'vitest';
import { dbRows, mockUser } from '@/app/test/fixtures';
import type { AppUser, StagingAccessUser } from '@/app/data/types';
import type { BillingConfig, BillingPaymentMethod, BillingStatus } from '@/app/lib/billing/client';

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
  login: vi.fn(async () => ({ success: true })),
  signup: vi.fn(async () => ({ success: true })),
  logout: vi.fn(),
  updateProfile: vi.fn(async () => ({ success: true })),
  changePassword: vi.fn(async () => ({ success: true })),
  resendVerificationEmail: vi.fn(async () => ({ success: true })),
  verifyEmailWithToken: vi.fn(async () => ({ success: true })),
  requestPasswordReset: vi.fn(async () => ({ success: true })),
  resetPasswordWithToken: vi.fn(async () => ({ success: true })),
  signInWithGoogle: vi.fn(async () => ({ success: true })),
  refreshStagingAccess: vi.fn(async () => true),
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
  apiState.loads = { ...dbRows };
  apiState.mutations = [];
  billingState.status = {
    status: 'active',
    subscribed: true,
    currentPeriodEnd: '2026-08-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: 'sub_mock',
    stripePriceId: 'price_monthly',
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
}
