import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';
import { apiState, authActions, authState, billingState, resetMockState } from '@/app/test/mocks';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetMockState();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

window.confirm = vi.fn(() => true);
window.prompt = vi.fn(() => 'https://example.com');

vi.doMock('@/app/lib/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  useAuth: () => ({
    ...authState,
    ...authActions,
  }),
}));

vi.doMock('@/app/lib/api/hooks', () => ({
  useLoadAction: (name: string, initialValue: unknown) => {
    const reload = vi.fn(async () => undefined);
    return [apiState.loads[name] ?? initialValue, false, null, reload];
  },
  useMutateAction: (name: string) => {
    const mutate = vi.fn(async (params?: Record<string, unknown>) => {
      apiState.mutations.push({ name, params });
      return {};
    });
    return [mutate, false, null];
  },
}));

vi.doMock('@/app/lib/billing/client', () => ({
  getBillingConfig: vi.fn(async () => billingState.config),
  getBillingStatus: vi.fn(async () => billingState.status),
  refreshBillingStatus: vi.fn(async () => billingState.status),
  createSubscription: vi.fn(async () => ({ clientSecret: 'pi_secret_mock' })),
  cancelSubscription: vi.fn(async () => ({
    ...billingState.status,
    cancelAtPeriodEnd: true,
  })),
  resumeSubscription: vi.fn(async () => ({
    ...billingState.status,
    cancelAtPeriodEnd: false,
  })),
  updateSubscriptionPlan: vi.fn(async ({ interval }: { interval: 'monthly' | 'yearly' }) => ({
    ...billingState.status,
    stripePriceId: interval === 'yearly' ? 'price_yearly' : 'price_monthly',
  })),
}));

vi.doMock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(async () => ({})),
}));

vi.doMock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  PaymentElement: () => React.createElement('div', { 'data-testid': 'payment-element' }, 'Payment element'),
  useElements: () => ({}),
  useStripe: () => ({
    confirmPayment: vi.fn(async () => ({})),
  }),
}));

vi.doMock('@/app/components/widgets/RichTextEditor', () => ({
  default: ({ content, onChange, placeholder }: { content: string; onChange: (html: string) => void; placeholder?: string }) =>
    React.createElement('textarea', {
      'aria-label': 'Rich text editor',
      placeholder,
      value: content,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
    }),
}));
