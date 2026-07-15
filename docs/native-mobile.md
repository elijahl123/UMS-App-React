# Native Mobile Preparation

The web app remains same-origin by default. Capacitor builds should set the API root explicitly:

```sh
VITE_API_BASE_URL=https://app.untitledmanagementsoftware.com/api
VITE_GOOGLE_REDIRECT_URI=https://app.untitledmanagementsoftware.com/oauth/google/callback
APP_ORIGINS=https://app.untitledmanagementsoftware.com,capacitor://localhost,http://localhost
```

Google/Firebase setup before native launch:

- Add the hosted web domains as authorized JavaScript origins.
- Add the web domain and `VITE_GOOGLE_REDIRECT_URI` value as authorized redirect URIs.
- Configure Universal Links/App Links for the production domain before wiring Capacitor's `appUrlOpen` listener to `consumeGoogleRedirectUrl`.
- Keep bearer-token auth; the API does not require cookie credentials for native requests.
