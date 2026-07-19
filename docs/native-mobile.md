# Native Mobile Preparation

For the day-to-day path from local development to staging on iPhone to
production TestFlight/App Store release, see
[iOS Dev, Staging, and Production Workflow](ios-dev-staging-production-workflow.md).

The web app remains same-origin by default. Capacitor builds should set the API root explicitly:

```sh
VITE_API_BASE_URL=https://app.untitledmanagementsoftware.com/api
VITE_GOOGLE_REDIRECT_URI=https://app.untitledmanagementsoftware.com/oauth/google/callback
APP_ORIGINS=https://app.untitledmanagementsoftware.com,capacitor://localhost,http://localhost
```

## Phase 4 Capacitor setup

Capacitor is configured with:

- App name: `Untitled Management Software`
- App ID / bundle ID: `com.untitledmanagementsoftware.app`
- Web asset directory: `dist`

Initial setup commands:

```sh
npm i @capacitor/core @capacitor/android @capacitor/ios
npm i -D @capacitor/cli
npx cap init "Untitled Management Software" com.untitledmanagementsoftware.app --web-dir dist
npm run build
npx cap add android
npx cap add ios
npx cap sync
```

Repeatable local workflow:

```sh
npm run cap:sync
npm run cap:android
npm run cap:ios
```

For a staging iOS build, keep the downloaded Firebase `GoogleService-Info.plist`
outside git and pass its path at sync time:

```sh
GOOGLE_SERVICE_INFO_PLIST="/path/to/GoogleService-Info.plist" npm run ios:sync:staging
```

For a production iOS build, use the production Firebase plist or explicit
production env values:

```sh
GOOGLE_SERVICE_INFO_PLIST="/path/to/production-GoogleService-Info.plist" npm run ios:sync:production
```

That script reads the staging Firebase API key, iOS OAuth client ID, reversed
client ID, and bundle ID from the local plist, then runs the Capacitor sync with:

```sh
VITE_APP_ENV=staging
VITE_API_BASE_URL=https://dev.untitledmanagementsoftware.com/api
VITE_STAGING_ACCESS_CONTROL_ENABLED=true
```

Do not commit `GoogleService-Info*.plist`, `.env`, `.env.*`, or server env files.
They are ignored by git and should stay local or on the server only.

Capacitor's normal loop is to build the web assets, sync them into the native projects, then run or build the native projects. Android can be generated and synced on Windows when the Android toolchain is installed. iOS project files can be generated on Windows, but running or building the iOS app requires macOS with Xcode.

Google/Firebase setup before native launch:

- Add the hosted web domains as authorized JavaScript origins.
- Add the web domain and `VITE_GOOGLE_REDIRECT_URI` value as authorized redirect URIs.
- Configure Universal Links/App Links for the production domain before wiring Capacitor's `appUrlOpen` listener to `consumeGoogleRedirectUrl`.
- Keep bearer-token auth; the API does not require cookie credentials for native requests.
