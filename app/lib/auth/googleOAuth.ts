import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

// Web Google Sign-In uses the local Vite origin as its redirect URI. Add
// http://localhost:5173 to the web OAuth client's authorized redirect URIs
// and JavaScript origins while running the standalone dev app.
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? 'YOUR_GOOGLE_OAUTH_CLIENT_ID';
const GOOGLE_IOS_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? '546069511882-t2jlp0ek3g80l9s311d2b4n7i2jb01ks.apps.googleusercontent.com';
const GOOGLE_IOS_REVERSED_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_IOS_REVERSED_CLIENT_ID ?? 'com.googleusercontent.apps.546069511882-t2jlp0ek3g80l9s311d2b4n7i2jb01ks';
const GOOGLE_REDIRECT_URI = (import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? '').trim();
const GOOGLE_AUTH_RETURN_TO_KEY = 'schoolwork_google_auth_return_to';
const GOOGLE_OAUTH_TIMEOUT_MS = 15000;

function isGoogleSignInConfigured(): boolean {
  const clientId = getGoogleOAuthClientId();
  const configured = !clientId.startsWith('YOUR_GOOGLE_OAUTH_CLIENT_ID');
  console.log('[GoogleOAuth] isGoogleSignInConfigured():', configured);
  return configured;
}

interface GoogleRedirectResult {
  idToken: string;
}

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

function isNativeGoogleOAuthFlow(): boolean {
  return Capacitor.isNativePlatform() || (typeof window !== 'undefined' && window.location.protocol === 'capacitor:');
}

function getGoogleOAuthClientId(): string {
  return isNativeGoogleOAuthFlow() && Capacitor.getPlatform() === 'ios' ? GOOGLE_IOS_CLIENT_ID : GOOGLE_WEB_CLIENT_ID;
}

function getGoogleOAuthRedirectUri(): string {
  if (isNativeGoogleOAuthFlow() && Capacitor.getPlatform() === 'ios') {
    return `${GOOGLE_IOS_REVERSED_CLIENT_ID}:/oauth2redirect`;
  }

  return GOOGLE_REDIRECT_URI || window.location.origin;
}

function getGoogleOAuthRequestUri(): string {
  if (isNativeGoogleOAuthFlow() && Capacitor.getPlatform() === 'ios') {
    return 'http://localhost';
  }

  return getGoogleOAuthRedirectUri();
}

// Opens Google's OAuth endpoint using Firebase's redirect URI for its auth handler.
// This will redirect the browser through Google's OAuth flow, then back to Firebase's
// handler, which will eventually redirect back to this app.
function startGoogleSignIn(): Promise<GoogleRedirectResult> {
  console.log('[GoogleOAuth] ========== startGoogleSignIn() called ==========');

  if (isNativeGoogleOAuthFlow() && Capacitor.getPlatform() === 'ios') {
    return startNativeGoogleSignIn();
  }

  const redirectUri = getGoogleOAuthRedirectUri();
  const nonce = generateNonce();
  const state = encodeState({ nonce });
  
  const params = new URLSearchParams({
    client_id: getGoogleOAuthClientId(),
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log('[GoogleOAuth] Redirecting to Google OAuth:');
  console.log('  - client_id:', getGoogleOAuthClientId());
  console.log('  - redirect_uri:', redirectUri);
  console.log('  - nonce:', nonce);
  console.log('  - Full URL:', authUrl);

  window.location.assign(authUrl);
  
  return new Promise(() => {
    // Never resolves because the page redirects away.
  });
}

async function startNativeGoogleSignIn(): Promise<GoogleRedirectResult> {
  const redirectUri = getGoogleOAuthRedirectUri();
  const nonce = generateNonce();
  const state = encodeState({ nonce });
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: getGoogleOAuthClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log('[GoogleOAuth] Opening native Google OAuth flow:');
  console.log('  - client_id:', getGoogleOAuthClientId());
  console.log('  - redirect_uri:', redirectUri);

  let appUrlOpenListener: PluginListenerHandle | undefined;
  let browserFinishedListener: PluginListenerHandle | undefined;

  return new Promise<GoogleRedirectResult>((resolve, reject) => {
    const cleanup = async () => {
      await Promise.all([
        appUrlOpenListener?.remove().catch(() => undefined),
        browserFinishedListener?.remove().catch(() => undefined),
      ]);
      await Browser.close().catch(() => undefined);
    };

    const fail = async (error: unknown) => {
      await cleanup();
      reject(error);
    };

    const complete = async (callbackUrl: string) => {
      if (!isGoogleOAuthCallbackUrl(callbackUrl)) {
        return;
      }

      try {
        const callback = parseGoogleOAuthCallbackUrl(callbackUrl);
        if (callback.state !== state) {
          throw new Error('INVALID_GOOGLE_OAUTH_STATE');
        }

        const idToken = await exchangeGoogleOAuthCodeForIdToken({
          code: callback.code,
          codeVerifier,
          redirectUri,
        });
        await cleanup();
        resolve({ idToken });
      } catch (error) {
        await fail(error);
      }
    };

    void App.addListener('appUrlOpen', (event) => {
      void complete(event.url);
    })
      .then((listener) => {
        appUrlOpenListener = listener;
        return Browser.addListener('browserFinished', () => {
          void fail(new Error('GOOGLE_SIGN_IN_CANCELLED'));
        });
      })
      .then((listener) => {
        browserFinishedListener = listener;
        return Browser.open({ url: authUrl, presentationStyle: 'fullscreen' });
      })
      .catch((error) => {
        void fail(error);
      });
  });
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let value = '';
  bytes.forEach((byte) => {
    value += String.fromCharCode(byte);
  });

  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeState(data: Record<string, string>): string {
  return btoa(JSON.stringify(data));
}

function replaceHashRoute(nextHashRoute: string) {
  const previousUrl = window.location.href;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search || ''}#${nextHashRoute}`);
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: previousUrl, newURL: window.location.href }));
}

