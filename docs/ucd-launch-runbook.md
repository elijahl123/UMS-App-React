# UCD + Palomar autumn 2026 launch runbook

This is the joint operational handoff for `https://untitledmanagementsoftware.com/ucd/` and `https://untitledmanagementsoftware.com/palomar/`. Both programs launch or fall back together.

## Fixed schedule and access boundaries

- Primary launch: **7 September 2026 at 08:00 UTC** — 09:00 Dublin and 01:00 California.
- Joint go/no-go review: **4 September 2026 at 15:00 UTC**.
- Joint fallback: **14 September 2026 at 08:00 UTC**.
- Full-access boundary, exclusive: `2027-01-18T00:00:00Z` (free through January 17).
- Read-only/export boundary, exclusive: `2027-02-01T00:00:00Z` (through January 31).
- Waitlist retention deadline: delete by `2027-04-01T00:00:00Z`.

UCD uses `ucdconnect.ie`, `ucd_landing`, `ucd_incoming`, and `ucd_autumn_2026`. Palomar uses `student.palomar.edu`, `palomar_landing`, `palomar_incoming`, and `palomar_autumn_2026`. Eligibility always requires a verified primary or secondary email on the exact configured domain.

## Required production configuration

Use the staging URL equivalents for staging. Keep both production access flags disabled until the joint activation time.

```dotenv
APP_ORIGINS=https://app.untitledmanagementsoftware.com,https://untitledmanagementsoftware.com,capacitor://localhost,http://localhost
APP_BASE_URL=https://app.untitledmanagementsoftware.com
MARKETING_ORIGIN=https://untitledmanagementsoftware.com
UCD_ACCESS_ENABLED=false
UCD_ACCESS_DOMAIN=ucdconnect.ie
UCD_ACCESS_END_AT=2027-01-18T00:00:00Z
UCD_ACCESS_GRACE_END_AT=2027-02-01T00:00:00Z
PALOMAR_ACCESS_ENABLED=false
PALOMAR_ACCESS_DOMAIN=student.palomar.edu
PALOMAR_ACCESS_END_AT=2027-01-18T00:00:00Z
PALOMAR_ACCESS_GRACE_END_AT=2027-02-01T00:00:00Z
SENDGRID_UCD_LAUNCH_UNSUBSCRIBE_GROUP_ID=<ucd-group-id>
SENDGRID_PALOMAR_LAUNCH_UNSUBSCRIBE_GROUP_ID=<distinct-palomar-group-id>
GOOGLE_CALENDAR_REDIRECT_URI=https://app.untitledmanagementsoftware.com/api/google-calendar/oauth/callback
```

Never reuse the UCD or iPhone suppression group for Palomar. Keep keys, tokens, unredacted student data, and calendar files out of source control and launch notes.

## Deployment order

1. Deploy the additive database migration and app/API to staging. Verify migration `1783920000_generalize_student_launch.sql`, existing UCD data preservation, auth, billing, and exports.
2. Enable both campus flags on staging and complete the matrix below with controlled accounts and redacted fixtures.
3. Deploy the app/API to production with both campus flags disabled.
4. Smoke-test health, auth, ordinary trials, Stripe, export, launch CORS, waitlist email, and the Canvas normalized-row endpoint.
5. Deploy the landing repository and verify `/ucd/` and `/palomar/`, including offline reloads.
6. Record the joint go/no-go decision. At 08:00 UTC, enable both flags in one configuration change and restart the API.
7. Reconcile one controlled verified account for each institution and confirm the expected entitlement metadata in `/api/billing/status`.

Rollback is flag-first: disable both campus flags, then restore the previous app image if needed. Leave additive tables/columns in place until a reviewed cleanup migration exists. Preserve and reapply deletion tombstones if a database backup is restored.

## Required launch matrix

- Both landing CTAs preserve valid attribution through signup, and invalid or overlength fields are dropped.
- Verified exact-domain primary and secondary emails grant the matching entitlement; unverified, subdomain, suffix-attack, and lookalike addresses do not.
- Personal-email campus journeys and existing entitlements do not start an ordinary trial.
- A paid eligible user keeps access, is set to cancel at period end, and receives no automatic refund. A simulated Stripe failure keeps paid access and shows a retryable warning.
- At the full-access boundary, writes return `403 READ_ONLY_GRACE` while reads, billing, and ZIP export continue. At the grace boundary, billing is required unless a paid subscription is active.
- UCD Brightspace PDF import remains local until reviewed normalized rows are saved.
- Palomar Canvas import covers all-day, UTC, TZID, floating, folded, escaped, duplicate UID, malformed, recurrence, missing-course, and assignment-URL cases. Use a redacted real Canvas fixture before launch.
- Browser network inspection proves the raw `.ics` bytes and Canvas credentials/feed tokens never leave the device; only selected normalized rows reach `POST /api/canvas-calendar/import`.
- UCD and Palomar incoming lists each pass double opt-in, 48-hour expiry, one-time confirmation, separate suppression, source-aware return, unsubscribe, and retention tests. Optional general marketing remains unchecked.
- Desktop and mobile navigation, focus order, form errors, contrast, hero cropping, reduced motion, service-worker cache, and offline reload pass for both campus pages.
- End-to-end flows pass from landing CTA through signup, verification, entitlement, secondary email, personal-email waitlist, relevant import, grace mode, and export.

## Joint go/no-go gate

Launch only if migrations, backups, auth, email, Stripe, CORS, read-only enforcement, export, both landing pages, and both campus journeys pass with no high-severity privacy, security, data-loss, or account-access defect. Written legal approval, the dedicated Palomar SendGrid suppression-group ID, and a redacted real Palomar Canvas `.ics` fixture are mandatory.

If either campus fails, keep **both** `UCD_ACCESS_ENABLED` and `PALOMAR_ACCESS_ENABLED` false and move both programs to September 14. Landing pages may remain available only for waitlist collection if consent, confirmation, policy, and unsubscribe flows pass.

The public claims remain:

> UMS does not send your schoolwork to generative-AI models or large-language-model services.

> Independent student app. Not affiliated with or endorsed by UCD, D2L, Brightspace, Palomar College, Instructure, or Canvas.
