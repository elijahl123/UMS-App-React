# Staging Access Control

Staging access control is opt-in and should not be tied to `NODE_ENV`.
Both staging and production can run optimized production builds.

## Production

Leave staging access control disabled:

```bash
APP_ENV=production
STAGING_ACCESS_CONTROL_ENABLED=false
VITE_APP_ENV=production
VITE_STAGING_ACCESS_CONTROL_ENABLED=false
```

## Staging

Enable the gate only for `dev.untitledmanagementsoftware.com`:

```bash
APP_ENV=staging
STAGING_ACCESS_CONTROL_ENABLED=true
STAGING_ADMIN_EMAILS=your-email@example.com
VITE_APP_ENV=staging
VITE_STAGING_ACCESS_CONTROL_ENABLED=true
```

The server exposes `/api/staging-access/config`, so the browser also detects the
server-side setting if the Vite flag is missing. The Vite flag is still useful
because it lets the initial client render know the expected environment.

## Firebase Admin Credentials

The staging server needs Firebase Admin credentials to verify ID tokens. Use one
of these options:

```bash
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

or configure `GOOGLE_APPLICATION_CREDENTIALS` to point at a Firebase service
account JSON file.

## First Admin Login

After the migration is deployed, the first successful login from an email in
`STAGING_ADMIN_EMAILS` creates or updates that email as an active `admin` in
`staging_access_grants`.

Admins can manage access at:

```text
/#/admin/staging-access
```

## Helper Scripts

Run this on the staging server from the app directory after placing a Firebase
service account JSON file on the server:

```bash
STAGING_ADMIN_EMAILS="your-email@example.com" \
FIREBASE_SERVICE_ACCOUNT_JSON="/root/ums-firebase-admin.json" \
bash deploy/setup-staging-access-env.sh
```

Run this on production if you ever need to force the gate off:

```bash
bash deploy/disable-staging-access-env.sh
```

Check staging after deploy:

```bash
bash deploy/check-staging-access.sh https://dev.untitledmanagementsoftware.com
```
