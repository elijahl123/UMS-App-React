import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mapFirebaseUser } from '@/app/data/mappers';
import type { AppUser, StagingAccessUser } from '@/app/data/types';
import { apiFetch, getApiAuthHeaders, setApiAuthToken, setApiAuthTokenRefresher } from '@/app/lib/api/client';
import {
  consumeGoogleRedirectIdToken,
  getGoogleOAuthRequestUri,
  isGoogleSignInConfigured,
  setGoogleAuthReturnTo,
  startGoogleSignIn,
} from '@/app/lib/auth/googleOAuth';
import { firebaseAuth } from '@/app/lib/auth/firebaseRest';
import { startTrial } from '@/app/lib/billing/client';
import { configureRevenueCat, isIOSNativeApp, logOutRevenueCat } from '@/app/lib/billing/revenuecat';
import { stagingAccessControlEnabled } from '@/app/lib/env';
import { clearOfflineData } from '@/app/lib/offline/db';
import { getPendingOfflineCount, isBrowserOffline } from '@/app/lib/offline/runtime';
import { getMyStagingAccess, getStagingAccessConfig } from '@/app/lib/stagingAccess/client';
import { reconcileAccess } from '@/app/lib/access/client';
import { isKnownInstitutionEmail, isLaunchJourney } from '@/app/lib/launch/attribution';
import { trackProductEvent } from '@/app/lib/launch/client';
import { initializeOnboarding, ONBOARDING_INITIALIZE_PENDING_KEY } from '@/app/lib/onboarding/client';
import { requestPasswordResetEmail, requestPrimaryEmailVerification } from '@/app/lib/email/client';
import {
  clearStoredAuthSession,
  expiresAtFrom,
  readStoredAuthSession,
  shouldRefreshSession,
  writeStoredAuthSession,
  type SessionPersistence,
  type StoredAuthSession,
} from '@/app/lib/auth/sessionPersistence';

const TRIAL_REDIRECT_STORAGE_KEY = 'schoolwork_trial_started_redirect';
const GOOGLE_PERSISTENCE_STORAGE_KEY = 'schoolwork_google_auth_persistence';

type AuthResult = Promise<{
  success: boolean;
  error?: string;
  trialStartedNow?: boolean;
  verificationEmailSent?: boolean;
}>;

interface FirebaseErrorResponse {
  error?: { message?: string };
}

interface FirebaseAuthResult {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresIn?: string;
  displayName?: string;
}

interface FirebaseIdpResult {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresIn?: string;
  displayName?: string;
  emailVerified?: boolean;
  providerId?: string;
  isNewUser?: boolean;
}

interface FirebaseRefreshResult {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
}

interface FirebaseLookupResult {
  users?: Array<{
    localId: string;
    email: string;
    displayName?: string;
    emailVerified?: boolean;
    createdAt?: string;
    providerUserInfo?: Array<{
      providerId?: string;
    }>;
  }>;
}

function friendlyFirebaseError(code: string): string {
  switch (code) {
    case 'EMAIL_EXISTS':
      return 'An account with that email already exists.';
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_PASSWORD':
      return 'Invalid email or password.';
    case 'USER_DISABLED':
      return 'This account has been disabled.';
    case 'WEAK_PASSWORD : Password should be at least 6 characters':
      return 'Password should be at least 6 characters.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
    case 'TOO_MANY_REQUESTS':
      return 'Too many attempts. Please try again later.';
    case 'INVALID_ID_TOKEN':
      return 'Your session has expired. Please log in again.';
    case 'EMAIL_DELIVERY_FAILED':
      return 'We could not send the email. Please try again.';
    case 'INVALID_OOB_CODE':
      return 'This link is invalid or has already been used.';
    case 'EXPIRED_OOB_CODE':
      return 'This link has expired. Please request a new one.';
    default:
      return code.startsWith('WEAK_PASSWORD') ? 'Password should be at least 6 characters.' : 'Something went wrong. Please try again.';
  }
}

function extractErrorCode(err: unknown): string {
  const response = (err as { response?: FirebaseErrorResponse })?.response ?? (err as FirebaseErrorResponse);
  return response?.error?.message ?? 'UNKNOWN_ERROR';
}

