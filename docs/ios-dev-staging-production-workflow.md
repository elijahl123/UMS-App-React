# iOS Dev, Staging, and Production Workflow

This is the efficient path from local development, to staging on a physical
iPhone, to production TestFlight and App Store release.

Related docs:

- [Release Flow](release-flow.md)
- [Native Mobile Preparation](native-mobile.md)
- [DigitalOcean Staging Deploy](digitalocean-staging.md)
- [DigitalOcean Production Deploy](digitalocean-production.md)

## Core Rule

Capacitor copies the current Vite build into the native projects. The last sync
wins.

If you run a production sync after a staging sync, the iOS project contains a
production web bundle. If you run a staging sync after a production sync, it
contains a staging web bundle.

Always run the correct sync command immediately before installing, archiving, or
uploading an iOS build.

## Environment Lanes

Use three lanes:

| Lane | Branch | URL | Native target |
| --- | --- | --- | --- |
| Local dev | feature branch from `staging` | `http://127.0.0.1:5173` | simulator/local browser |
| Staging | `staging` | `https://dev.untitledmanagementsoftware.com` | physical iPhone from Xcode |
| Production | `main` | `https://app.untitledmanagementsoftware.com` | TestFlight/App Store |

Recommended native identities:

| Lane | Bundle ID | Display name |
| --- | --- | --- |
| Staging | `com.untitledmanagementsoftware.app.staging` | `UMS Staging` |
| Production | `com.untitledmanagementsoftware.app` | `Untitled Management Software` |

That lets staging and production install side by side on the same iPhone.

## Secret and Config Policy

Do not commit:

- `.env`
- `.env.*`
- `staging.env`
- `production.env`
- `GoogleService-Info*.plist`
- copied Firebase plist files under `ios/`
- server env files from `/etc/ums-app-react/`

These are ignored by git. Keep Firebase plists in a local-only folder such as
Downloads, iCloud Keychain-backed storage, 1Password exports, or another private
location.

The iPhone app does need some public client config baked into the Vite bundle,
including Firebase API keys and OAuth client IDs. That generated bundle lives in
ignored output locations such as `dist` and `ios/App/App/public`.

Before committing, run:

```sh
git status --short
git diff -- . | rg 'AIza|FIREBASE_PRIVATE_KEY|STRIPE_SECRET|WEBHOOK_SECRET|SENDGRID|DATABASE_URL' || true
```

Only commit source code, scripts, docs, and intentional native project settings.

## One-Time Setup

Install dependencies:

```sh
npm ci
```

Create or confirm Apple identifiers:

- Staging App ID: `com.untitledmanagementsoftware.app.staging`
- Production App ID: `com.untitledmanagementsoftware.app`

Create or confirm Google/Firebase iOS clients:

- Staging Firebase iOS app bundle ID: `com.untitledmanagementsoftware.app.staging`
- Production Firebase iOS app bundle ID: `com.untitledmanagementsoftware.app`
- Each lane should have its own `GoogleService-Info.plist`

For Google sign-in to return to the app, these must match:

- Xcode bundle identifier
- Firebase/Google iOS client bundle ID
- `CLIENT_ID` used by the Vite build
- `REVERSED_CLIENT_ID` registered in `Info.plist`

The sync scripts read those values from the local Firebase plist so you do not
need to paste them into tracked files.

## Fast Local Dev Loop

Start from the latest staging branch:

```sh
git fetch origin
git switch staging
git pull origin staging
git switch -c feature/my-change
```

Run the app locally:

```sh
npm run dev
```

Use the local browser for fast UI/API iteration. Most work should be proven here
before touching Xcode.

Run focused verification as you work:

```sh
npm run lint
npm run test
npm run build
```

For mobile layout checks without native signing overhead:

```sh
npm run test:e2e -- e2e/mobile-smoke.mobile.spec.ts
```

When ready, push your feature branch and open a pull request into `staging`:

