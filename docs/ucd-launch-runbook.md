# UCD autumn 2026 launch runbook

This runbook is the operational handoff for the UCD campaign. The canonical public URL is `https://untitledmanagementsoftware.com/ucd/`; `https://app.untitledmanagementsoftware.com` hosts signup and the authenticated product.

## Fixed schedule

- Primary launch: **7 September 2026 at 09:00 Europe/Dublin** (`08:00Z`).
- Go/no-go review: **4 September 2026 at 16:00 Europe/Dublin** (`15:00Z`).
- Fallback launch: **14 September 2026 at 09:00 Europe/Dublin** (`08:00Z`).
- UCD full-access boundary (exclusive): `2027-01-18T00:00:00Z`.
- Read-only/export grace boundary (exclusive): `2027-02-01T00:00:00Z`.
- Waitlist retention deadline: delete by `2027-04-01T00:00:00Z`.

The official dates supplied for the launch show orientation from 31 August through 4 September, teaching beginning 7 September, and the autumn trimester ending 17 January 2027.

## Required configuration

Set the equivalent values in the staging GitHub environment first, using `https://dev.untitledmanagementsoftware.com` for `APP_ORIGIN`, `APP_BASE_URL`, and the OAuth callback. Set the production values below before promotion, but leave `UCD_ACCESS_ENABLED=false` in production until the launch time.

```dotenv
APP_ORIGINS=https://app.untitledmanagementsoftware.com,https://untitledmanagementsoftware.com,capacitor://localhost,http://localhost
APP_BASE_URL=https://app.untitledmanagementsoftware.com
MARKETING_ORIGIN=https://untitledmanagementsoftware.com
UCD_ACCESS_ENABLED=true
UCD_ACCESS_DOMAIN=ucdconnect.ie
UCD_ACCESS_END_AT=2027-01-18T00:00:00Z
UCD_ACCESS_GRACE_END_AT=2027-02-01T00:00:00Z
SENDGRID_UCD_LAUNCH_UNSUBSCRIBE_GROUP_ID=261009
GOOGLE_CALENDAR_REDIRECT_URI=https://app.untitledmanagementsoftware.com/api/google-calendar/oauth/callback
```

For staging, use its existing app URL and the exact redirect `https://dev.untitledmanagementsoftware.com/api/google-calendar/oauth/callback`. Keep secrets only in GitHub environments or the server environment; never put their values in the repository or launch notes.

Confirm in both Firebase projects that Email/Password and Google authentication remain enabled. Confirm the three authorized domains already approved by the operator. In Google Cloud, confirm the Calendar client includes the owned-event write, shared-event read-only, and CalendarList read-only scopes used by the app.

## Deployment order

1. Deploy the app/API build to staging. The deployment runs the additive SQL migration `1783900000_add_ucd_launch_foundations.sql` before replacing the API and web containers.
2. Verify staging health and inspect migration logs. Do not continue if any table, constraint, or index statement fails.
3. Complete the beta matrix below using test accounts and redacted fixtures only.
4. Deploy the app/API to production first with `UCD_ACCESS_ENABLED=false`.
5. Verify the production health endpoint, auth, ordinary trial, Stripe, account export, and launch API preflight.
6. Deploy the `UMS Landing` repository. This activates the updated CTA attribution, session-only launch ID, waitlist double opt-in, and result messages.
7. At the confirmed launch time, set production `UCD_ACCESS_ENABLED=true`, restart the API, and reconcile one controlled verified-UCD account.

The migration is additive. If the application must be rolled back, set `UCD_ACCESS_ENABLED=false` first and restore the previous application image; leave the new tables and columns in place until a reviewed cleanup migration exists.

If a database backup is restored, keep the restored database off public traffic until deletion tombstones have been reapplied. Before starting the restore, export all unexpired rows from `deletion_tombstones` in the current production database to an encrypted operator-only file outside the repository. After restoring and running migrations, import those rows into the restored database and run `npm run reapply-deletion-tombstones:production`. Confirm the command reports the restored records it purged, then destroy the temporary export. Do not restore a backup older than the 30-day backup-retention boundary.

## Preflight and smoke checks

The expected marketing-origin preflight must return a successful status and `Access-Control-Allow-Origin: https://untitledmanagementsoftware.com`.

