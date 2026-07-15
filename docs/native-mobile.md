# Native Mobile Preparation

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

Capacitor's normal loop is to build the web assets, sync them into the native projects, then run or build the native projects. Android can be generated and synced on Windows when the Android toolchain is installed. iOS project files can be generated on Windows, but running or building the iOS app requires macOS with Xcode.

Google/Firebase setup before native launch:

- Add the hosted web domains as authorized JavaScript origins.
- Add the web domain and `VITE_GOOGLE_REDIRECT_URI` value as authorized redirect URIs.
- Configure Universal Links/App Links for the production domain before wiring Capacitor's `appUrlOpen` listener to `consumeGoogleRedirectUrl`.
- Keep bearer-token auth; the API does not require cookie credentials for native requests.
