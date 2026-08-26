import { pool } from './db';

// Bump this when the wording of any consent copy below changes, so historical
// consent_events rows stay tied to the exact text a user agreed to.
export const CONSENT_COPY_VERSION = '2026-08-launch-v1';

export const WAITLIST_LIST_CONSENT_COPY: Record<'ucd_incoming' | 'palomar_incoming' | 'ios', string> = {
  ucd_incoming: 'I agree to receive UCD launch updates from UMS. I can unsubscribe at any time.',
  palomar_incoming: 'I agree to receive Palomar launch updates from UMS. I can unsubscribe at any time.',
  ios: 'I agree to receive iPhone app updates from UMS. I can unsubscribe at any time.',
};

export const WAITLIST_MARKETING_CONSENT_COPY =
  'Also send me occasional general UMS product news (optional).';

export const EU_SUBSCRIPTION_WITHDRAWAL_WAIVER_COPY =
  'I want immediate access to my UMS subscription and understand I am giving up my 14-day right ' +
  'to withdraw once my subscription starts.';

export type ConsentType =
  | 'waitlist_list_consent'
  | 'waitlist_marketing_consent'
  | 'waitlist_withdrawn'
  | 'eu_subscription_withdrawal_waiver';

export async function recordConsentEvent(params: {
  userId?: string | null;
  email: string;
  consentType: ConsentType;
  copy: string;
  granted: boolean;
  metadata?: Record<string, unknown>;
}) {
  await pool.query(
    `
      INSERT INTO consent_events (user_id, email, consent_type, consent_version, granted, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb);
    `,
    [
      params.userId ?? null,
      params.email.trim().toLowerCase(),
      params.consentType,
      CONSENT_COPY_VERSION,
      params.granted,
      JSON.stringify({ copy: params.copy, ...(params.metadata ?? {}) }),
    ]
  );
}
