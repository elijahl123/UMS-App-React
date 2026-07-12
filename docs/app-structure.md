# App Structure Reference

This document is a quick orientation guide for future tasks in the UMS React app. It explains what the app does, how the frontend and backend are arranged, and where common changes usually belong.

## What The App Is

Untitled Management Software is a student-focused management app for tracking courses, homework, class schedules, calendar events, notes, account details, and billing. The current app is a React + Express port with:

- A Vite React frontend served from `app/`.
- An Express API served from `server/`.
- Postgres storage for app data.
- Firebase Identity Toolkit REST APIs for authentication.
- Stripe for subscriptions and payment methods.
- SendGrid for transactional email.

In development, `npm run dev` starts both Vite and the Express server. Vite serves the UI at `http://localhost:5173` and proxies `/api` calls to the API on `http://127.0.0.1:3001`.

## Top-Level Layout

```text
UMS-App-React/
  app/                    React application code
  components/ui/          Shared shadcn-style UI primitives
  docs/                   Project documentation
  lib/                    Shared non-app-specific frontend utilities
  migrations/             SQL migrations for Postgres
  public/                 Static assets served by Vite
  server/                 Express API, DB access, billing, email, migrations
  deploy/                 Staging deployment examples/scripts
  package.json            Scripts and dependencies
  vite.config.ts          Vite, Vitest, alias, and dev proxy config
```

There are two frontend entry files:

- `main.tsx` at the repo root imports and renders `app/app.tsx`.
- `app/main.tsx` also renders the app and appears to be kept from the original app layout. Check both before changing entry behavior.

## Frontend Structure

The main React app lives in `app/`.

```text
app/
  app.tsx                 Router tree and app providers
  components/             App-specific layout, guards, widgets, calendar pieces
  data/                   Shared frontend types, mappers, color helpers, mock data
  lib/
    api/                  Fetch client and load/mutate hooks
    auth/                 Firebase auth context, REST wrapper, Google OAuth helper
    billing/              Stripe billing client helpers
  pages/                  Route-level screens
  test/                   Test helpers, setup, fixtures, mocks
  __tests__/              Vitest suites for routes, pages, components, data
```

### Routing

Routing is defined in `app/app.tsx` with `HashRouter`. Public routes are:

- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/verify-email`

Authenticated routes are wrapped by `ProtectedRoute`. Most product routes are also wrapped by `SubscriptionRoute`, then rendered inside `AppLayout`:

- `/` -> dashboard
- `/calendar`
- `/class-schedule`
- `/homework`
- `/notes`
- `/notes/new`
- `/notes/:noteId`
- `/courses`
- `/courses/:courseId`
- `/account`

`/billing` is protected by login, but sits outside `SubscriptionRoute` so users can subscribe before accessing the main product.

### Layout And Navigation

`app/components/AppLayout.tsx` provides the authenticated shell. It renders:

- A persistent sidebar on desktop.
- A mobile overlay sidebar toggled by a floating menu button.
- The current route via `Outlet`.

`app/components/Sidebar.tsx` owns primary navigation, course sub-navigation, late-homework badge counts, account links, and logout behavior. It loads courses and assignments directly through `useLoadAction`.

### UI Components

Generic reusable primitives live in `components/ui/`. They are imported with the `@` alias, for example:

```ts
import { Button } from '@/components/ui/button';
```

App-specific widgets live under `app/components/widgets/`, such as assignment, event, course, link, class-session dialogs, dashboard widgets, and the rich text editor.

Calendar-specific UI lives under `app/components/calendar/`.

## Frontend Data Flow

The frontend talks to the backend through named actions:

1. A page or component calls `useLoadAction` or `useMutateAction` from `app/lib/api/hooks.ts`.
2. Those hooks call `callAction` in `app/lib/api/client.ts`.
3. `callAction` posts JSON to `/api/actions/:name`.
4. The server maps `:name` to SQL in `server/actions.ts`.
5. Rows return to the frontend.
6. Pages usually map database-shaped rows into frontend types with `app/data/mappers.ts`.

Example action names include:

- Courses: `loadCourses`, `createCourse`, `updateCourse`, `deleteCourse`
- Assignments: `loadAssignments`, `createAssignment`, `updateAssignment`, `deleteAssignment`
- Class sessions: `loadClassSessions`, `createClassSession`, `updateClassSession`, `deleteClassSession`
- Events: `loadEvents`, `createEvent`, `updateEvent`, `deleteEvent`
- Notes: `loadNotes`, `createNote`, `updateNote`, `deleteNote`
- Course links: `loadCourseLinks`, `createCourseLink`, `updateCourseLink`, `deleteCourseLink`

Most product actions require a `userId` param from `useAuth()`. Keep user scoping explicit whenever adding or editing actions.

## Data Types And Mapping

Frontend domain types live in `app/data/types.ts`:

- `Course`
- `CourseLink`
- `Assignment`
- `ClassSession`
- `Note`
- `CalendarEvent`
- `AppUser`

Database rows use snake_case and numeric IDs. Frontend types use camelCase and string IDs. Conversion happens in `app/data/mappers.ts`. When adding a field to Postgres-backed data, update:

- The SQL query in `server/actions.ts`.
- The matching DB row interface in `app/data/mappers.ts`.
- The exported frontend type in `app/data/types.ts`.
- Any pages/widgets that display or mutate the field.
- Tests and fixtures if behavior changes.

## Backend Structure

The Express API lives in `server/`.

```text
server/
  index.ts                Starts the API server
  app.ts                  Creates the Express app and wires middleware/routes
  config.ts               Reads environment variables
  db.ts                   Creates the Postgres pool
  actions.ts              Named app actions mapped to SQL
  billing.ts              Stripe and billing database helpers
  errors.ts               Shared API error helpers
  migrate.ts              Migration runner
  routes/
    actions.ts            POST /api/actions/:name
    billing.ts            Stripe config/status/subscription/payment routes and webhook
    email.ts              SendGrid email route
