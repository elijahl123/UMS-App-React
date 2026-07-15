import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadGoogleOAuth(redirectUri = '') {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_REDIRECT_URI', redirectUri);
  return import('@/app/lib/auth/googleOAuth');
}

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Google OAuth helper', () => {
  it('defaults the web redirect URI to the current origin', async () => {
    const { getGoogleOAuthRedirectUri, getGoogleOAuthRequestUri } = await loadGoogleOAuth('');

    expect(getGoogleOAuthRedirectUri()).toBe(window.location.origin);
    expect(getGoogleOAuthRequestUri()).toBe(window.location.origin);
  });

  it('uses VITE_GOOGLE_REDIRECT_URI when configured for native builds', async () => {
    const redirectUri = 'https://app.untitledmanagementsoftware.com/oauth/google/callback';
    const { getGoogleOAuthRedirectUri, getGoogleOAuthRequestUri } = await loadGoogleOAuth(redirectUri);

    expect(getGoogleOAuthRedirectUri()).toBe(redirectUri);
    expect(getGoogleOAuthRequestUri()).toBe(redirectUri);
  });

  it('parses an id token from the current web hash and restores the stored route', async () => {
    const { consumeGoogleRedirectIdToken, setGoogleAuthReturnTo } = await loadGoogleOAuth('');
    setGoogleAuthReturnTo('/account');
    window.location.hash = '#id_token=web-id-token&state=abc';

    expect(consumeGoogleRedirectIdToken()).toBe('web-id-token');
    expect(window.location.hash).toBe('#/account');
  });

  it('parses an id token from an injected native callback URL without replacing the current hash', async () => {
    const { consumeGoogleRedirectIdToken, consumeGoogleRedirectUrl, extractGoogleRedirectIdToken, setGoogleAuthReturnTo } =
      await loadGoogleOAuth('');
    const callbackUrl = 'https://app.untitledmanagementsoftware.com/oauth/google/callback#id_token=native-id-token&state=abc';
    window.location.hash = '#/login';
    setGoogleAuthReturnTo('/account');

    expect(extractGoogleRedirectIdToken(callbackUrl)).toBe('native-id-token');
    expect(consumeGoogleRedirectUrl(callbackUrl)).toBe('native-id-token');
    expect(window.location.hash).toBe('#/login');
    expect(consumeGoogleRedirectIdToken(callbackUrl)).toBe('native-id-token');
  });
});