```text
feature/my-change -> staging
```

## Promote to Staging

After the feature PR is merged into `staging`, let the staging deploy run or
deploy staging manually according to [DigitalOcean Staging Deploy](digitalocean-staging.md).

Confirm staging web/API health:

```sh
curl -i https://dev.untitledmanagementsoftware.com/api/health
```

On the staging server, native iOS must be allowed by CORS:

```sh
APP_ORIGINS=https://dev.untitledmanagementsoftware.com,capacitor://localhost,http://localhost
STAGING_ACCESS_CONTROL_ENABLED=true
VITE_APP_ENV=staging
VITE_STAGING_ACCESS_CONTROL_ENABLED=true
```

If any `VITE_*` value changed on the staging server, rebuild and restart staging
so the hosted web bundle gets the new value.

## Build Staging for iPhone

Run the staging sync immediately before installing on your iPhone:

```sh
GOOGLE_SERVICE_INFO_PLIST="/path/to/staging-GoogleService-Info.plist" npm run ios:sync:staging
```

This sets:

```sh
VITE_APP_ENV=staging
VITE_API_BASE_URL=https://dev.untitledmanagementsoftware.com/api
VITE_STAGING_ACCESS_CONTROL_ENABLED=true
VITE_FIREBASE_API_KEY=<read from local plist>
VITE_GOOGLE_IOS_CLIENT_ID=<read from local plist>
VITE_GOOGLE_IOS_REVERSED_CLIENT_ID=<read from local plist>
```

The command does not print the Firebase API key.

Verify the native URL scheme:

```sh
plutil -p ios/App/App/Info.plist | grep googleusercontent
```

Open Xcode:

```sh
open ios/App/App.xcodeproj
```

In Xcode:

1. Select the `App` target.
2. Open `Signing & Capabilities`.
3. Set the team to your Apple Developer team.
4. Confirm the bundle identifier is `com.untitledmanagementsoftware.app.staging`.
5. Select your physical iPhone as the destination.
6. Delete any old staging app from the iPhone.
7. Press Run.

## Staging iPhone Test Pass

Keep Xcode's console open while testing.

First confirm identity:

- App name is `UMS Staging`.
- Bundle ID is `com.untitledmanagementsoftware.app.staging`.
- The app talks to `https://dev.untitledmanagementsoftware.com/api`.
- Staging and production can install side by side.

Watch staging server logs while using the app:

```sh
sudo journalctl -u ums-app-react -f
```

Run this smoke test on the physical iPhone:

- Clean install launches without a blank screen.
- Email/password sign-up works for a staging-only account.
- Email/password login works.
- Google sign-in opens the browser, returns to the app, and creates a session.
- Force quit and reopen preserves or restores session state as expected.
- Staging access control accepts allowed accounts and rejects unapproved accounts.
- Dashboard loads.
- Courses load, create, edit, and persist.
- Homework loads, create/edit/complete flows work, and due dates stay correct.
- Calendar loads and event dates are correct.
- Notes create/edit/persist.
- Brightspace PDF import works with a real PDF.
- Billing page loads with staging/test Stripe configuration.
- Offline or poor network shows recoverable behavior.
- Light mode, dark mode, and large text remain usable.

If Google sign-in opens and then returns to Google or reports cancellation, check
these first:

- `VITE_GOOGLE_IOS_CLIENT_ID` matches the staging Firebase plist `CLIENT_ID`.
- `Info.plist` contains the staging plist `REVERSED_CLIENT_ID`.
- Xcode bundle ID matches the Firebase iOS app bundle ID.
- You deleted the old app before reinstalling.

## Promote Staging to Production

When staging passes on iPhone, open a pull request:

```text
staging -> main
```

Merge with a normal merge commit. Do not squash `staging` into `main`.

After merge, let the production deploy run or follow
[DigitalOcean Production Deploy](digitalocean-production.md).

