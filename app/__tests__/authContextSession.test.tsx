import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockUser } from '@/app/test/fixtures';
import { AUTH_SESSION_STORAGE_KEY, type StoredAuthSession } from '@/app/lib/auth/sessionPersistence';

const authMocks = vi.hoisted(() => ({
  refreshToken: vi.fn(),
  lookupUser: vi.fn(),
}));

vi.unmock('@/app/lib/auth/AuthContext');
vi.mock('@/app/lib/auth/firebaseRest', () => ({
  firebaseAuth: {
    refreshToken: authMocks.refreshToken,
    lookupUser: authMocks.lookupUser,
  },
}));
vi.mock('@/app/lib/auth/googleOAuth', () => ({
  consumeGoogleRedirectIdToken: vi.fn(() => null),
  getGoogleOAuthRequestUri: vi.fn(() => 'http://localhost'),
  isGoogleSignInConfigured: vi.fn(() => true),
  setGoogleAuthReturnTo: vi.fn(),
  startGoogleSignIn: vi.fn(),
}));
vi.mock('@/app/lib/stagingAccess/client', () => ({
  getStagingAccessConfig: vi.fn(async () => ({ enabled: false })),
  getMyStagingAccess: vi.fn(),
}));
vi.mock('@/app/lib/access/client', () => ({
  reconcileAccess: vi.fn(async () => ({ entitlement: { key: 'test-entitlement' } })),
}));
vi.mock('@/app/lib/billing/client', () => ({
  startTrial: vi.fn(),
}));
vi.mock('@/app/lib/launch/attribution', () => ({
  isKnownInstitutionEmail: vi.fn(() => false),
  isLaunchJourney: vi.fn(() => false),
}));
vi.mock('@/app/lib/launch/client', () => ({
  trackProductEvent: vi.fn(),
}));
vi.mock('@/app/lib/onboarding/client', () => ({
  initializeOnboarding: vi.fn(),
  ONBOARDING_INITIALIZE_PENDING_KEY: 'test-onboarding-pending',
}));
vi.mock('@/app/lib/email/client', () => ({
  requestPasswordResetEmail: vi.fn(),
  requestPrimaryEmailVerification: vi.fn(),
}));

import { AuthProvider, useAuth } from '@/app/lib/auth/AuthContext';
import { setOfflineRuntime } from '@/app/lib/offline/runtime';

function AuthProbe() {
  const { isLoading, user } = useAuth();
  return <div>{isLoading ? 'loading' : user?.email ?? 'signed-out'}</div>;
}

function LogoutProbe() {
  const { isLoading, user, logout } = useAuth();
  return (
    <div>
      <span>{isLoading ? 'loading' : user?.email ?? 'signed-out'}</span>
      <button type="button" onClick={() => logout()}>Log Out</button>
    </div>
  );
}

function signedInSession(): StoredAuthSession {
  return { ...expiredSession(), expiresAt: Date.now() + 60 * 60 * 1000, refreshToken: null };
}

function expiredSession(): StoredAuthSession {
  return {
    version: 2,
    idToken: 'expired-id-token',
    refreshToken: 'stored-refresh-token',
    expiresAt: Date.now() - 1000,
    user: mockUser,
  };
}

describe('AuthProvider remembered sessions', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    authMocks.refreshToken.mockReset();
    authMocks.lookupUser.mockReset();
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(expiredSession()));
  });

  it('refreshes an expired remembered session during startup', async () => {
    authMocks.refreshToken.mockResolvedValue({
      id_token: 'fresh-id-token',
      refresh_token: 'rotated-refresh-token',
      expires_in: '3600',
      user_id: mockUser.id,
    });
    authMocks.lookupUser.mockResolvedValue({
      users: [{
        localId: mockUser.id,
        email: mockUser.email,
        displayName: `${mockUser.firstName} ${mockUser.lastName}`,
        emailVerified: mockUser.emailVerified,
        providerUserInfo: mockUser.connectedProviders.map((providerId) => ({ providerId })),
      }],
    });

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    expect(await screen.findByText(mockUser.email)).toBeInTheDocument();
    expect(authMocks.refreshToken).toHaveBeenCalledWith('stored-refresh-token');
    expect(authMocks.lookupUser).toHaveBeenCalledWith({ idToken: 'fresh-id-token' });
    expect(JSON.parse(localStorage.getItem(AUTH_SESSION_STORAGE_KEY) ?? '{}')).toEqual(expect.objectContaining({
      idToken: 'fresh-id-token',
      refreshToken: 'rotated-refresh-token',
    }));
  });

  it('clears a session when Firebase rejects its refresh token', async () => {
    authMocks.refreshToken.mockRejectedValue({ error: { message: 'INVALID_REFRESH_TOKEN' } });

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(authMocks.lookupUser).not.toHaveBeenCalled();
  });

  it('keeps cached sign-in state when refresh and verification fail transiently', async () => {
    authMocks.refreshToken.mockRejectedValue(new Error('network unavailable'));
    authMocks.lookupUser.mockRejectedValue(new Error('network unavailable'));

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    expect(await screen.findByText(mockUser.email)).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).not.toBeNull();
  });
});

describe('logging out with unsynced offline changes', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    authMocks.refreshToken.mockReset();
    authMocks.lookupUser.mockReset();
    authMocks.lookupUser.mockRejectedValue(new TypeError('Failed to fetch'));
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(signedInSession()));
  });

  afterEach(() => {
    setOfflineRuntime({ enabled: false, userId: null, pendingCount: 0 });
  });

  async function renderSignedIn() {
    render(<AuthProvider><LogoutProbe /></AuthProvider>);
    expect(await screen.findByText(mockUser.email)).toBeInTheDocument();
  }

  it('keeps the session when the warning is declined', async () => {
    setOfflineRuntime({ enabled: true, userId: mockUser.id, pendingCount: 2 });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: 'Log Out' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 changes you made offline'));
    expect(screen.getByText(mockUser.email)).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it('logs out once the warning is accepted', async () => {
    setOfflineRuntime({ enabled: true, userId: mockUser.id, pendingCount: 1 });
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: 'Log Out' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('1 change you made offline'));
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('does not ask when nothing is waiting to sync', async () => {
    setOfflineRuntime({ enabled: true, userId: mockUser.id, pendingCount: 0 });
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: 'Log Out' }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
  });
});
