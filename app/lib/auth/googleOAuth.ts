// Google Sign-In uses the local Vite origin as its redirect URI. Add
// http://localhost:5173 to the Google OAuth client's authorized redirect URIs
// and JavaScript origins while running the standalone dev app.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? 'YOUR_GOOGLE_OAUTH_CLIENT_ID';
const GOOGLE_REDIRECT_URI = (import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? '').trim();
const GOOGLE_AUTH_RETURN_TO_KEY = 'schoolwork_google_auth_return_to';

function isGoogleSignInConfigured(): boolean {
  const configured = !GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE_OAUTH_CLIENT_ID');
  console.log('[GoogleOAuth] isGoogleSignInConfigured():', configured);
  return configured;
}

interface GoogleRedirectResult {
  idToken: string;
}

function getGoogleOAuthRedirectUri(): string {
  return GOOGLE_REDIRECT_URI || window.location.origin;
}

function getGoogleOAuthRequestUri(): string {
  return getGoogleOAuthRedirectUri();
}

// Opens Google's OAuth endpoint using Firebase's redirect URI for its auth handler.
// This will redirect the browser through Google's OAuth flow, then back to Firebase's
// handler, which will eventually redirect back to this app.
function startGoogleSignIn(): Promise<GoogleRedirectResult> {
  console.log('[GoogleOAuth] ========== startGoogleSignIn() called ==========');
  
  const redirectUri = getGoogleOAuthRedirectUri();
  const nonce = generateNonce();
  const state = encodeState({ nonce });
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log('[GoogleOAuth] Redirecting to Google OAuth:');
  console.log('  - client_id:', GOOGLE_CLIENT_ID);
  console.log('  - redirect_uri:', redirectUri);
  console.log('  - nonce:', nonce);
  console.log('  - Full URL:', authUrl);

  window.location.assign(authUrl);
  
  return new Promise(() => {
    // Never resolves because the page redirects away.
  });
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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

export {
  consumeGoogleRedirectIdToken,
  consumeGoogleRedirectUrl,
  extractGoogleRedirectIdToken,
  getGoogleOAuthRedirectUri,
  getGoogleOAuthRequestUri,
  isGoogleSignInConfigured,
  setGoogleAuthReturnTo,
  startGoogleSignIn,
};
