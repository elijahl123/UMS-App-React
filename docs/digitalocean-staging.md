# DigitalOcean Staging Deploy

This repo is set up for a single Ubuntu droplet with Nginx in front and the Express API running on `127.0.0.1:3001`.

For the branch promotion process from feature work to staging to production, see [Release Flow](release-flow.md).

## Assumptions

- Public URL: `https://dev.untitledmanagementsoftware.com`
- App directory on the droplet: `/var/www/ums-app-react`
- Env file on the droplet: `/etc/ums-app-react/staging.env`

## Environment

Use these values in the droplet env file:

```sh
APP_ORIGIN=https://dev.untitledmanagementsoftware.com
APP_ORIGINS=https://dev.untitledmanagementsoftware.com
APP_BASE_URL=https://dev.untitledmanagementsoftware.com
PORT=3001
DATABASE_URL=<staging-postgres-url>
SENDGRID_API_KEY=<sendgrid-api-key>
VITE_FIREBASE_API_KEY=<firebase-api-key>
VITE_GOOGLE_CLIENT_ID=<google-client-id>
VITE_API_BASE_URL=
VITE_GOOGLE_REDIRECT_URI=
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>
STRIPE_MONTHLY_PRICE_ID=<stripe-monthly-price-id>
STRIPE_YEARLY_PRICE_ID=<stripe-yearly-price-id>
VITE_STRIPE_PUBLISHABLE_KEY=<stripe-publishable-key>
```

`VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE_URL`, and `VITE_GOOGLE_REDIRECT_URI` are client-side build values. If you add or change one, rerun `npm run build` before restarting the service so the browser bundle picks up the new value. Leave `VITE_API_BASE_URL` blank for the hosted web app.

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

Before building, load the staging env file into the shell so Vite can bake the `VITE_*` values into the client bundle:

```sh
set -a
source /etc/ums-app-react/staging.env
set +a
npm run build
```

If you skip that step after changing `VITE_FIREBASE_API_KEY` or `VITE_GOOGLE_CLIENT_ID`, the deployed frontend will keep the old or placeholder values.

## GitHub Actions Deploy

This repo includes `.github/workflows/staging-deploy.yml` and `deploy/staging-deploy.sh` for automatic staging deploys on push to `staging`.

Set these GitHub repository secrets:

- `STAGING_SSH_HOST`
- `STAGING_SSH_USER`
- `STAGING_SSH_PRIVATE_KEY`
- `STAGING_SSH_PORT` if you do not use 22

The SSH user needs permission to stop and start `ums-app-react`, either by logging in as `root` or by having passwordless sudo for the service commands.

The workflow SSHes into the droplet, runs `deploy/staging-deploy.sh`, stops the service, resets the checkout to `origin/staging`, installs deps, applies any pending SQL migrations through `npm run migrate`, rebuilds, restarts the service, and checks `http://127.0.0.1:3001/api/health`.

The action uploads `deploy/staging-deploy.sh` to `/tmp/staging-deploy.sh` on the server before running it, so the first automated deploy does not depend on the server already having the latest script.

The migration runner tracks applied files in a `schema_migrations` table, so each deploy only applies new SQL files from `migrations/`.

## Runtime

`npm run dev` is a local development command. It starts the Vite client and the API server together, and the API server still requires `DATABASE_URL` plus the other runtime variables from the env file. If those are missing, `server/config.ts` fails before the API binds a port.

On the droplet, prefer one of these:

```sh
systemctl start ums-app-react
```

or, for a one-off shell session:

```sh
set -a
source /etc/ums-app-react/staging.env
set +a
npm start
```

If you want to run `npm run dev` on the droplet anyway, put a `.env` file in `/var/www/ums-app-react` with the same values so `dotenv.config()` can load it.

## Enable HTTPS

Certbot's current docs recommend the Snap install path, and note that it is most useful with root access, port 80 open, and automatic nginx configuration. DigitalOcean Cloud Firewalls are stateful and block traffic that is not explicitly allowed, so make sure your firewall allows both 80 and 443.

On Ubuntu 24.04:

```sh
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d dev.untitledmanagementsoftware.com
```

That command should request the certificate and update Nginx for HTTPS. Certbot's instructions page is the right entry point if you need to choose a different web server or install method.

After certbot finishes:

```sh
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status certbot.timer
```

If you want to force HTTP to HTTPS manually, keep the 80 server block as a redirect and let Certbot manage the 443 block.

## Google Sign-In

Google sign-in uses `window.location.origin` as the web redirect URI unless `VITE_GOOGLE_REDIRECT_URI` is set. The Google OAuth client must allow `https://dev.untitledmanagementsoftware.com` as an authorized JavaScript origin and redirect URI. If the button still says it is not configured, confirm that the env file contains `VITE_GOOGLE_CLIENT_ID`, rebuild the client with `npm run build`, and restart the service.

## Billing Troubleshooting

The billing page loads its config and subscription status from `/api/billing/config` and `/api/billing/status`. If the browser shows `REQUEST_FAILED` or nginx returns `502 Bad Gateway`, the first thing to check is the API process and the proxy, not Stripe itself.

Run these on the droplet:

```sh
curl -i http://127.0.0.1:3001/api/health
curl -i http://127.0.0.1:3001/api/billing/config
sudo journalctl -u ums-app-react -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

If `/api/billing/config` returns JSON locally but the browser still gets 502, the nginx upstream is wrong or the service is not listening on `127.0.0.1:3001`.

If you change any `VITE_*` billing variable, source the env file and rebuild before restarting so Vite bakes the new values into the client bundle:

```sh
cd /var/www/ums-app-react
set -a
source /etc/ums-app-react/staging.env
set +a
npm run build
sudo systemctl restart ums-app-react
```

## PDF Worker Troubleshooting

The Brightspace PDF import uses a Vite-built PDF.js worker like `/assets/pdf.worker-<hash>.mjs`. Browser module workers require a JavaScript MIME type, so this file must not be served as `application/octet-stream`.

Check the deployed header:

```sh
curl -I https://dev.untitledmanagementsoftware.com/assets/pdf.worker-<hash>.mjs
```

If the response has `Content-Type: application/octet-stream`, update the active nginx site config with the `.mjs` location from `deploy/nginx.conf.example`, then reload nginx:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Also confirm you are checking the app directory on the droplet, not your local machine:

```sh
cd /var/www/ums-app-react
ls -lah dist/assets | grep pdf.worker
```

## Notes

- Google OAuth and Firebase email-link redirects must use `https://dev.untitledmanagementsoftware.com`.
- Stripe webhook endpoint: `https://dev.untitledmanagementsoftware.com/api/billing/webhook`.
- The app uses `HashRouter`, so Nginx can safely serve `index.html` for all non-API paths.
