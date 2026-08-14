# Email Delivery and Firebase Action Links

The API sends all application-originated email through SendGrid. Firebase
Authentication still generates and validates the one-time action codes used for
primary email verification and password resets.

## Runtime configuration

Configure these values separately for development, staging, and production:

```sh
APP_BASE_URL=https://app.example.com
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_CLIENT_EMAIL=<firebase-service-account-email>
FIREBASE_PRIVATE_KEY=<one-line-private-key-with-escaped-newlines>
SENDGRID_API_KEY=<restricted-mail-send-api-key>
SENDGRID_FROM_EMAIL=noreply@example.com
```

`APP_BASE_URL` must be the public HTTPS origin that hosts the app. Never expose
the SendGrid API key or Firebase service-account credentials in `VITE_*`
variables.

## Firebase setup

For each Firebase project:

1. Open **Authentication > Settings > Authorized domains** and add the exact app
   domain for that environment.
2. Do not depend on the Firebase template Action URL setting. Some projects
   reject that update with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. The API
   generates the one-time action link with Firebase Admin, preserves Firebase's
   `mode`, `oobCode`, `apiKey`, `continueUrl`, and `lang` query parameters, and
   hosts the handler at `${APP_BASE_URL}/auth/action` before sending it through
   SendGrid.
3. Confirm the configured service account can use Firebase Authentication and
   generate email action links.

The app uses web-first action handling (`handleCodeInApp: false`). Firebase
places `mode` and `oobCode` in the generated query, and the API replaces only
the generated handler origin/path with `${APP_BASE_URL}/auth/action`. It does
not alter the query string or create an authentication token locally. The React
handler routes those values to `/#/reset-password` or `/#/verify-email`.
Firebase owns code expiry, one-time use, and validation.

## SendGrid setup

1. Authenticate `untitledmanagementsoftware.com` in SendGrid using DNS domain
   authentication. Single Sender Verification is suitable only for local or
   temporary testing.
2. Create a restricted API key with **Mail Send** access and store it only in the
   server runtime environment.
3. Verify `SENDGRID_FROM_EMAIL` belongs to the authenticated domain.
4. Keep authentication and secondary-verification emails transactional. The
   waitlist flow retains its explicit confirmation, cancellation, and marketing
   suppression behavior.

The server logs accepted and failed sends with the email category, a hashed
recipient identifier, status, and SendGrid message ID. Logs must never contain
full recipient addresses, action links, or tokens.

## Release verification

In staging, use real inboxes to verify:

- signup verification and authenticated resend;
- password reset for both registered and unregistered-looking requests;
- secondary-address verification;
- waitlist confirmation and cancellation.

For Firebase actions, confirm the link opens the app, succeeds once, and reports
an invalid or expired link when reused. Confirm each accepted SendGrid request
has a sanitized structured log entry. Repeat the smoke test in production after
promotion.
