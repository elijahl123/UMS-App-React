import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadApiClient(apiBaseUrl = '') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  return import('@/app/lib/api/client');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('API client', () => {
  it('uses same-origin /api when VITE_API_BASE_URL is empty', async () => {
    const { apiUrl } = await loadApiClient('');

    expect(apiUrl('/actions/listCourses')).toBe('/api/actions/listCourses');
  });

  it('joins a configured API base URL without duplicate slashes', async () => {
    const { apiUrl } = await loadApiClient('https://app.untitledmanagementsoftware.com/api/');

    expect(apiUrl('/billing/config')).toBe('https://app.untitledmanagementsoftware.com/api/billing/config');
  });

  it('preserves query strings while building API URLs', async () => {
    const { apiUrl } = await loadApiClient('https://app.untitledmanagementsoftware.com/api');

    expect(apiUrl('/billing/status?userId=user_123')).toBe(
      'https://app.untitledmanagementsoftware.com/api/billing/status?userId=user_123'
    );
  });

  it('routes apiFetch through the configured API base URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiFetch } = await loadApiClient('https://app.untitledmanagementsoftware.com/api');

    await apiFetch('/staging-access/config', { headers: { Accept: 'application/json' } });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.untitledmanagementsoftware.com/api/staging-access/config',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
  });
});
