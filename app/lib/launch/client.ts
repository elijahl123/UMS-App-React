import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';
import { getLaunchAttribution } from './attribution';

export async function joinLaunchWaitlist(params: {
  email: string;
  list: 'ucd_incoming' | 'ios';
  consent: boolean;
  marketingConsent: boolean;
}) {
  const attribution = getLaunchAttribution() ?? { source: 'ucd_landing' };
  const response = await apiFetch('/launch/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, ...attribution, launchSession: attribution.launchSession }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw payload ?? { error: { message: 'WAITLIST_REQUEST_FAILED' } };
  return payload as { status: 'pending_confirmation' };
}

export function trackProductEvent(
  event: string,
  properties?: Record<string, string | number | boolean>
): Promise<void> {
  const attribution = getLaunchAttribution() ?? {};
  return apiFetch('/telemetry/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
    body: JSON.stringify({
      event,
      occurredAt: new Date().toISOString(),
      page: 'app',
      ...attribution,
      launchSession: attribution.launchSession,
      properties,
    }),
  }).then((response) => {
    if (!response.ok) throw new Error('EVENT_RECORD_FAILED');
  }).catch(() => undefined);
}