function setGoogleAuthReturnTo(nextHashRoute: string) {
  sessionStorage.setItem(GOOGLE_AUTH_RETURN_TO_KEY, nextHashRoute);
}

function extractGoogleRedirectIdToken(redirectUrl: string): string | null {
  const url = new URL(redirectUrl, window.location.origin);
  const rawHash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hash = rawHash.startsWith('/') ? rawHash.slice(1) : rawHash;
  const hashParams = new URLSearchParams(hash);
  const hashIdToken = hashParams.get('id_token');

  return hashIdToken ?? url.searchParams.get('id_token');
}

function consumeGoogleRedirectIdToken(redirectUrl?: string): string | null {
  const idToken = extractGoogleRedirectIdToken(redirectUrl ?? window.location.href);
  if (idToken) {
    const returnTo = sessionStorage.getItem(GOOGLE_AUTH_RETURN_TO_KEY) ?? '/';
    sessionStorage.removeItem(GOOGLE_AUTH_RETURN_TO_KEY);
    if (!redirectUrl) {
      replaceHashRoute(returnTo);
    }
  }

  return idToken;
}

function consumeGoogleRedirectUrl(redirectUrl: string): string | null {
  return consumeGoogleRedirectIdToken(redirectUrl);
}

function isGoogleOAuthCallbackUrl(callbackUrl: string): boolean {
  return callbackUrl.toLowerCase().startsWith(getGoogleOAuthRedirectUri().toLowerCase());
}

function parseGoogleOAuthCallbackUrl(callbackUrl: string): { code: string; state: string } {
  const url = new URL(callbackUrl);
  const error = url.searchParams.get('error');
  if (error) {
    throw new Error(url.searchParams.get('error_description') ?? error);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    throw new Error('MISSING_GOOGLE_OAUTH_CODE');
  }

  return { code, state };
}

async function exchangeGoogleOAuthCodeForIdToken(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<string> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), GOOGLE_OAUTH_TIMEOUT_MS);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getGoogleOAuthClientId(),
      code: params.code,
      code_verifier: params.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: params.redirectUri,
    }),
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeoutId));

  const payload = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!response.ok || !payload?.id_token) {
    throw new Error(payload?.error_description ?? payload?.error ?? 'GOOGLE_TOKEN_EXCHANGE_FAILED');
  }

  return payload.id_token;
}

export {
  consumeGoogleRedirectIdToken,
  consumeGoogleRedirectUrl,
  extractGoogleRedirectIdToken,
  getGoogleOAuthClientId,
  getGoogleOAuthRedirectUri,
  getGoogleOAuthRequestUri,
  isGoogleSignInConfigured,
  setGoogleAuthReturnTo,
  startGoogleSignIn,
};
