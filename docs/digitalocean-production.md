# DigitalOcean Production Deployment

Production uses the same immutable Compose release path as staging. Promote
tested changes from `staging` to `main`; every merge to `main` publishes and
deploys images tagged:

```text
ghcr.io/elijahl123/ums-app-react-api:production-<commit-sha>
ghcr.io/elijahl123/ums-app-react-web:production-<commit-sha>
```

See [DigitalOcean Staging Deployment](digitalocean-staging.md) for the topology,
Docker installation, host Nginx configuration, deployment mechanics, logs, and
rollback commands. Production differs only in the domain, runtime values, and
GitHub environment.

## Runtime environment

Create `/etc/ums-app-react/production.env` with mode `0600`:

```sh
sudo install -d -m 0755 /etc/ums-app-react
sudo install -m 0600 /dev/null /etc/ums-app-react/production.env
sudo nano /etc/ums-app-react/production.env
```

Use production credentials:

```sh
NODE_ENV=production
APP_ENV=production
APP_ORIGIN=https://app.untitledmanagementsoftware.com
APP_ORIGINS=https://app.untitledmanagementsoftware.com,capacitor://localhost,http://localhost
APP_BASE_URL=https://app.untitledmanagementsoftware.com
DATABASE_URL=<production-managed-postgres-url>
STAGING_ACCESS_CONTROL_ENABLED=false
VITE_FIREBASE_API_KEY=<production-firebase-api-key>
FIREBASE_PROJECT_ID=<production-firebase-project-id>
FIREBASE_CLIENT_EMAIL=<production-service-account-email>
FIREBASE_PRIVATE_KEY=<one-line-private-key-with-escaped-newlines>
SENDGRID_API_KEY=<production-sendgrid-api-key>
SENDGRID_FROM_EMAIL=noreply@untitledmanagementsoftware.com
STRIPE_SECRET_KEY=<production-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<production-stripe-webhook-secret>
STRIPE_MONTHLY_PRICE_ID=<production-monthly-price-id>
STRIPE_YEARLY_PRICE_ID=<production-yearly-price-id>
VITE_STRIPE_PUBLISHABLE_KEY=<production-publishable-key>
GOOGLE_CALENDAR_CLIENT_ID=<production-google-client-id>
GOOGLE_CALENDAR_CLIENT_SECRET=<production-google-client-secret>
GOOGLE_CALENDAR_REDIRECT_URI=https://app.untitledmanagementsoftware.com/api/google-calendar/oauth/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<long-random-secret>
```

Configure the host Nginx site from `deploy/nginx.conf.example`, with
`server_name app.untitledmanagementsoftware.com`, and retain the existing
Certbot-managed certificate.

## GitHub production environment

Create a protected GitHub environment named `production`. Require manual
approval if desired.

Use the same environment variable names documented for staging, with
production values:

- Variables: the public browser `VITE_*` configuration.
- Existing repository secrets: `PRODUCTION_SSH_HOST`,
  `PRODUCTION_SSH_USER`, optional `PRODUCTION_SSH_PORT`, and
  `PRODUCTION_SSH_PRIVATE_KEY` are mapped by the caller workflow.

The release job passes `VITE_APP_ENV=production` and disables the frontend
staging-access flag automatically.

## Release safety

- Pull requests into `main` must pass the normal CI workflow.
- The release workflow repeats lint, unit tests, and web/server builds before
  publishing.
- The deploy runs migrations before replacing the live containers.
- Failed candidates automatically restore the previous application images.
- Database migrations must remain compatible with both the old and new
  application versions and are rolled forward, never automatically reversed.
- Keep DigitalOcean Managed Postgres backups enabled and take an explicit
  backup before high-risk migrations.

Verify after deployment:

```sh
curl -fsS https://app.untitledmanagementsoftware.com/api/health
curl -I https://app.untitledmanagementsoftware.com/sw.js
curl -I https://app.untitledmanagementsoftware.com/assets/pdf.worker.min-<hash>.mjs
```

Confirm authentication, Stripe billing and webhooks, SendGrid delivery, Google
Calendar OAuth, and a native Capacitor API call before considering the release
complete.

Production Stripe webhooks use
`https://app.untitledmanagementsoftware.com/api/billing/webhook`.
