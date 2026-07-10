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
VITE_FIREBASE_API_KEY=xxxx
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
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

Useful checks:

```sh
npm run lint
npx tsc --noEmit
npm run build
```
