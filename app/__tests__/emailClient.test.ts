import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('email API client', () => {
  it('requests password reset without an authentication header', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ status: 'accepted' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { requestPasswordResetEmail } = await import('@/app/lib/email/client');

    await expect(requestPasswordResetEmail('student@example.com')).resolves.toEqual({ status: 'accepted' });
    expect(fetchMock).toHaveBeenCalledWith('/api/email/password-reset', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'student@example.com' }),
    }));
    const request = fetchMock.mock.calls[0]![1]!;
    expect(new Headers(request.headers).has('Authorization')).toBe(false);
  });

  it('uses the current Firebase bearer token for verification and surfaces API errors', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'accepted' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'TOO_MANY_REQUESTS' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const [{ setApiAuthToken }, { requestPrimaryEmailVerification }] = await Promise.all([
      import('@/app/lib/api/client'),
      import('@/app/lib/email/client'),
    ]);
    setApiAuthToken('firebase-id-token');

    await expect(requestPrimaryEmailVerification()).resolves.toEqual({ status: 'accepted' });
    const firstRequest = fetchMock.mock.calls[0]![1]!;
    expect(new Headers(firstRequest.headers).get('Authorization')).toBe('Bearer firebase-id-token');
    await expect(requestPrimaryEmailVerification()).rejects.toEqual({ error: { message: 'TOO_MANY_REQUESTS' } });
    setApiAuthToken(null);
  });
});
