# UMS App React

Complete React + Express port of Untitled Management Software.

The frontend is intentionally cloned from `UMS-App/src` so the app looks and behaves the same. The backend keeps the same API contract while splitting the Express server into smaller modules:

- `server/config.ts` loads environment configuration.
- `server/db.ts` owns the Postgres pool.
- `server/actions.ts` maps app actions to SQL.
- `server/routes/actions.ts` serves `/api/actions/:name`.
- `server/routes/email.ts` serves `/api/email/send`.
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
```

The app uses:

- Postgres for courses, assignments, events, class sessions, notes, links, users, and auth token tables.
- Firebase Identity Toolkit REST APIs for email/password auth, email verification, password reset, and Google sign-in.
- SendGrid for transactional email through the Express backend.

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

For the DigitalOcean staging host, build the client and run the API on the droplet, with Nginx serving `dist/` and proxying `/api` to `127.0.0.1:3001`.

```sh
npm ci
npm run build
npm start
```

Set the staging origin to your public URL:

```sh
APP_ORIGIN=https://dev.untitledmanagementsoftware.com
APP_ORIGINS=https://dev.untitledmanagementsoftware.com
APP_BASE_URL=https://dev.untitledmanagementsoftware.com
PORT=3001
```

Stripe webhooks should point to `https://dev.untitledmanagementsoftware.com/api/billing/webhook`.