Confirm production health:

```sh
curl -i https://app.untitledmanagementsoftware.com/api/health
```

## Build Production for TestFlight

Switch to the exact production source:

```sh
git fetch origin
git switch main
git pull origin main
```

Run final local verification:

```sh
npm run lint
npm run test
npm run build
```

Run the production sync immediately before archiving:

```sh
GOOGLE_SERVICE_INFO_PLIST="/path/to/production-GoogleService-Info.plist" npm run ios:sync:production
```

If you do not have a production Firebase plist, set the values explicitly in the
shell instead of saving them to tracked files:

```sh
VITE_FIREBASE_API_KEY="<production-firebase-api-key>" \
VITE_GOOGLE_IOS_CLIENT_ID="<production-ios-client-id>" \
VITE_GOOGLE_IOS_REVERSED_CLIENT_ID="<production-reversed-client-id>" \
npm run ios:sync:production
```

This sets:

```sh
VITE_APP_ENV=production
VITE_API_BASE_URL=https://app.untitledmanagementsoftware.com/api
VITE_STAGING_ACCESS_CONTROL_ENABLED=false
```

In Xcode:

1. Select the production bundle ID: `com.untitledmanagementsoftware.app`.
2. Select `Any iOS Device`.
3. Increment the build number.
4. Confirm signing is valid.
5. Product -> Archive.
6. In Organizer, distribute to App Store Connect.

After upload, App Store Connect processes the build. Use TestFlight first, even
for production candidates.

## Production TestFlight Pass

In App Store Connect:

1. Open the production app.
2. Go to `TestFlight`.
3. Add the processed build to an internal tester group.
4. Install it from TestFlight on a physical iPhone.

Run a smaller but serious production candidate pass:

- Fresh install works.
- App name is production name.
- API traffic hits `https://app.untitledmanagementsoftware.com/api`.
- Google sign-in works.
- Email/password login works.
- Existing production account data loads correctly.
- Create/edit flows work on a safe test account.
- Billing uses the intended production Stripe mode.
- No staging access gate appears.
- Force quit and reopen works.

Do not use real customer data for destructive tests. Use a production test
account reserved for release checks.

## App Store Submission

After the production TestFlight build passes:

1. In App Store Connect, open the production app version.
2. Select the tested build.
3. Complete required metadata, privacy, compliance, screenshots, and review notes.
4. Submit for App Review.

If Apple reports missing compliance or metadata, resolve that in App Store
Connect and submit again. Do not create a new binary unless the issue requires a
code or native project change.

## Emergency Fix Path

For urgent production fixes:

```text
main -> hotfix branch -> PR to main -> production deploy -> production iOS sync -> TestFlight smoke -> App Store submission
```

Then merge `main` back into `staging` so staging does not drift:

```sh
git fetch origin
git switch staging
git pull origin staging
git merge origin/main
git push origin staging
```

## Quick Command Reference

Local dev:

```sh
npm run dev
npm run lint
npm run test
npm run build
```

Staging iPhone:

```sh
git switch staging
git pull origin staging
GOOGLE_SERVICE_INFO_PLIST="/path/to/staging-GoogleService-Info.plist" npm run ios:sync:staging
open ios/App/App.xcodeproj
```

Production TestFlight:

```sh
git switch main
git pull origin main
npm run lint
npm run test
npm run build
GOOGLE_SERVICE_INFO_PLIST="/path/to/production-GoogleService-Info.plist" npm run ios:sync:production
open ios/App/App.xcodeproj
```

Secret scan before commit:

```sh
git diff -- . | rg 'AIza|FIREBASE_PRIVATE_KEY|STRIPE_SECRET|WEBHOOK_SECRET|SENDGRID|DATABASE_URL' || true
```

## Apple References

- [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Add internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)
- [Choose a build to submit](https://developer.apple.com/help/app-store-connect/manage-builds/choose-a-build-to-submit/)
