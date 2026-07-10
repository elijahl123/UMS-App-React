# DigitalOcean Staging Deploy

This repo is set up for a single Ubuntu droplet with Nginx in front and the Express API running on `127.0.0.1:3001`.

## Assumptions

- Public URL: `https://dev.untitledmanagementsoftware.com`
- App directory on the droplet: `/var/www/ums-app-react`
- Env file on the droplet: `/etc/ums-app-react/staging.env`

## Environment

Use these values in the droplet env file:

```sh
APP_ORIGIN=https://dev.untitledmanagementsoftware.com
APP_BASE_URL=https://dev.untitledmanagementsoftware.com
PORT=3001
DATABASE_URL=<staging-postgres-url>
SENDGRID_API_KEY=<sendgrid-api-key>
VITE_FIREBASE_API_KEY=<firebase-api-key>
VITE_GOOGLE_CLIENT_ID=<google-client-id>
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>
STRIPE_MONTHLY_PRICE_ID=<stripe-monthly-price-id>
STRIPE_YEARLY_PRICE_ID=<stripe-yearly-price-id>
VITE_STRIPE_PUBLISHABLE_KEY=<stripe-publishable-key>
```

## Install

```sh
apt update
apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

## Deploy

```sh
mkdir -p /var/www/ums-app-react
git clone <your-repo-url> /var/www/ums-app-react
cd /var/www/ums-app-react
git checkout staging
npm ci
npm run build
```

Then copy the Nginx and systemd templates from `deploy/` into place, reload Nginx, and start the service.

## Notes

- Google OAuth and Firebase email-link redirects must use `https://dev.untitledmanagementsoftware.com`.
- Stripe webhook endpoint: `https://dev.untitledmanagementsoftware.com/api/billing/webhook`.
- The app uses `HashRouter`, so Nginx can safely serve `index.html` for all non-API paths.
