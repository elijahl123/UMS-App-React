import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';
process.env.UCD_ACCESS_ENABLED = 'false';
process.env.PALOMAR_ACCESS_ENABLED = 'true';
process.env.PALOMAR_ACCESS_DOMAIN = 'student.palomar.edu';
process.env.PALOMAR_ACCESS_END_AT = '2027-01-18T00:00:00Z';
process.env.PALOMAR_ACCESS_GRACE_END_AT = '2027-02-01T00:00:00Z';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  profile: vi.fn(),
  getBillingStatus: vi.fn(),
  stripeUpdate: vi.fn(),
  updateSubscription: vi.fn(),
}));

vi.mock('../db', () => ({ pool: { query: mocks.query } }));
vi.mock('../auth', () => ({ getFirebaseUserProfile: mocks.profile }));
vi.mock('../billing', () => ({
  getBillingStatus: mocks.getBillingStatus,
  stripeClient: () => ({ subscriptions: { update: mocks.stripeUpdate } }),
  updateSubscriptionByStripeSubscription: mocks.updateSubscription,
}));

type Grant = { email: string; source: string } | null;
let grant: Grant;
let secondaryEmail: string | null;

function installDatabaseFake() {
  mocks.query.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes('FROM account_email_addresses')) {
      return { rows: secondaryEmail ? [{ email: secondaryEmail }] : [], rowCount: secondaryEmail ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO access_entitlements')) {
      grant = { email: String(values?.[2]), source: String(values?.[3]) };
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO launch_onboarding') || sql.includes('INSERT INTO product_events')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM access_entitlements')) {
      return grant ? {
        rows: [{
          entitlement_key: 'palomar_autumn_2026',
          qualifying_email: grant.email,
          grant_source: grant.source,
          starts_at: '2026-09-07T08:00:00Z',
          ends_at: '2027-01-18T00:00:00Z',
          grace_ends_at: '2027-02-01T00:00:00Z',
          granted_at: '2026-09-07T08:00:00Z',
        }],
        rowCount: 1,
      } : { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
}

beforeEach(() => {
  grant = null;
  secondaryEmail = null;
  vi.clearAllMocks();
  installDatabaseFake();
  mocks.getBillingStatus.mockResolvedValue({
    subscribed: false,
    trialActive: false,
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
  });
  mocks.stripeUpdate.mockResolvedValue({ id: 'sub_123', cancel_at_period_end: true });
});

describe('institution entitlement reconciliation', () => {
  it('grants Palomar access only for a verified exact-domain primary email', async () => {
    const { reconcileInstitutionEntitlements } = await import('../access');
    mocks.profile.mockResolvedValue({ email: 'Student@STUDENT.PALOMAR.EDU', emailVerified: true });

    const result = await reconcileInstitutionEntitlements('user-1');
    expect(grant).toEqual({ email: 'student@student.palomar.edu', source: 'primary_email' });
    expect(result.entitlement).toMatchObject({ entitlement_key: 'palomar_autumn_2026' });

    grant = null;
    mocks.profile.mockResolvedValue({ email: 'student@student.palomar.edu', emailVerified: false });
    expect((await reconcileInstitutionEntitlements('user-2')).entitlement).toBeNull();
    expect(grant).toBeNull();
  });

  it('grants from a verified secondary record when the primary email is personal', async () => {
    const { reconcileInstitutionEntitlements } = await import('../access');
    mocks.profile.mockResolvedValue({ email: 'personal@example.com', emailVerified: true });
    secondaryEmail = 'secondary@student.palomar.edu';

    await reconcileInstitutionEntitlements('user-3');
    expect(grant).toEqual({ email: 'secondary@student.palomar.edu', source: 'secondary_email' });
  });

  it('cancels renewal at period end after granting an existing paid user', async () => {
    const { reconcileInstitutionEntitlements } = await import('../access');
    mocks.profile.mockResolvedValue({ email: 'paid@student.palomar.edu', emailVerified: true });
    mocks.getBillingStatus.mockResolvedValue({
      subscribed: true,
      trialActive: false,
      stripeSubscriptionId: 'sub_123',
      cancelAtPeriodEnd: false,
    });

    const result = await reconcileInstitutionEntitlements('user-paid');
    expect(mocks.stripeUpdate).toHaveBeenCalledWith('sub_123', { cancel_at_period_end: true });
    expect(mocks.updateSubscription).toHaveBeenCalled();
    expect(result.billingWarning).toBeNull();
  });

  it('keeps paid access and returns a warning when renewal cancellation fails', async () => {
    const { getAccessStatus } = await import('../access');
    mocks.profile.mockResolvedValue({ email: 'paid@student.palomar.edu', emailVerified: true });
    mocks.getBillingStatus.mockResolvedValue({
      subscribed: true,
      trialActive: false,
      stripeSubscriptionId: 'sub_failure',
      cancelAtPeriodEnd: false,
    });
    mocks.stripeUpdate.mockRejectedValue(new Error('Stripe unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await getAccessStatus('user-paid-failure');
    expect(result.accessMode).toBe('full');
    expect(result.entitlement).toMatchObject({ institutionKey: 'palomar', institutionName: 'Palomar' });
    expect(result.billingWarning).toContain('could not stop your paid renewal');
  });
});
