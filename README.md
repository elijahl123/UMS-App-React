# UMS App React

Complete React + Express port of Untitled Management Software.

The frontend is intentionally cloned from `UMS-App/src` so the app looks and behaves the same. The backend keeps the same API contract while splitting the Express server into smaller modules:

- `server/config.ts` loads environment configuration.
- `server/db.ts` owns the Postgres pool.
- `server/actions.ts` maps app actions to SQL.
- `server/routes/actions.ts` serves `/api/actions/:name`.
- `server/routes/email.ts` serves Firebase action-email and secondary-address email APIs.
- `server/routes/canvasCalendar.ts` saves only reviewed, normalized Canvas calendar rows; `.ics` parsing remains in the browser.
- `server/app.ts` wires middleware and routes.
- `server/index.ts` starts the API.

## Connections

Use the same `.env` values as the original app:

```sh
DATABASE_URL=postgres://user:password@localhost:5432/dbname
SENDGRID_API_KEY=SG.xxxx
SENDGRID_FROM_EMAIL=noreply@untitledmanagementsoftware.com
VITE_FIREBASE_API_KEY=xxxx
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
VITE_API_BASE_URL=
VITE_GOOGLE_REDIRECT_URI=
APP_ORIGIN=http://localhost:5173
APP_ORIGINS=
APP_BASE_URL=http://localhost:5173
PORT=3001
VITE_DEV_ORIGIN=http://localhost:5173
REVENUECAT_WEBHOOK_AUTH_HEADER=xxxx
VITE_REVENUECAT_IOS_API_KEY=appl_xxxx
```

`REVENUECAT_WEBHOOK_AUTH_HEADER` is a server secret (RevenueCat dashboard → Integrations → Webhooks) checked against the `Authorization` header on incoming subscription events for the iOS app's Apple In-App Purchase billing. `VITE_REVENUECAT_IOS_API_KEY` is the client-safe RevenueCat "Apple App Store" public API key, used to configure the native purchase SDK on iOS builds only (Stripe remains the billing provider on web/Android).

The app uses:

- Postgres for courses, assignments, events, class sessions, notes, links, users, and auth token tables.
- Firebase Identity Toolkit REST APIs for email/password auth, email verification, password reset, and Google sign-in.
- SendGrid for transactional email through the Express backend.
- Configured UCD and Palomar launch programs for institution-aware signup, verified-email entitlements, and separate incoming-student consent lists.

Firebase generates primary verification and password-reset action links; the
Express API renders and delivers them through SendGrid. See
[`docs/email-delivery.md`](docs/email-delivery.md) for Firebase console,
SendGrid sender-authentication, and release verification steps.

## Development

```sh
npm install
npm run dev
```

Vite serves the React app at `http://localhost:5173` and proxies `/api` requests to the Express API on `http://127.0.0.1:3001`.

Leave `VITE_API_BASE_URL` blank for same-origin web builds. Native Capacitor builds should set it to the public API root, for example `https://app.untitledmanagementsoftware.com/api`.

Useful checks:

```sh
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
```

## End-to-End Tests

Playwright tests live in `e2e/`. Install the browser runtime once before running them locally or in a fresh CI image:

```sh
npx playwright install chromium
npm run test:e2e
```

By default, Playwright starts the Vite client on `http://127.0.0.1:5173`. To run against an already running app or deployed environment, set `PLAYWRIGHT_BASE_URL`:

```sh
PLAYWRIGHT_BASE_URL=https://dev.untitledmanagementsoftware.com npm run test:e2e
```

## Staging Deploy

Staging and production deploy as immutable Docker images published to GHCR.
Host Nginx and Certbot continue to terminate HTTPS and proxy the public domain
to the Compose web service on `127.0.0.1:8080`.

```sh
docker compose --env-file .env.docker -f compose.yaml -f compose.local.yaml --profile local-db up -d --wait db
docker compose --env-file .env.docker -f compose.yaml -f compose.local.yaml --profile tools run --rm migrate
docker compose --env-file .env.docker -f compose.yaml -f compose.local.yaml up -d api web
```

For a production-like local run, copy `.env.docker.example` to `.env.docker`
first. This path is optional; `npm run dev` remains the normal hot-reload
workflow.

The application is available at `http://127.0.0.1:8080`. Stop it and remove the
local database volume with:

```sh
docker compose --env-file .env.docker -f compose.yaml -f compose.local.yaml --profile local-db --profile tools down --volumes
```

See `docs/digitalocean-staging.md` and `docs/digitalocean-production.md` for
droplet setup, GitHub environment configuration, logs, health checks, and
automatic/manual rollback.
