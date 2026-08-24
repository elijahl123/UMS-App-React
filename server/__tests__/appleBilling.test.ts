import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../db', () => ({ pool: { query: mocks.query } }));

const { mapRevenueCatStatus, upsertAppleSubscriptionForUser, updateSubscriptionByRevenueCatEvent } = await import('../appleBilling');

function baseEvent(overrides: Partial<Parameters<typeof mapRevenueCatStatus>[0]> = {}) {
  return {
    appUserId: 'user-1',
    email: 'student@example.com',
    productId: 'com.untitledmanagementsoftware.app.monthly',
    entitlementId: 'premium',
    originalTransactionId: 'txn-1',
    expirationAtMs: Date.now() + 1000 * 60 * 60 * 24 * 30,
    willRenew: true,
    environment: 'SANDBOX' as const,
    eventType: 'INITIAL_PURCHASE',
    ...overrides,
  };
}

describe('mapRevenueCatStatus', () => {
  it.each([
    ['INITIAL_PURCHASE', 'active'],
    ['RENEWAL', 'active'],
    ['UNCANCELLATION', 'active'],
    ['PRODUCT_CHANGE', 'active'],
    ['CANCELLATION', 'active'],
    ['EXPIRATION', 'canceled'],
    ['BILLING_ISSUE', 'past_due'],
    ['SOMETHING_UNKNOWN', 'none'],
  ])('maps %s to %s', (eventType, expected) => {
    expect(mapRevenueCatStatus(baseEvent({ eventType }))).toBe(expected);
  });
});

describe('upsertAppleSubscriptionForUser', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('writes provider apple and only Apple-specific columns', async () => {
    await upsertAppleSubscriptionForUser({
      userId: 'user-1',
      email: 'student@example.com',
      productId: 'com.untitledmanagementsoftware.app.monthly',
      entitlementId: 'premium',
      originalTransactionId: 'txn-1',
      status: 'active',
      expirationAtMs: 1_700_000_000_000,
      willRenew: true,
      environment: 'SANDBOX',
    });

    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sql, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("'apple'");
    expect(sql).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(values[0]).toBe('user-1');
    expect(values[5]).toBe('active');
  });

  it('falls back to the existing email on conflict when none is provided', async () => {
    await upsertAppleSubscriptionForUser({ userId: 'user-1', status: 'active' });

    const [, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(values[1]).toBe('');
  });
});

describe('updateSubscriptionByRevenueCatEvent', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('resolves the row directly by app_user_id with no lookup', async () => {
    const userId = await updateSubscriptionByRevenueCatEvent(baseEvent({ eventType: 'RENEWAL' }));

    expect(userId).toBe('user-1');
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(values[5]).toBe('active');
  });
});
