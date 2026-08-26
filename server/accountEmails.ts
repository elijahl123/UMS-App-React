import { pool } from './db';

// All email addresses ever associated with this account (primary + verified
// secondary), independent of any single Firebase ID token. Used wherever we
// need the full account-deletion / data-export scope for a user.
export async function getAccountEmails(userId: string): Promise<string[]> {
  const result = await pool.query<{ email: string }>(
    `
      SELECT email FROM account_primary_emails WHERE firebase_uid = $1
      UNION
      SELECT email FROM account_email_addresses WHERE firebase_uid = $1;
    `,
    [userId]
  );
  return result.rows.map((row) => row.email);
}