```

`server/app.ts` configures CORS, the Stripe webhook raw-body route, JSON parsing, and these route groups:

- `/api/actions`
- `/api/billing`
- `/api/email`
- `/api/health`

The general action endpoint is intentionally thin. Most app CRUD behavior is in `server/actions.ts`.

## Database Shape

SQL migrations live in `migrations/` and are applied by `npm run migrate`.

Core product tables include:

- `courses`
- `assignments`
- `class_sessions`
- `events`
- `notes`
- `course_links`

Auth comes from Firebase, but the Firebase `localId` is passed through the app as `user.id`. Product data is scoped with `user_id` on `courses`, `events`, `notes`, and `course_links`. Assignments and class sessions are scoped indirectly through their course relationship.

Billing uses:

- `user_subscriptions`

That table maps Firebase users to Stripe customer/subscription IDs and stores subscription status, price, current period end, and cancellation state.

## Authentication

Auth state is owned by `app/lib/auth/AuthContext.tsx`.

Important details:

- Firebase REST helpers live in `app/lib/auth/firebaseRest.ts`.
- Google sign-in helpers live in `app/lib/auth/googleOAuth.ts`.
- Sessions are stored in `localStorage` under `schoolwork_auth_session`.
- `AuthProvider` exposes the current `user`, login/signup/logout, profile updates, password flows, email verification, and Google sign-in.
- Protected app data requests should pass `user?.id` as `userId`.

The app uses hash routing, so auth redirect and out-of-band Firebase links need to preserve the correct `/#/...` route.

## Billing

Billing is split between frontend helpers in `app/lib/billing/client.ts`, the billing page at `app/pages/BillingPage.tsx`, API routes in `server/routes/billing.ts`, and shared server helpers in `server/billing.ts`.

The main API route group is `/api/billing`:

- `GET /config`
- `GET /status`
- `GET /status/refresh`
- `POST /create-subscription`
- `POST /cancel-subscription`
- `POST /resume-subscription`
- `POST /update-subscription`
- `GET /payment-method`
- `POST /payment-method/setup-intent`
- `POST /payment-method`
- `POST /api/billing/webhook`

`SubscriptionRoute` gates most authenticated product routes based on billing status.

## Styling And Assets

Global styles live in `index.css`, with Tailwind configured by `tailwind.config.js` and PostCSS by `postcss.config.cjs`.

Static assets live in `public/`. Existing app illustrations and the logo are under:

```text
public/storages/zwD6Awu5SX/static/
```

Course color helpers live in `app/data/courseColors.ts`.

## Common Change Map

Use this as a quick guide for where to start:

- Add or change a page: `app/pages/`, then update routes in `app/app.tsx`.
- Add navigation: `app/components/Sidebar.tsx`.
- Add app shell behavior: `app/components/AppLayout.tsx`.
- Add a dialog or dashboard widget: `app/components/widgets/`.
- Add a backend CRUD action: `server/actions.ts`, then call it through `useLoadAction` or `useMutateAction`.
- Add a database field/table: create a migration in `migrations/`, then update server SQL, mappers, types, UI, and tests.
- Add auth behavior: `app/lib/auth/AuthContext.tsx` and related auth helpers.
- Add billing behavior: `app/lib/billing/client.ts`, `app/pages/BillingPage.tsx`, `server/routes/billing.ts`, and `server/billing.ts`.
- Add reusable UI primitives: `components/ui/`.
- Add tests: `app/__tests__/` and shared helpers in `app/test/`.

## Useful Commands

```sh
npm install
npm run dev
npm run migrate
npm run lint
npm run test
npm run build
```

`npm run build` runs TypeScript project build checks and then creates the Vite production bundle.

## Notes For Future Tasks

- Keep `userId` scoping in mind for all product data changes.
- Keep frontend IDs as strings unless a local pattern requires otherwise.
- Prefer the existing named-action pattern before adding bespoke REST routes for normal CRUD.
- Use bespoke routes for integration-heavy workflows like billing and email.
- When data comes from Postgres, update mappers instead of reshaping rows ad hoc in pages.
- Tests are already set up with Vitest, jsdom, Testing Library, and shared test helpers.