// Signing in always needs Firebase, so offline it fails with a raw network
// error. Say so plainly instead: an existing session keeps working offline, but
// a new sign-in cannot.
const OFFLINE_SIGN_IN_MESSAGE = 'You are offline. Signing in needs a connection. Reconnect and try again.';

function isTerminalRefreshError(err: unknown): boolean {
  return new Set(['TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_REFRESH_TOKEN']).has(extractErrorCode(err));
}

function persistenceFromRememberMe(rememberMe: boolean): SessionPersistence {
  return rememberMe ? 'local' : 'session';
}

function consumeGooglePersistence(): SessionPersistence | null {
  const stored = sessionStorage.getItem(GOOGLE_PERSISTENCE_STORAGE_KEY);
  sessionStorage.removeItem(GOOGLE_PERSISTENCE_STORAGE_KEY);
  return stored === 'local' || stored === 'session' ? stored : null;
}

interface AuthContextValue {
  user: AppUser | null;
  idToken: string | null;
  stagingAccess: StagingAccessUser | null;
  isStagingAccessControlEnabled: boolean;
  isLoading: boolean;
  isStagingAccessLoading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => AuthResult;
  signup: (values: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => AuthResult;
  logout: () => void;
  updateProfile: (values: { email: string; firstName: string; lastName: string }) => Promise<{ success: boolean; error?: string }>;
  changePassword: (values: { currentPassword: string; newPassword: string }) => Promise<{ success: boolean; error?: string }>;
  resendVerificationEmail: () => Promise<{ success: boolean; error?: string }>;
  verifyEmailWithToken: (oobCode: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordWithToken: (oobCode: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: (rememberMe?: boolean) => AuthResult;
  deleteAccount: (values: { confirmationEmail: string }) => Promise<{ success: boolean; error?: string }>;
  isGoogleSignInAvailable: boolean;
  isProcessingGoogleRedirect: boolean;
  googleSignInError: string | null;
  refreshStagingAccess: () => Promise<boolean>;
  consumeTrialStartedRedirect: () => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [stagingAccess, setStagingAccess] = useState<StagingAccessUser | null>(null);
  const [isStagingAccessControlEnabled, setIsStagingAccessControlEnabled] = useState(stagingAccessControlEnabled);
  const [isLoading, setIsLoading] = useState(true);
  const [isStagingAccessLoading, setIsStagingAccessLoading] = useState(false);
  const [isProcessingGoogleRedirect, setIsProcessingGoogleRedirect] = useState(false);
  const [googleSignInError, setGoogleSignInError] = useState<string | null>(null);
  const [trialStartedRedirectPending, setTrialStartedRedirectPending] = useState(() =>
    sessionStorage.getItem(TRIAL_REDIRECT_STORAGE_KEY) === '1'
  );
  const sessionRef = useRef<StoredAuthSession | null>(null);
  const persistenceRef = useRef<SessionPersistence>('local');
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    refreshPromiseRef.current = null;
    setUser(null);
    setIdToken(null);
    setStagingAccess(null);
    setApiAuthToken(null);
    clearStoredAuthSession();
  }, []);

  const persistSession = useCallback((
    tokens: { idToken: string; refreshToken?: string | null; expiresIn?: string | number },
    nextUser: AppUser,
    persistence: SessionPersistence = persistenceRef.current
  ) => {
    const currentSession = sessionRef.current;
    const calculatedExpiresAt = expiresAtFrom(tokens.expiresIn, tokens.idToken);
    const nextSession: StoredAuthSession = {
      version: 2,
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken ?? currentSession?.refreshToken ?? null,
      expiresAt: calculatedExpiresAt ?? (tokens.idToken === currentSession?.idToken ? currentSession.expiresAt : null),
      user: nextUser,
    };
    sessionRef.current = nextSession;
    persistenceRef.current = persistence;
    setIdToken(nextSession.idToken);
    setApiAuthToken(nextSession.idToken);
    setUser(nextUser);
    writeStoredAuthSession(nextSession, persistence);
  }, []);

  const refreshAuthToken = useCallback(async (force = false): Promise<string | null> => {
    const session = sessionRef.current;
    if (!session) return null;
    if (!session.refreshToken || (!force && !shouldRefreshSession(session))) {
      return session.idToken;
    }
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshToken = session.refreshToken;
    const refreshPromise = (async () => {
      try {
        const result = await firebaseAuth.refreshToken(refreshToken) as FirebaseRefreshResult;
        persistSession({
          idToken: result.id_token,
          refreshToken: result.refresh_token,
          expiresIn: result.expires_in,
        }, session.user);
        return result.id_token;
      } catch (err) {
        if (isTerminalRefreshError(err)) {
          console.warn('[Auth] Stored Firebase session is no longer valid:', extractErrorCode(err));
          clearSession();
          return null;
        }
        console.warn('[Auth] Token refresh temporarily failed; keeping the stored session:', err);
        return sessionRef.current?.idToken ?? session.idToken;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [clearSession, persistSession]);

  useEffect(() => {
    setApiAuthTokenRefresher(() => refreshAuthToken());
    return () => setApiAuthTokenRefresher(null);
  }, [refreshAuthToken]);

  const refreshStagingAccess = async (token = idToken, enabled = isStagingAccessControlEnabled): Promise<boolean> => {
    if (!enabled) {
      setStagingAccess(null);
      setIsStagingAccessLoading(false);
      return true;
    }

    if (!token) {
      setStagingAccess(null);
      setIsStagingAccessLoading(false);
      return false;
    }

    setIsStagingAccessLoading(true);
    setApiAuthToken(token);
    try {
      const result = await getMyStagingAccess();
      setStagingAccess(result.user);
      return Boolean(result.user);
    } catch (err) {
      console.warn('[Auth] Staging access check failed:', err);
      setStagingAccess(null);
      return false;
    } finally {
      setIsStagingAccessLoading(false);
    }
  };

  const markTrialStartedRedirect = useCallback(() => {
    sessionStorage.setItem(TRIAL_REDIRECT_STORAGE_KEY, '1');
    setTrialStartedRedirectPending(true);
  }, []);

  const consumeTrialStartedRedirect = useCallback(() => {
    const pending = trialStartedRedirectPending || sessionStorage.getItem(TRIAL_REDIRECT_STORAGE_KEY) === '1';
    if (pending) {
      sessionStorage.removeItem(TRIAL_REDIRECT_STORAGE_KEY);
      setTrialStartedRedirectPending(false);
    }
    return pending;
  }, [trialStartedRedirectPending]);

  const startTrialAfterAuth = async (nextUser: AppUser): Promise<boolean> => {
    await configureRevenueCat(nextUser.id).catch((err) => {
      console.warn('[Auth] RevenueCat configure failed:', err);
    });

    // iOS purchasers get Apple's own free-trial offer via RevenueCat; skip the
    // homegrown 14-day trial there so the two don't double up.
    if (isIOSNativeApp()) {
      return false;
    }

    try {
      const access = await reconcileAccess().catch((err) => {
        console.warn('[Auth] student entitlement check failed:', err);
        return null;
      });
      if (access?.entitlement || isKnownInstitutionEmail(nextUser.email) || isLaunchJourney()) {
        return false;
      }
      const status = await startTrial({ userId: nextUser.id, email: nextUser.email });
      if (status.trialStartedNow) {
        markTrialStartedRedirect();
      }
      return status.trialStartedNow;
    } catch (err) {
      console.warn('[Auth] Trial start check failed:', err);
      return false;
    }
  };

  const loginWithGoogle = async (
    googleIdToken: string,
    linkToIdToken?: string,
    accessControlEnabled = isStagingAccessControlEnabled,
    persistence = persistenceRef.current
  ) => {
    try {
      const postBody = `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`;
      const result: FirebaseIdpResult = await firebaseAuth.signInWithIdp({
        postBody,
        requestUri: getGoogleOAuthRequestUri(),
        idToken: linkToIdToken,
      });
      const lookup: FirebaseLookupResult = await firebaseAuth.lookupUser({ idToken: result.idToken });
      const freshUser = lookup?.users?.[0];
      const nextUser: AppUser = freshUser
        ? mapFirebaseUser(freshUser)
        : {
            id: result.localId,
            email: result.email,
            firstName: (result.displayName ?? '').split(' ').filter(Boolean)[0] ?? '',
            lastName: (result.displayName ?? '').split(' ').filter(Boolean).slice(1).join(' '),
            createdAt: new Date().toISOString(),
            emailVerified: result.emailVerified ?? true,
            connectedProviders: [result.providerId ?? 'google.com'],
      };
      persistSession({
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      }, nextUser, persistence);
      const trialStartedNow = await startTrialAfterAuth(nextUser);
      if (result.isNewUser) {
        initializeFirstRun(nextUser);
        void trackProductEvent('signup_completed');
      }
      await refreshStagingAccess(result.idToken, accessControlEnabled);
      console.log('[Auth] Google id_token exchanged for Firebase session');
      return { success: true, trialStartedNow };
    } catch (err) {
      console.error('[Auth] Google id_token exchange failed:', err);
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  useEffect(() => {
    (async () => {
      const authStartedAt = performance.now();
      try {
        console.log('[Auth] Mount: checking for Firebase auth redirect result in URL');
        let accessControlEnabled = stagingAccessControlEnabled;
        try {
          const stagingConfig = await getStagingAccessConfig();
          accessControlEnabled = stagingConfig.enabled;
          setIsStagingAccessControlEnabled(stagingConfig.enabled);
        } catch {
          setIsStagingAccessControlEnabled(stagingAccessControlEnabled);
        }
        const storedRecord = readStoredAuthSession();
        if (storedRecord) {
          sessionRef.current = storedRecord.session;
          persistenceRef.current = storedRecord.persistence;
          setApiAuthToken(storedRecord.session.idToken);
        }
        const googleIdToken = consumeGoogleRedirectIdToken();

        if (googleIdToken) {
          console.log('[Auth] Found Google id_token from local OAuth redirect');
          setIsProcessingGoogleRedirect(true);
          const persistence = consumeGooglePersistence() ?? storedRecord?.persistence ?? 'local';
          const linkToken = storedRecord ? await refreshAuthToken() : null;
          const result = await loginWithGoogle(googleIdToken, linkToken ?? undefined, accessControlEnabled, persistence);
          if (!result.success) {
            setGoogleSignInError(result.error ?? 'Failed to complete sign-in. Please try again.');
            console.error('[Auth] Google redirect sign-in failed:', result.error);
          }
          if (result.success) {
            console.log('[Auth] Google redirect sign-in completed');
          }
          return;
        }

        // Firebase's __/auth/handler redirects back here with sessionToken in URL params
        const params = new URLSearchParams(window.location.search);
        const sessionToken = params.get('sessionToken');

        if (sessionToken) {
          console.log('[Auth] Found sessionToken from Firebase auth handler');
          setIsProcessingGoogleRedirect(true);
          try {
            // Exchange Firebase session token for user info
            const lookup: FirebaseLookupResult = await firebaseAuth.lookupUser({ idToken: sessionToken });
            const freshUser = lookup?.users?.[0];
            if (freshUser) {
              console.log('[Auth] Successfully logged in user:', freshUser.email);
              const nextUser = mapFirebaseUser(freshUser);
              persistSession({ idToken: sessionToken }, nextUser, consumeGooglePersistence() ?? 'local');
              await startTrialAfterAuth(nextUser);
              await refreshStagingAccess(sessionToken, accessControlEnabled);
              // Clean URL
              const previousUrl = window.location.href;
              window.history.replaceState(null, '', `${window.location.pathname}#/`);
              window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: previousUrl, newURL: window.location.href }));
              return;
            }
          } catch (err) {
            console.error('[Auth] Failed to exchange sessionToken:', err);
            setGoogleSignInError('Failed to complete sign-in. Please try again.');
          }
        }

        console.log('[Auth] No sessionToken found, checking for stored session');
        if (storedRecord) {
          const { session, persistence } = storedRecord;
          sessionRef.current = session;
          persistenceRef.current = persistence;
          setUser(session.user);
          setIdToken(session.idToken);
          setApiAuthToken(session.idToken);
          try {
            const activeToken = await refreshAuthToken();
            if (!activeToken || !sessionRef.current) return;
            const lookup: FirebaseLookupResult = await firebaseAuth.lookupUser({ idToken: activeToken });
            const freshUser = lookup?.users?.[0];
            if (freshUser) {
              const nextUser = mapFirebaseUser(freshUser);
              persistSession({
                idToken: activeToken,
                refreshToken: sessionRef.current.refreshToken,
                expiresIn: sessionRef.current.expiresAt === null
                  ? undefined
                  : Math.max(1, Math.round((sessionRef.current.expiresAt - Date.now()) / 1000)),
              }, nextUser, persistence);
              await startTrialAfterAuth(nextUser);
              await refreshStagingAccess(activeToken, accessControlEnabled);
            } else {
              clearSession();
            }
          } catch (err) {
            if (!session.refreshToken && extractErrorCode(err) === 'INVALID_ID_TOKEN') {
              clearSession();
            } else {
              console.warn('[Auth] Stored session could not be verified; keeping it for a later retry:', err);
            }
          }
        }
      } catch (err) {
        console.error('[Auth] Bootstrap failed:', err);
      } finally {
        setIsProcessingGoogleRedirect(false);
        setIsLoading(false);
        console.log(`[Auth] Bootstrap completed in ${Math.round(performance.now() - authStartedAt)}ms`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeFirstRun = (nextUser: AppUser) => {
    localStorage.setItem(ONBOARDING_INITIALIZE_PENDING_KEY, nextUser.id);
    void initializeOnboarding().then(() => {
      if (localStorage.getItem(ONBOARDING_INITIALIZE_PENDING_KEY) === nextUser.id) {
        localStorage.removeItem(ONBOARDING_INITIALIZE_PENDING_KEY);
      }
    }).catch(() => undefined);
  };

  const login = async (email: string, password: string, rememberMe: boolean) => {
    if (isBrowserOffline()) return { success: false, error: OFFLINE_SIGN_IN_MESSAGE };
    try {
      const result: FirebaseAuthResult = await firebaseAuth.signIn({ email, password });
      const lookup: FirebaseLookupResult = await firebaseAuth.lookupUser({ idToken: result.idToken });
      const freshUser = lookup?.users?.[0];
      if (!freshUser) {
        return { success: false, error: 'Could not log in. Please try again.' };
      }
      const nextUser = mapFirebaseUser(freshUser);
      persistSession({
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      }, nextUser, persistenceFromRememberMe(rememberMe));
      const trialStartedNow = await startTrialAfterAuth(nextUser);
      await refreshStagingAccess(result.idToken);
      return { success: true, trialStartedNow };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const signup = async (values: { email: string; password: string; firstName: string; lastName: string }) => {
    if (isBrowserOffline()) return { success: false, error: OFFLINE_SIGN_IN_MESSAGE };
    try {
      const displayName = `${values.firstName} ${values.lastName}`.trim();
      const result: FirebaseAuthResult = await firebaseAuth.signUp({ email: values.email, password: values.password });
      const profileResult: FirebaseAuthResult = await firebaseAuth.updateProfile({
        idToken: result.idToken,
        email: values.email,
        displayName,
      });
      const nextUser = {
        id: result.localId,
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        createdAt: new Date().toISOString(),
        emailVerified: false,
        connectedProviders: ['password'],
      };
      persistSession({
        idToken: profileResult.idToken ?? result.idToken,
        refreshToken: profileResult.refreshToken ?? result.refreshToken,
        expiresIn: profileResult.expiresIn ?? result.expiresIn,
      }, nextUser, 'local');
      initializeFirstRun(nextUser);
      void trackProductEvent('signup_completed');
      const trialStartedNow = await startTrialAfterAuth(nextUser);
      await refreshStagingAccess(result.idToken);
      let verificationEmailSent = true;
      try {
        await requestPrimaryEmailVerification();
      } catch (err) {
        verificationEmailSent = false;
        console.error('[Auth] Initial verification email could not be sent:', extractErrorCode(err));
      }
      return { success: true, trialStartedNow, verificationEmailSent };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const performLogout = () => {
    sessionStorage.removeItem(GOOGLE_PERSISTENCE_STORAGE_KEY);
    clearSession();
    // Cached rows and queued edits are unencrypted browser storage; never leave
    // them behind for whoever signs in next on this device.
    void clearOfflineData().catch((err) => {
      console.warn('[Offline] Could not clear offline data on logout:', err);
    });
    void logOutRevenueCat().catch((err) => {
      console.warn('[Auth] RevenueCat logout failed:', err);
    });
  };

  /**
   * Logging out wipes the offline store, so edits made offline that have not
   * reached the server would go with it. Ask first. The guard lives here rather
   * than on each Log Out button so every entry point is covered.
   */
  const logout = () => {
    const pending = getPendingOfflineCount();
    if (pending > 0 && typeof window !== 'undefined') {
      const changes = pending === 1 ? '1 change' : `${pending} changes`;
      const verb = pending === 1 ? 'has' : 'have';
      const object = pending === 1 ? 'it' : 'them';
      const advice = isBrowserOffline()
        ? `Reconnect to sync ${object} first, or log out anyway?`
        : `Use Sync now in Account preferences first, or log out anyway?`;
      if (!window.confirm(`${changes} you made offline ${verb} not reached the server yet. Logging out discards ${object}. ${advice}`)) {
        return;
      }
    }
    performLogout();
  };

  const updateProfile = async (values: { email: string; firstName: string; lastName: string }) => {
    if (!user || !idToken) {
      return { success: false, error: 'You must be logged in.' };
    }
    try {
      const displayName = `${values.firstName} ${values.lastName}`.trim();
      const result: FirebaseAuthResult = await firebaseAuth.updateProfile({
        idToken,
        email: values.email.trim().toLowerCase(),
        displayName,
      });
      const nextUser: AppUser = {
        ...user,
        email: result.email,
        firstName: values.firstName,
        lastName: values.lastName,
      };
      persistSession({
        idToken: result.idToken ?? idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      }, nextUser);
      await refreshStagingAccess(result.idToken ?? idToken);
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const changePassword = async (values: { currentPassword: string; newPassword: string }) => {
    if (!user || !idToken) {
      return { success: false, error: 'You must be logged in.' };
    }
    try {
      // Re-authenticate by signing in with the current password before changing it.
      const reauthenticated: FirebaseAuthResult = await firebaseAuth.signIn({ email: user.email, password: values.currentPassword });
      const result: FirebaseAuthResult = await firebaseAuth.changePassword({ idToken: reauthenticated.idToken, password: values.newPassword });
      persistSession({
        idToken: result.idToken ?? reauthenticated.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      }, user);
      await refreshStagingAccess(result.idToken ?? reauthenticated.idToken);
      return { success: true };
    } catch (err) {
      const code = extractErrorCode(err);
      if (code === 'INVALID_LOGIN_CREDENTIALS' || code === 'INVALID_PASSWORD' || code === 'EMAIL_NOT_FOUND') {
        return { success: false, error: 'Current password is incorrect.' };
      }
      return { success: false, error: friendlyFirebaseError(code) };
    }
  };

  const resendVerificationEmail = async () => {
    if (!user || !idToken) {
      return { success: false, error: 'You must be logged in.' };
    }
    if (user.emailVerified) {
      return { success: false, error: 'Your email is already verified.' };
    }
    try {
      const result = await requestPrimaryEmailVerification();
      if (result.status === 'already_verified') {
        return { success: false, error: 'Your email is already verified.' };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const verifyEmailWithToken = async (oobCode: string) => {
    try {
      await firebaseAuth.verifyEmail({ oobCode });
      if (user && idToken) {
        const lookup: FirebaseLookupResult = await firebaseAuth.lookupUser({ idToken });
        const freshUser = lookup?.users?.[0];
        if (freshUser) {
          const nextUser = mapFirebaseUser(freshUser);
          persistSession({ idToken }, nextUser);
          await reconcileAccess();
        }
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const requestPasswordReset = async (email: string) => {
    try {
      await requestPasswordResetEmail(email.trim().toLowerCase());
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const resetPasswordWithToken = async (oobCode: string, newPassword: string) => {
    try {
      await firebaseAuth.resetPassword({ oobCode, newPassword });
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const signInWithGoogle = async (rememberMe?: boolean) => {
    console.log('[Auth] ========== signInWithGoogle() called ==========');
    console.log('[Auth] Current URL:', window.location.href);
    console.log('[Auth] isGoogleSignInAvailable:', isGoogleSignInConfigured());
    setGoogleSignInError(null);
    if (isBrowserOffline()) {
      setGoogleSignInError(OFFLINE_SIGN_IN_MESSAGE);
      return { success: false, error: OFFLINE_SIGN_IN_MESSAGE };
    }
    setIsProcessingGoogleRedirect(true);
    const persistence = rememberMe === undefined ? persistenceRef.current : persistenceFromRememberMe(rememberMe);
    sessionStorage.setItem(GOOGLE_PERSISTENCE_STORAGE_KEY, persistence);
    try {
      console.log('[Auth] Calling startGoogleSignIn()...');
      setGoogleAuthReturnTo(user ? '/account' : isLaunchJourney() ? '/signup?student_launch_google=1' : '/');
      const linkToken = user ? await refreshAuthToken() : null;
      const { idToken: googleIdToken } = await startGoogleSignIn();
      consumeGooglePersistence();
      console.log('[Auth] ========== startGoogleSignIn() completed successfully ==========');
      console.log('[Auth] Received google idToken, exchanging for Firebase session');
      const result = await loginWithGoogle(googleIdToken, linkToken ?? undefined, isStagingAccessControlEnabled, persistence);
      console.log('[Auth] Firebase exchange result:', result.success ? 'SUCCESS' : 'FAILED - ' + result.error);
      if (!result.success) {
        setGoogleSignInError(result.error ?? 'Unable to sign in with Google.');
      }
      return result;
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'POPUP_BLOCKED'
          ? 'Please allow popups for this site to sign in with Google.'
          : err instanceof Error && err.message === 'GOOGLE_SIGN_IN_CANCELLED'
            ? 'Google sign-in was cancelled.'
            : err instanceof Error && err.message.includes('redirect_uri_mismatch')
              ? 'Google sign-in is not configured for this app redirect URL.'
              : err instanceof Error
                ? `Google sign-in failed: ${err.message}`
                : 'Google sign-in was cancelled.';
      console.error('[Auth] ========== Google sign-in FAILED ==========');
      console.error('[Auth] Error:', err);
      console.error('[Auth] Error message:', message);
      setGoogleSignInError(message);
      return { success: false, error: message };
    } finally {
      sessionStorage.removeItem(GOOGLE_PERSISTENCE_STORAGE_KEY);
      setIsProcessingGoogleRedirect(false);
    }
  };

  const deleteAccount = async (values: { confirmationEmail: string }) => {
    if (!user || !idToken) {
      return { success: false, error: 'You must be logged in.' };
    }

    try {
      const response = await apiFetch('/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return { success: false, error: payload?.error?.message ?? 'Unable to delete account.' };
      }

      performLogout();
      return { success: true };
    } catch {
      return { success: false, error: 'Unable to delete account.' };
    }
  };

  const value = useMemo(
    () => ({
      user,
      idToken,
      stagingAccess,
      isStagingAccessControlEnabled,
      isLoading,
      isStagingAccessLoading,
      login,
      signup,
      logout,
      updateProfile,
      changePassword,
      resendVerificationEmail,
      verifyEmailWithToken,
      requestPasswordReset,
      resetPasswordWithToken,
      signInWithGoogle,
      deleteAccount,
      isGoogleSignInAvailable: isGoogleSignInConfigured(),
      isProcessingGoogleRedirect,
      googleSignInError,
      refreshStagingAccess: () => refreshStagingAccess(),
      consumeTrialStartedRedirect,
    }),
    [
      user,
      idToken,
      stagingAccess,
      isStagingAccessControlEnabled,
      isLoading,
      isStagingAccessLoading,
      isProcessingGoogleRedirect,
      googleSignInError,
      consumeTrialStartedRedirect,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export { AuthProvider, useAuth };
