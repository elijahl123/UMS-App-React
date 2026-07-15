let authToken: string | null = null;

export function getApiBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  return configuredBaseUrl || '/api';
}

export function apiUrl(path = ''): string {
  const normalizedPath = path.replace(/^\/+/, '');
  const baseUrl = getApiBaseUrl();
  return normalizedPath ? `${baseUrl}/${normalizedPath}` : baseUrl;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

export function getApiAuthHeaders(): HeadersInit {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export async function callAction<TResult = unknown>(name: string, params?: Record<string, unknown>): Promise<TResult> {
  const response = await apiFetch(`/actions/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
    body: JSON.stringify(params ?? {}),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'REQUEST_FAILED' } };
  }

  return payload as TResult;
}
