import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { mapFirebaseUser } from '@/app/data/mappers';
import type { AppUser, StagingAccessUser } from '@/app/data/types';
import { setApiAuthToken } from '@/app/lib/api/client';
import { startGoogleSignIn, consumeGoogleRedirectIdToken, isGoogleSignInConfigured, setGoogleAuthReturnTo } from '@/app/lib/auth/googleOAuth';
import { firebaseAuth } from '@/app/lib/auth/firebaseRest';
import { stagingAccessControlEnabled } from '@/app/lib/env';
import { getMyStagingAccess, getStagingAccessConfig } from '@/app/lib/stagingAccess/client';

const SESSION_STORAGE_KEY = 'schoolwork_auth_session';

interface FirebaseErrorResponse {
  error?: { message?: string };
}

interface FirebaseAuthResult {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
  displayName?: string;
}

interface FirebaseIdpResult {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
  displayName?: string;
  emailVerified?: boolean;
  providerId?: string;
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

interface StoredSession {
  idToken: string;
  user: AppUser;
}

function readStoredSession(): StoredSession | null {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as StoredSession;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
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
      return 'Too many attempts. Please try again later.';
    case 'INVALID_ID_TOKEN':
      return 'Your session has expired. Please log in again.';
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

interface AuthContextValue {
  user: AppUser | null;
  idToken: string | null;
  stagingAccess: StagingAccessUser | null;
  isStagingAccessControlEnabled: boolean;
  isLoading: boolean;
  isStagingAccessLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (values: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (values: { email: string; firstName: string; lastName: string }) => Promise<{ success: boolean; error?: string }>;
  changePassword: (values: { currentPassword: string; newPassword: string }) => Promise<{ success: boolean; error?: string }>;
  resendVerificationEmail: () => Promise<{ success: boolean; error?: string }>;
  verifyEmailWithToken: (oobCode: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordWithToken: (oobCode: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  isGoogleSignInAvailable: boolean;
  isProcessingGoogleRedirect: boolean;
  googleSignInError: string | null;
  refreshStagingAccess: () => Promise<boolean>;
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

  const loginWithGoogle = async (googleIdToken: string, linkToIdToken?: string, accessControlEnabled = isStagingAccessControlEnabled) => {
    try {
      const postBody = `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`;
      const result: FirebaseIdpResult = await firebaseAuth.signInWithIdp({
        postBody,
        requestUri: window.location.origin,
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
      persistSession(result.idToken, nextUser);
      await refreshStagingAccess(result.idToken, accessControlEnabled);
      console.log('[Auth] Google id_token exchanged for Firebase session');
      return { success: true };
    } catch (err) {
      console.error('[Auth] Google id_token exchange failed:', err);
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  useEffect(() => {
    (async () => {
      const authStartedAt = performance.now();
      console.log('[Auth] Mount: checking for Firebase auth redirect result in URL');
      let accessControlEnabled = stagingAccessControlEnabled;
      try {
        const stagingConfig = await getStagingAccessConfig();
        accessControlEnabled = stagingConfig.enabled;
        setIsStagingAccessControlEnabled(stagingConfig.enabled);
      } catch {
        setIsStagingAccessControlEnabled(stagingAccessControlEnabled);
      }
      const googleIdToken = consumeGoogleRedirectIdToken();

      if (googleIdToken) {
        console.log('[Auth] Found Google id_token from local OAuth redirect');
        setIsProcessingGoogleRedirect(true);
        const storedSession = readStoredSession();
        const result = await loginWithGoogle(googleIdToken, storedSession?.idToken, accessControlEnabled);
        if (!result.success) {
          setGoogleSignInError(result.error ?? 'Failed to complete sign-in. Please try again.');
          console.error('[Auth] Google redirect sign-in failed:', result.error);
        }
        if (result.success) {
          console.log('[Auth] Google redirect sign-in completed');
        }
        setIsProcessingGoogleRedirect(false);
        setIsLoading(false);
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
            persistSession(sessionToken, mapFirebaseUser(freshUser));
            await refreshStagingAccess(sessionToken, accessControlEnabled);
            // Clean URL
            const previousUrl = window.location.href;
            window.history.replaceState(null, '', `${window.location.pathname}#/`);
            window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: previousUrl, newURL: window.location.href }));
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('[Auth] Failed to exchange sessionToken:', err);
          setGoogleSignInError('Failed to complete sign-in. Please try again.');
        }
        setIsProcessingGoogleRedirect(false);
      }

      console.log('[Auth] No sessionToken found, checking for stored session');
      const session = readStoredSession();
      if (session) {
        try {
          setApiAuthToken(session.idToken);
          const lookup: FirebaseLookupResult = await firebaseAuth.lookupUser({ idToken: session.idToken });
          const freshUser = lookup?.users?.[0];
          if (freshUser) {
            persistSession(session.idToken, mapFirebaseUser(freshUser));
            await refreshStagingAccess(session.idToken, accessControlEnabled);
          } else {
            setApiAuthToken(null);
            localStorage.removeItem(SESSION_STORAGE_KEY);
          }
        } catch {
          setApiAuthToken(null);
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
      setIsLoading(false);
      console.log(`[Auth] Bootstrap completed in ${Math.round(performance.now() - authStartedAt)}ms`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildContinueUrl = (route: 'verify-email' | 'reset-password'): string => {
    // Points back to our app's own page. NOTE: for Firebase to actually redirect the
    // oobCode to this app (instead of Firebase's default hosted handler), the project's
    // Authentication > Templates > "Action URL" must be set to this app's domain.
    return `${window.location.origin}/#/${route}`;
  };

  const persistSession = (nextIdToken: string, nextUser: AppUser) => {
    setIdToken(nextIdToken);
    setApiAuthToken(nextIdToken);
    setUser(nextUser);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ idToken: nextIdToken, user: nextUser } as StoredSession));
  };

  const login = async (email: string, password: string) => {
    try {
      const result: FirebaseAuthResult = await firebaseAuth.signIn({ email, password });
      const lookup: FirebaseLookupResult = await firebaseAuth.lookupUser({ idToken: result.idToken });
      const freshUser = lookup?.users?.[0];
      if (!freshUser) {
        return { success: false, error: 'Could not log in. Please try again.' };
      }
      persistSession(result.idToken, mapFirebaseUser(freshUser));
      await refreshStagingAccess(result.idToken);
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const signup = async (values: { email: string; password: string; firstName: string; lastName: string }) => {
    try {
      const displayName = `${values.firstName} ${values.lastName}`.trim();
      const result: FirebaseAuthResult = await firebaseAuth.signUp({ email: values.email, password: values.password });
      await firebaseAuth.updateProfile({ idToken: result.idToken, email: values.email, displayName });
      persistSession(result.idToken, {
        id: result.localId,
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        createdAt: new Date().toISOString(),
        emailVerified: false,
        connectedProviders: ['password'],
      });
      await refreshStagingAccess(result.idToken);
      await firebaseAuth.sendOobCode({
        requestType: 'VERIFY_EMAIL',
        idToken: result.idToken,
        continueUrl: buildContinueUrl('verify-email'),
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const logout = () => {
    setUser(null);
    setIdToken(null);
    setStagingAccess(null);
    setApiAuthToken(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
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
      persistSession(result.idToken ?? idToken, nextUser);
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
      await firebaseAuth.signIn({ email: user.email, password: values.currentPassword });
      const result: FirebaseAuthResult = await firebaseAuth.changePassword({ idToken, password: values.newPassword });
      persistSession(result.idToken ?? idToken, user);
      await refreshStagingAccess(result.idToken ?? idToken);
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
      await firebaseAuth.sendOobCode({
        requestType: 'VERIFY_EMAIL',
        idToken,
        continueUrl: buildContinueUrl('verify-email'),
      });
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
          persistSession(idToken, mapFirebaseUser(freshUser));
        }
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyFirebaseError(extractErrorCode(err)) };
    }
  };

  const requestPasswordReset = async (email: string) => {
    try {
      await firebaseAuth.sendOobCode({
        requestType: 'PASSWORD_RESET',
        email: email.trim().toLowerCase(),
        continueUrl: buildContinueUrl('reset-password'),
      });
      return { success: true };
    } catch {
      // Always report success to avoid revealing whether an email is registered.
      return { success: true };
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

  const signInWithGoogle = async () => {
    console.log('[Auth] ========== signInWithGoogle() called ==========');
    console.log('[Auth] Current URL:', window.location.href);
    console.log('[Auth] isGoogleSignInAvailable:', isGoogleSignInConfigured());
    setGoogleSignInError(null);
    setIsProcessingGoogleRedirect(true);
    try {
      console.log('[Auth] Calling startGoogleSignIn()...');
      setGoogleAuthReturnTo(user ? '/account' : '/');
      const { idToken: googleIdToken } = await startGoogleSignIn();
      console.log('[Auth] ========== startGoogleSignIn() completed successfully ==========');
      console.log('[Auth] Received google idToken, exchanging for Firebase session');
      const result = await loginWithGoogle(googleIdToken, idToken ?? undefined);
      console.log('[Auth] Firebase exchange result:', result.success ? 'SUCCESS' : 'FAILED - ' + result.error);
      if (!result.success) {
        setGoogleSignInError(result.error ?? 'Unable to sign in with Google.');
      }
      return result;
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'POPUP_BLOCKED'
          ? 'Please allow popups for this site to sign in with Google.'
          : err instanceof Error
            ? `Google sign-in failed: ${err.message}`
            : 'Google sign-in was cancelled.';
      console.error('[Auth] ========== Google sign-in FAILED ==========');
      console.error('[Auth] Error:', err);
      console.error('[Auth] Error message:', message);
      setGoogleSignInError(message);
      return { success: false, error: message };
    } finally {
      setIsProcessingGoogleRedirect(false);
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
      isGoogleSignInAvailable: isGoogleSignInConfigured(),
      isProcessingGoogleRedirect,
      googleSignInError,
      refreshStagingAccess: () => refreshStagingAccess(),
    }),
    [user, idToken, stagingAccess, isStagingAccessControlEnabled, isLoading, isStagingAccessLoading, isProcessingGoogleRedirect, googleSignInError]
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
