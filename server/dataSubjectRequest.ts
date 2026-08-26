// Offline CLI for handling a GDPR data-subject request (access, portability, or
// erasure) for a single email address, within the one-month response window.
//
// Usage:
//   tsx server/dataSubjectRequest.ts export <email> [outDir]
//   tsx server/dataSubjectRequest.ts delete <email> --confirm
//
// `delete` without --confirm runs as a dry run: it reports what would be
// removed without touching the database. There is no HTTP endpoint for this —
// keeping it a locally-run script avoids adding a new network-reachable way
// to export or destroy an arbitrary user's data.
import fs from 'node:fs';
import path from 'node:path';
import { pool } from './db';
import { streamAccountExportZip } from './routes/account';
import { deleteAccountCascade } from './accountDeletion';
import { getAccountEmails } from './accountEmails';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findUserIdForEmail(email: string): Promise<string | null> {
  const result = await pool.query<{ firebase_uid: string }>(
    `
      SELECT firebase_uid FROM account_primary_emails WHERE lower(email) = $1
      UNION
      SELECT firebase_uid FROM account_email_addresses WHERE lower(email) = $1
      LIMIT 1;
    `,
    [email]
  );
  return result.rows[0]?.firebase_uid ?? null;
}

async function exportWaitlistOnlyData(email: string, outDir: string) {
  const [waitlist, consent] = await Promise.all([
    pool.query(`SELECT * FROM waitlist_subscriptions WHERE lower(email) = $1;`, [email]),
    pool.query(`SELECT consent_type, consent_version, granted, occurred_at::text, metadata FROM consent_events WHERE lower(email) = $1 ORDER BY occurred_at;`, [email]),
  ]);
  const outPath = path.join(outDir, `dsr-export-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ email, waitlist: waitlist.rows, consentEvents: consent.rows }, null, 2));
  return outPath;
}

async function runExport(email: string, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  const userId = await findUserIdForEmail(email);
  if (!userId) {
    const outPath = await exportWaitlistOnlyData(email, outDir);
    console.log(`[dsr] no UMS account for ${email}; wrote waitlist/consent-only export to ${outPath}`);
    return;
  }
  const outPath = path.join(outDir, `dsr-export-${userId}-${Date.now()}.zip`);
  await streamAccountExportZip(userId, fs.createWriteStream(outPath));
  console.log(`[dsr] wrote full account export for ${email} (userId ${userId}) to ${outPath}`);
}

async function runDelete(email: string, confirm: boolean) {
  const userId = await findUserIdForEmail(email);
  if (!userId) {
    const waitlist = await pool.query(`SELECT id, list_key FROM waitlist_subscriptions WHERE lower(email) = $1;`, [email]);
    if (waitlist.rows.length === 0) {
      console.log(`[dsr] no UMS account or waitlist record found for ${email}; nothing to delete`);
      return;
    }
    console.log(`[dsr] ${email} has no account, only waitlist record(s): ${waitlist.rows.map((r) => r.list_key).join(', ')}`);
    if (!confirm) {
      console.log('[dsr] dry run only — re-run with --confirm to delete');
      return;
    }
    await pool.query(`DELETE FROM waitlist_subscriptions WHERE lower(email) = $1;`, [email]);
    console.log(`[dsr] deleted waitlist record(s) for ${email}`);
    return;
  }
  const emails = await getAccountEmails(userId);
  console.log(`[dsr] account ${userId} for ${email} also covers: ${emails.join(', ') || '(none)'}`);
  if (!confirm) {
    console.log('[dsr] dry run only — re-run with --confirm to delete this account and all associated data');
    return;
  }
  await deleteAccountCascade({ userId, emails: [email, ...emails] });
  console.log(`[dsr] deleted account ${userId} and all associated data for ${email}`);
}

async function main() {
  const [command, email, third] = process.argv.slice(2);
  if (!command || !email) {
    console.error('Usage: tsx server/dataSubjectRequest.ts export <email> [outDir]');
    console.error('       tsx server/dataSubjectRequest.ts delete <email> --confirm');
    process.exitCode = 1;
    return;
  }
  const normalizedEmail = normalizeEmail(email);
  if (command === 'export') {
    await runExport(normalizedEmail, third ?? '.');
  } else if (command === 'delete') {
    await runDelete(normalizedEmail, third === '--confirm');
  } else {
    console.error(`Unknown command "${command}". Use "export" or "delete".`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[dsr] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
