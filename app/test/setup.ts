import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';
import {
  accountEmailActions,
  apiState,
  authActions,
  authState,
  billingState,
  googleCalendarActions,
  resetMockState,
} from '@/app/test/mocks';

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

vi.doMock('@/app/lib/accountEmails/client', () => ({
  ...accountEmailActions,
}));

vi.doMock('@/app/lib/googleCalendar/client', () => ({
  ...googleCalendarActions,
}));

vi.doMock('@/app/lib/api/hooks', () => ({
  useLoadAction: (name: string, initialValue: unknown) => {
    const reload = vi.fn(async () => undefined);
    return [apiState.loads[name] ?? initialValue, false, null, reload];
  },
  useMutateAction: (name: string) => {
    const mutate = vi.fn(async (params?: Record<string, unknown>) => {
      apiState.mutations.push({ name, params });
      if (name === 'createNote') {
        return [
          {
            id: 99,
            course_id: params?.courseId ? Number(params.courseId) : null,
            title: params?.title,
            content: params?.content ?? '',
            created_at: '2026-07-10T16:30:00.000Z',
            updated_at: '2026-07-10T16:30:00.000Z',
          },
        ];
      }
      return {};
    });
    return [mutate, false, null];
  },
}));

vi.doMock('@/app/lib/billing/client', () => ({
  getBillingConfig: vi.fn(async () => billingState.config),
  getBillingStatus: vi.fn(async () => billingState.status),
  refreshBillingStatus: vi.fn(async () => billingState.status),
  startTrial: vi.fn(async () => ({ ...billingState.status, trialStartedNow: false })),
  getPaymentMethod: vi.fn(async () => ({ paymentMethod: billingState.paymentMethod })),
  createSubscription: vi.fn(async () => ({ clientSecret: 'pi_secret_mock' })),
  createPaymentMethodSetupIntent: vi.fn(async () => ({ clientSecret: 'seti_secret_mock' })),
  savePaymentMethod: vi.fn(async () => ({
    paymentMethod: {
      id: 'pm_updated_mock',
      type: 'card',
      brand: 'mastercard',
      last4: '5555',
      expMonth: 11,
      expYear: 2031,
      wallet: null,
      billingName: 'Jane Doe',
    },
  })),
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

vi.doMock('@/app/lib/notifications/client', () => ({
  getNotificationPreferences: vi.fn(async () => ({
    userId: authState.user?.id ?? 'user-1',
    enabled: false,
    assignment24hEnabled: true,
    assignment1hEnabled: true,
    event10mEnabled: true,
    class10mEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    timeZone: 'America/Los_Angeles',
  })),
  updateNotificationPreferences: vi.fn(async (preferences) => ({
    userId: authState.user?.id ?? 'user-1',
    ...preferences,
  })),
  syncNotificationInstances: vi.fn(async () => []),
  listNotificationInstances: vi.fn(async () => []),
  markNotificationRead: vi.fn(async () => ({ ok: true })),
  dismissNotification: vi.fn(async () => ({ ok: true })),
  markAllNotificationsRead: vi.fn(async () => ({ ok: true })),
  unreadNotificationCount: vi.fn(() => 0),
}));

vi.doMock('@/app/lib/notifications/scheduler', () => ({
  getNotificationPermissionStatus: vi.fn(async () => 'unsupported'),
  getNativePendingNotificationCount: vi.fn(async () => null),
  requestNotificationPermission: vi.fn(async () => 'unsupported'),
  showDueWebNotifications: vi.fn(async () => undefined),
  syncAndScheduleNotifications: vi.fn(async () => []),
}));

vi.doMock('@/app/lib/stagingAccess/client', () => ({
  getStagingAccessConfig: vi.fn(async () => ({ enabled: authState.isStagingAccessControlEnabled })),
  getMyStagingAccess: vi.fn(async () => ({ enabled: authState.isStagingAccessControlEnabled, user: authState.stagingAccess })),
  listStagingAccessUsers: vi.fn(async () => [
    {
      id: 1,
      email: 'admin@example.com',
      firebase_uid: 'mock-user-id',
      role: 'admin',
      status: 'active',
      invited_by: null,
      created_at: '2026-07-10T16:30:00.000Z',
      updated_at: '2026-07-10T16:30:00.000Z',
      last_seen_at: '2026-07-10T16:30:00.000Z',
    },
  ]),
  upsertStagingAccessUser: vi.fn(async () => ({})),
  updateStagingAccessUser: vi.fn(async () => ({})),
  deleteStagingAccessUser: vi.fn(async () => ({ success: true })),
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
    confirmSetup: vi.fn(async () => ({ setupIntent: { id: 'seti_mock', status: 'succeeded' } })),
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
