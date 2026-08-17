import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Firebase REST auth', () => {
  it('exchanges a refresh token through the Secure Token API', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'firebase web key');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id_token: 'fresh-id-token',
      refresh_token: 'rotated-refresh-token',
      expires_in: '3600',
      user_id: 'user-1',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { firebaseAuth } = await import('@/app/lib/auth/firebaseRest');

    await expect(firebaseAuth.refreshToken('stored refresh token')).resolves.toEqual(expect.objectContaining({
      id_token: 'fresh-id-token',
      refresh_token: 'rotated-refresh-token',
    }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as Parameters<typeof fetch>;
    expect(url).toBe('https://securetoken.googleapis.com/v1/token?key=firebase%20web%20key');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(String(init?.body)).toBe('grant_type=refresh_token&refresh_token=stored+refresh+token');
  });

  it('surfaces Firebase refresh errors for session invalidation decisions', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'firebase-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'INVALID_REFRESH_TOKEN' } }),
      { status: 400 }
    )));
    const { firebaseAuth } = await import('@/app/lib/auth/firebaseRest');

    await expect(firebaseAuth.refreshToken('invalid-token')).rejects.toEqual({
      error: { message: 'INVALID_REFRESH_TOKEN' },
    });
  });
});
