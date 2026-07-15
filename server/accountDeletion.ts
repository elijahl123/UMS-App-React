import type { PoolClient } from 'pg';
import { getBillingReference, stripeClient } from './billing';
import { pool } from './db';

function isMissingStripeResource(err: unknown): boolean {
  const stripeError = err as { code?: string; statusCode?: number };
  return stripeError.code === 'resource_missing' || stripeError.statusCode === 404;
}

async function deleteStripeBillingForUser(userId: string) {
  const reference = await getBillingReference(userId);
  if (!reference.customerId && !reference.subscriptionId) {
    return;
  }

  const stripe = stripeClient();
  if (reference.subscriptionId) {
    try {
      await stripe.subscriptions.cancel(reference.subscriptionId);
    } catch (err) {
      if (!isMissingStripeResource(err)) {
        throw err;
      }
    }
  }

  if (reference.customerId) {
    try {
      await stripe.customers.del(reference.customerId);
    } catch (err) {
      if (!isMissingStripeResource(err)) {
        throw err;
      }
    }
  }
}

async function deleteRows(client: PoolClient, userId: string, emails: string[]) {
  const normalizedEmails = emails.map((email) => email.trim().toLowerCase()).filter(Boolean);

  await client.query('DELETE FROM course_links WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM notes WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM events WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM courses WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM account_email_addresses WHERE firebase_uid = $1;', [userId]);
  await client.query('DELETE FROM account_primary_emails WHERE firebase_uid = $1;', [userId]);
  await client.query('DELETE FROM user_subscriptions WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM staging_access_grants WHERE firebase_uid = $1 OR lower(email) = ANY($2::text[]);', [
    userId,
    normalizedEmails,
  ]);

  if (normalizedEmails.length > 0) {
    await client.query('DELETE FROM users WHERE lower(email) = ANY($1::text[]);', [normalizedEmails]);
  }
}

export async function deleteAccountCascade(params: { userId: string; emails: string[] }) {
  await deleteStripeBillingForUser(params.userId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await deleteRows(client, params.userId, params.emails);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
