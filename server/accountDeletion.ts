import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
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

async function deleteRows(client: PoolClient, userId: string, emails: string[], recordTombstone = true) {
  const normalizedEmails = emails.map((email) => email.trim().toLowerCase()).filter(Boolean);
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

  if (recordTombstone) {
    await client.query(
      `INSERT INTO deletion_tombstones (user_id_hash, email_hashes) VALUES ($1, $2::text[]);`,
      [digest(userId), normalizedEmails.map(digest)]
    );
  }

  await client.query('DELETE FROM course_links WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM notes WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM events WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM courses WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM google_calendar_sync_runs WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM google_calendar_connections WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM product_events WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM campaign_attributions WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM product_onboarding WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM launch_onboarding WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM access_entitlements WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM account_email_addresses WHERE firebase_uid = $1;', [userId]);
  await client.query('DELETE FROM account_primary_emails WHERE firebase_uid = $1;', [userId]);
  await client.query('DELETE FROM user_subscriptions WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM staging_access_grants WHERE firebase_uid = $1 OR lower(email) = ANY($2::text[]);', [
    userId,
    normalizedEmails,
  ]);

  if (normalizedEmails.length > 0) {
    await client.query('DELETE FROM waitlist_subscriptions WHERE lower(email) = ANY($1::text[]);', [normalizedEmails]);
    await client.query('DELETE FROM users WHERE lower(email) = ANY($1::text[]);', [normalizedEmails]);
  }
}

export async function reapplyDeletionTombstones() {
  const digestUserId = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
  const digestEmail = (value: string) => crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  const tombstones = await pool.query<{ user_id_hash: string; email_hashes: string[] }>(
    `SELECT user_id_hash, email_hashes FROM deletion_tombstones WHERE purge_after > NOW()`
  );
  const userHashes = new Set(tombstones.rows.map((row) => row.user_id_hash));
  const emailHashes = new Set(tombstones.rows.flatMap((row) => row.email_hashes ?? []));
  if (userHashes.size === 0 && emailHashes.size === 0) return { usersPurged: 0, emailsPurged: 0 };

  const [userCandidates, emailCandidates] = await Promise.all([
    pool.query<{ user_id: string }>(`
      SELECT DISTINCT user_id FROM (
        SELECT user_id FROM courses
        UNION SELECT user_id FROM notes
        UNION SELECT user_id FROM events
        UNION SELECT user_id FROM google_calendar_connections
        UNION SELECT user_id FROM user_subscriptions
        UNION SELECT user_id FROM access_entitlements
        UNION SELECT user_id FROM product_onboarding
        UNION SELECT user_id FROM launch_onboarding
        UNION SELECT user_id FROM campaign_attributions
        UNION SELECT user_id FROM product_events WHERE user_id IS NOT NULL
        UNION SELECT firebase_uid AS user_id FROM account_primary_emails
        UNION SELECT firebase_uid AS user_id FROM account_email_addresses
      ) candidates WHERE user_id IS NOT NULL;
    `),
    pool.query<{ email: string; user_id: string | null }>(`
      SELECT lower(email) AS email, firebase_uid AS user_id FROM account_primary_emails
      UNION SELECT lower(email), firebase_uid FROM account_email_addresses
      UNION SELECT lower(email), NULL::text FROM users
      UNION SELECT lower(email), NULL::text FROM waitlist_subscriptions;
    `),
  ]);

  const matchedUserIds = new Set(
    userCandidates.rows.filter((row) => userHashes.has(digestUserId(row.user_id))).map((row) => row.user_id)
  );
  const matchedEmails = new Set<string>();
  for (const row of emailCandidates.rows) {
    if (!emailHashes.has(digestEmail(row.email))) continue;
    matchedEmails.add(row.email);
    if (row.user_id) matchedUserIds.add(row.user_id);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const userId of matchedUserIds) {
      const relatedEmails = await client.query<{ email: string }>(`
        SELECT lower(email) AS email FROM account_primary_emails WHERE firebase_uid = $1
        UNION SELECT lower(email) FROM account_email_addresses WHERE firebase_uid = $1;
      `, [userId]);
      const emails = relatedEmails.rows.map((row) => row.email);
      emails.forEach((email) => matchedEmails.add(email));
      await deleteRows(client, userId, emails, false);
    }
    if (matchedEmails.size > 0) {
      const emails = [...matchedEmails];
      await client.query(`DELETE FROM waitlist_subscriptions WHERE lower(email) = ANY($1::text[])`, [emails]);
      await client.query(`DELETE FROM users WHERE lower(email) = ANY($1::text[])`, [emails]);
    }
    await client.query('COMMIT');
    return { usersPurged: matchedUserIds.size, emailsPurged: matchedEmails.size };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
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
