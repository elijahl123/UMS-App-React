# DigitalOcean Production Deploy

This document describes the recommended production release process for the UMS app on a dedicated DigitalOcean droplet with DigitalOcean Managed Postgres.

Production should be promoted from `main`, not from pull request branches. Pull requests prove the change is safe. Merges to `main` release the change.

## Assumptions

- Public URL: `https://app.untitledmanagementsoftware.com`
- App directory on the production droplet: `/var/www/ums-app-react`
- Env file on the production droplet: `/etc/ums-app-react/production.env`
- Runtime service: `ums-app-react`
- API port: `127.0.0.1:3001`
- Database: DigitalOcean Managed Postgres
- Deployment trigger: merge to `main`

## Target Flow

```text
Pull request to main
  -> install dependencies
  -> lint
  -> run tests
  -> build
  -> block merge if checks fail

Merge to main
  -> connect to production droplet over SSH
  -> fetch origin/main
  -> reset production checkout to origin/main
  -> install dependencies
  -> load production env
  -> run SQL migrations
  -> build the client
  -> restart the API service
  -> verify /api/health
```

## Branch Protection

Configure GitHub branch protection for `main` before enabling automatic production deploys.

Recommended rules:

- Require pull request before merging.
- Require status checks to pass before merging.
- Require the CI workflow checks for lint, tests, and build.
- Require branches to be up to date before merging.
- Restrict who can push directly to `main`.
- Optionally require manual approval through a GitHub `production` environment before deployment.

The important split is:

- Pull request checks do not have production secrets.
- Production deploy only runs after code lands on `main`.

## Production Environment

Create this file on the production droplet:

```sh
sudo mkdir -p /etc/ums-app-react
sudo nano /etc/ums-app-react/production.env
sudo chmod 600 /etc/ums-app-react/production.env
```

Use production values:

```sh
NODE_ENV=production
APP_ORIGIN=https://app.untitledmanagementsoftware.com
APP_BASE_URL=https://app.untitledmanagementsoftware.com
PORT=3001
DATABASE_URL=<production-digitalocean-postgres-url>
SENDGRID_API_KEY=<production-sendgrid-api-key>
VITE_FIREBASE_API_KEY=<production-firebase-api-key>
VITE_GOOGLE_CLIENT_ID=<production-google-client-id>
STRIPE_SECRET_KEY=<production-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<production-stripe-webhook-secret>
STRIPE_MONTHLY_PRICE_ID=<production-monthly-price-id>
STRIPE_YEARLY_PRICE_ID=<production-yearly-price-id>
VITE_STRIPE_PUBLISHABLE_KEY=<production-stripe-publishable-key>
```

`VITE_*` values are client-side build values. If one changes, source the production env file before running `npm run build` so Vite bakes the new values into the browser bundle.

## Droplet Setup

Install the base runtime:

```sh
apt update
apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

Clone the repo:

```sh
mkdir -p /var/www/ums-app-react
git clone <your-repo-url> /var/www/ums-app-react
cd /var/www/ums-app-react
git checkout main
npm ci
```

Build once with the production environment loaded:

```sh
set -a
source /etc/ums-app-react/production.env
set +a
npm run migrate
npm run build
```

## Systemd

Use a production version of `deploy/ums-app.service.example`:

```ini
[Unit]
Description=UMS App React production API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/ums-app-react
EnvironmentFile=/etc/ums-app-react/production.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Install and start it:

```sh
sudo cp deploy/ums-app.service.example /etc/systemd/system/ums-app-react.service
sudo systemctl daemon-reload
sudo systemctl enable ums-app-react
sudo systemctl start ums-app-react
sudo systemctl status ums-app-react
```

If you copy the example directly, update the description and `EnvironmentFile` to use `production.env`.

## Nginx

Use a production version of `deploy/nginx.conf.example`:

```nginx
server {
  listen 80;
  listen [::]:80;
  server_name app.untitledmanagementsoftware.com;

  root /var/www/ums-app-react/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Install it:

```sh
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/ums-app-react
sudo ln -s /etc/nginx/sites-available/ums-app-react /etc/nginx/sites-enabled/ums-app-react
sudo nginx -t
sudo systemctl reload nginx
```

If you copy the example directly, update `server_name` to `app.untitledmanagementsoftware.com`.

## DNS and HTTPS

Point the app subdomain to the production droplet:

```text
app.untitledmanagementsoftware.com -> <production-droplet-ip>
```

Allow ports 80 and 443 through the DigitalOcean Cloud Firewall.

Then install Certbot on Ubuntu 24.04:

```sh
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d app.untitledmanagementsoftware.com
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status certbot.timer
```

## CI Workflow

Add a pull request workflow that runs without production secrets:

```yaml
name: CI

on:
  pull_request:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

If the build requires `VITE_*` values, add non-secret CI-safe values as repository variables or workflow env values. Do not use production secrets in pull request workflows.