```sh
curl -i -X OPTIONS 'https://app.untitledmanagementsoftware.com/api/launch/events' \
  -H 'Origin: https://untitledmanagementsoftware.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'

curl -i -X POST 'https://app.untitledmanagementsoftware.com/api/launch/events' \
  -H 'Origin: https://untitledmanagementsoftware.com' \
  -H 'Content-Type: application/json' \
  --data '{"event":"landing_cta_clicked","occurredAt":"REPLACE_WITH_CURRENT_ISO_TIME","page":"ucd","source":"ucd_landing","launchSession":"controlled-smoke-test"}'
```

Use a controlled inbox for the waitlist test. The POST must answer `202 pending_confirmation`; the page must say “Check your inbox to confirm your place.” The 48-hour confirmation link must work once, then redirect invalid on reuse. Test each list independently, confirm the optional general-marketing box is unchecked by default, and verify unsubscribe redirects to `/ucd/?waitlist=unsubscribed`.

## Beta matrix

Pass all of the following before the go/no-go review:

- QR/campaign link on iPhone Safari, Android Chrome, and desktop preserves valid `campaign`, `ambassador`, `society`, `referral`, and `launch_session` values through signup. Invalid or overlength attribution is absent, not rewritten.
- A verified primary `ucdconnect.ie` account receives `ucd_autumn_2026`; an unverified password account does not until verification.
- A verified UCD secondary email grants the same entitlement to the existing account and does not start a trial.
- Case variants qualify. Subdomains, lookalikes, and suffix attacks do not.
- A personal email in the UCD journey can request only the incoming-student waitlist and receives neither UCD access nor an app trial.
- A controlled existing paid account keeps full access, receives cancellation at current period end, and receives no refund. Simulate a failed Stripe update, confirm the warning is nonblocking, and confirm a later status request retries it.
- At the exact entitlement end, writes return `403 READ_ONLY_GRACE`; reads, account management, billing, and ZIP export continue. At the grace end, ordinary billing is required. A current paid subscription overrides either phase.
- “UCD Timetable” is highlighted but not selected automatically. Preview occurs before initial sync. Recognized course-code events become academic classes; unmatched entries remain ordinary events and can be associated manually.
- The redacted Calendar fixture includes recurring, all-day, timed, cancelled, updated, recognized, and unmatched entries.
- The Brightspace agenda fixture exercises Due, Availability Ends, Available, resources, solutions, projects, tests, exact duplicates, ambiguous duplicates, and availability windows. The PDF stays in the browser and every selected row is correctable before save.
- Import success is emitted only when at least three reviewed items are saved. Calendar connection is measured separately.
- Exam, assignment, and project plans schedule in 15-minute units on chosen weekdays, place rounding remainder on earlier days, show every unscheduled minute, and require acknowledgment for a partial plan. A due-today target and explicit recalculation both behave correctly.
- Account export opens as a ZIP and contains readable courses, assignments, events, classes, plans, plan tasks, and sanitized notes without IDs, credentials, tokens, or telemetry.
- Network inspection shows no third-party analytics or advertising requests and no Google Fonts request. Record any Cloudflare security cookie as strictly necessary.
- Test campus Wi-Fi and mobile data separately. Test installed PWA launch as well as a normal browser tab.

## Go/no-go gate

At 16:00 Europe/Dublin on 4 September, record a named owner and evidence for each beta item. Launch on 7 September only if:

- migrations, backups, auth, email, OAuth, Stripe, CORS, read-only enforcement, and export all pass;
- reviewed import accuracy is at least 90%, using corrected and rejected rows in the denominator;
- no high-severity privacy, security, data-loss, or account-access defect remains;
- the privacy policy and terms have written Irish-counsel approval; and
- launch-day support and rollback owners are confirmed.

If any gate fails, keep `UCD_ACCESS_ENABLED=false`, publish no launch announcement, and move the launch to 14 September. The public landing page may remain available for waitlist collection only if its API, consent, policy, and unsubscribe checks pass.

## Operator-owned items that code cannot supply

Before production launch, Elijah Lopez must:

- obtain and publish a professional service address;
- obtain Irish legal review of the minimum age, privacy policy, terms, international processing, and unincorporated-operator wording;
- provide the redacted UCD Timetable fixture and the final campaign-code roster;
- provide final screenshots, the real demo video (if a video CTA is enabled), and signed testimonial releases;
- provide the device/tester roster, campus-promotion permissions, and named launch-day support coverage;
- take and verify an explicit production database backup immediately before promotion; and
- keep secrets, unredacted student records, private calendars, and OAuth credentials out of chat and source control.

The launch claims are fixed as:

> UMS does not send your schoolwork to generative-AI models or large-language-model services.

> Independent student app. Not affiliated with or endorsed by UCD, D2L, or Brightspace.
