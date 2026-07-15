import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/app';
import { authState, billingState } from '@/app/test/mocks';

describe('App routes', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('redirects unauthenticated users from protected pages to login', async () => {
    authState.user = null;
    window.location.hash = '#/homework';

    render(<App />);

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('sends authenticated users without a subscription to billing', async () => {
    billingState.status = {
      ...billingState.status,
      status: 'inactive',
      subscribed: false,
      stripeSubscriptionId: null,
      stripePriceId: null,
      trialStartedAt: null,
      trialEndsAt: null,
      trialActive: false,
      trialDaysRemaining: 0,
      hasAccess: false,
    };

    render(<App />);

    expect(await screen.findByRole('heading', { name: /subscribe to ums/i })).toBeInTheDocument();
  });

  it('allows active trial users into the app without a paid subscription', async () => {
    billingState.status = {
      ...billingState.status,
      status: 'none',
      subscribed: false,
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      trialStartedAt: '2026-07-15T00:00:00.000Z',
      trialEndsAt: '2026-07-29T00:00:00.000Z',
      trialActive: true,
      trialDaysRemaining: 14,
      hasAccess: true,
    };

    render(<App />);

    expect(await screen.findByText(/upcoming assignments/i)).toBeInTheDocument();
  });

  it('sends expired trial users without a subscription to billing', async () => {
    billingState.status = {
      ...billingState.status,
      status: 'none',
      subscribed: false,
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      trialStartedAt: '2026-06-01T00:00:00.000Z',
      trialEndsAt: '2026-06-15T00:00:00.000Z',
      trialActive: false,
      trialDaysRemaining: 0,
      hasAccess: false,
    };

    render(<App />);

    expect(await screen.findByText(/your free trial has ended/i)).toBeInTheDocument();
  });

  it('renders the dashboard inside the app shell for subscribed users', async () => {
    render(<App />);

    expect(await screen.findByText(/upcoming assignments/i)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /mobile primary navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add anything/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /toggle menu/i })).not.toBeInTheDocument();
  });

  it('blocks authenticated users without staging access when staging access control is enabled', async () => {
    authState.isStagingAccessControlEnabled = true;
    authState.stagingAccess = null;

    render(<App />);

    expect(await screen.findByRole('heading', { name: /access pending/i })).toBeInTheDocument();
  });

  it('renders the staging access admin page for staging admins', async () => {
    authState.isStagingAccessControlEnabled = true;
    window.location.hash = '#/admin/staging-access';

    render(<App />);

    expect(await screen.findByRole('heading', { name: /staging access/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('blocks authenticated users without staging access when staging access control is enabled', async () => {
    authState.isStagingAccessControlEnabled = true;
    authState.stagingAccess = null;

    render(<App />);

    expect(await screen.findByRole('heading', { name: /access pending/i })).toBeInTheDocument();
  });

  it('renders the staging access admin page for staging admins', async () => {
    authState.isStagingAccessControlEnabled = true;
    window.location.hash = '#/admin/staging-access';

    render(<App />);

    expect(await screen.findByRole('heading', { name: /staging access/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('blocks authenticated users without staging access when staging access control is enabled', async () => {
    authState.isStagingAccessControlEnabled = true;
    authState.stagingAccess = null;

    render(<App />);

    expect(await screen.findByRole('heading', { name: /access pending/i })).toBeInTheDocument();
  });

  it('renders the staging access admin page for staging admins', async () => {
    authState.isStagingAccessControlEnabled = true;
    window.location.hash = '#/admin/staging-access';

    render(<App />);

    expect(await screen.findByRole('heading', { name: /staging access/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });
});