## Production Deploy Workflow

Create `.github/workflows/production-deploy.yml` after the droplet has been prepared:

```yaml
name: Deploy production

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: production-deploy
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Deploy over SSH
        env:
          SSH_HOST: ${{ secrets.PRODUCTION_SSH_HOST }}
          SSH_USER: ${{ secrets.PRODUCTION_SSH_USER }}
          SSH_PORT: ${{ secrets.PRODUCTION_SSH_PORT }}
          SSH_PRIVATE_KEY: ${{ secrets.PRODUCTION_SSH_PRIVATE_KEY }}
        run: |
          set -euo pipefail
          mkdir -p ~/.ssh
          printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          PORT="${SSH_PORT:-22}"
          ssh-keyscan -p "$PORT" "$SSH_HOST" >> ~/.ssh/known_hosts
          scp -i ~/.ssh/id_ed25519 -P "$PORT" deploy/production-deploy.sh "$SSH_USER@$SSH_HOST:/tmp/production-deploy.sh"
          ssh -i ~/.ssh/id_ed25519 -p "$PORT" "$SSH_USER@$SSH_HOST" 'bash /tmp/production-deploy.sh'
```

Set these GitHub repository or environment secrets:

- `PRODUCTION_SSH_HOST`
- `PRODUCTION_SSH_USER`
- `PRODUCTION_SSH_PRIVATE_KEY`
- `PRODUCTION_SSH_PORT` if you do not use 22

Use a GitHub `production` environment if you want a manual approval step before production deploys.

## Production Deploy Script

Create `deploy/production-deploy.sh`:

```sh
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/ums-app-react"
ENV_FILE="/etc/ums-app-react/production.env"
BRANCH="main"

cd "$APP_DIR"

sudo systemctl stop ums-app-react

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

npm ci

set -a
source "$ENV_FILE"
set +a

npm run migrate
npm run build

sudo systemctl start ums-app-react

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then
    echo "[deploy] health check passed"
    exit 0
  fi

  sleep 1
done

echo "[deploy] health check failed"
sudo journalctl -u ums-app-react -n 100 --no-pager
exit 1
```

Make it executable:

```sh
chmod +x deploy/production-deploy.sh
```

## Database Migrations

Production deploys should run `npm run migrate` before restarting the service. The migration runner tracks applied SQL files in `schema_migrations`, so deploys only apply new files from `migrations/`.

Production migration rules:

- Migrations should be backward compatible with the currently running app when possible.
- Avoid destructive schema changes in the same deploy as application code that depends on them.
- Take a managed database backup before large or risky migrations.
- Test migrations against staging before merging to `main`.

## Rollback

For the SSH-based deploy flow, rollback means resetting the production checkout to a known good commit and rerunning the deploy steps:

```sh
cd /var/www/ums-app-react
git fetch origin main
git reset --hard <known-good-commit-sha>
npm ci
set -a
source /etc/ums-app-react/production.env
set +a
npm run build
sudo systemctl restart ums-app-react
curl -fsS http://127.0.0.1:3001/api/health
```

If the failed deploy included a database migration, rollback may require a forward-fix migration instead of reverting code alone.

## Optional Future Improvement: Image-Based Deploys

The SSH checkout flow matches the current staging setup and is the fastest clean production path.

Later, production can move to immutable Docker images:

```text
Merge to main
  -> build Docker image
  -> tag image with commit SHA
  -> push image to GitHub Container Registry
  -> SSH to droplet
  -> pull exact image SHA
  -> run migrations
  -> restart docker compose
  -> health check
```

That approach gives stronger rollbacks because each release maps to a specific image. It is worth doing after the first production deploy path is stable.

## Production Checklist

- `main` branch protection is enabled.
- CI runs lint, tests, and build for pull requests.
- Production deploy runs only on merge to `main` or manual workflow dispatch.
- Production GitHub secrets are scoped to the `production` environment.
- `/etc/ums-app-react/production.env` exists on the droplet and is not committed.
- The DigitalOcean Managed Postgres connection string uses the production database.
- Nginx serves `app.untitledmanagementsoftware.com`.
- HTTPS is active and auto-renewal is enabled.
- `/api/health` passes locally on the droplet and through the public domain.
- Stripe, Google OAuth, Firebase, and email redirect URLs use `https://app.untitledmanagementsoftware.com`.

## Troubleshooting

Check the API directly on the droplet:

```sh
curl -i http://127.0.0.1:3001/api/health
sudo journalctl -u ums-app-react -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

If `/api/health` works locally but the browser gets `502 Bad Gateway`, check the Nginx upstream and service port.

If the frontend has stale Google, Firebase, or Stripe client values, source `production.env`, rebuild, and restart:

```sh
cd /var/www/ums-app-react
set -a
source /etc/ums-app-react/production.env
set +a
npm run build
sudo systemctl restart ums-app-react
```

