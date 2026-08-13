import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';

export async function downloadAccountExport(): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60_000);
  const response = await apiFetch('/account/export', {
    headers: getApiAuthHeaders(),
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeout));
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw payload ?? { error: { message: 'ACCOUNT_EXPORT_FAILED' } };
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'ums-export.zip';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
