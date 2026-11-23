# Glory's Business Dashboard

A multi-tenant business management dashboard for independent businesses. Each signup creates a separate business workspace. Every record query is scoped on the server by the authenticated session's `business_id`; a user cannot select another tenant by changing a request parameter.

## Included

- Email/password signup and sign-in with bcrypt password hashing and signed, HTTP-only session cookies.
- One business workspace created at signup, with configurable business name, type, country, currency, timezone and tax rate.
- Dashboard KPIs, six-month revenue/expense chart and low-stock alerts.
- Expenses, revenue, jobs, inventory and supplier CRUD.
- Revenue collected/outstanding calculations and CSV exports.
- Team membership roles and invitation-link creation (email delivery is not configured; the owner copies the generated link).
- Tenant-scoped audit entries for record create/update/delete.
- PostgreSQL schema and indexes.
- Responsive desktop/mobile UI.

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer

## Local setup

1. Create a PostgreSQL database, e.g. `glory_dashboard`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and a random `SESSION_SECRET` of at least 32 characters.
3. Apply the schema: `psql "$DATABASE_URL" -f db/schema.sql`.
4. Install dependencies: `npm install`.
5. Start frontend and API: `npm run dev`.
6. Open `http://localhost:5173`.

For production, run `npm run build`, set `NODE_ENV=production`, configure HTTPS, set `COOKIE_SECURE=true`, set `APP_ORIGIN` to the exact public origin, and run `npm start`. The Express server serves the built frontend from `dist`.

## Deploying

Deploy this repository to a Node.js host that supports PostgreSQL. Add the `.env.example` values as server environment variables. Apply `db/schema.sql` once to the production database before starting the app. Do not expose `DATABASE_URL` or `SESSION_SECRET` in frontend build-time variables.

## Important security and product notes

- Tenant isolation is enforced in server-side SQL using the business ID from the signed session, not a business ID supplied by the browser.
- Passwords are hashed with bcrypt (12 rounds). Session cookies are HTTP-only, SameSite=Lax, and configurable as Secure.
- This is a first deployable baseline, not a completed independent security certification. Before handling sensitive or regulated data, add rate limiting, email verification, password reset, CSRF protection appropriate to the chosen hosting topology, automated backup/restore, monitoring, and a professional penetration test.
- Team invitation creation returns a one-time invitation URL for manual sharing. SMTP/email delivery is intentionally not configured. Invite acceptance currently requires the invited person to already have an account and be signed in with the matching email address.
- The initial release uses one active business workspace per login session. Memberships support team access; a multi-business workspace switcher is not included in this baseline.
- CSV export is generated in the browser from the currently loaded records. Bootstrap returns up to 2,000 recent records per business; add cursor pagination before very large datasets.
- Existing AppDeploy records are not automatically migrated. The prior app used a different shared-table model; migrate data only after mapping and validating each record's true business ownership.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/bootstrap`
- `POST /api/records`, `DELETE /api/records/:type/:id`
- `PUT /api/business`
- `GET /api/team`, `POST /api/team/invitations`, `POST /api/team/accept`

All routes except health, registration, login, logout and invitation acceptance require authentication. All business-data operations use the session's tenant ID.

## Quick local run with Docker

1. Install Docker Desktop or Docker Engine with Compose.
2. Change `SESSION_SECRET` in `docker-compose.yml` to a random value of at least 32 characters.
3. Run `docker compose up --build`.
4. Open `http://localhost:4000`.

The Compose file is for local development only. Replace the example database password and configure HTTPS, a secure cookie, backups and production secrets before public deployment.


## Render deployment preparation

This repository includes a `render.yaml` Blueprint for a free Render web service and a free Render PostgreSQL database. The service builds from the included Dockerfile. On startup, it applies `db/schema.sql` using the `npm run db:migrate` script before starting Express. The public origin is derived from Render's `RENDER_EXTERNAL_HOSTNAME` when `APP_ORIGIN` is not explicitly set.

To prepare deployment:

1. Push this project to a GitHub repository.
2. In Render, choose **New → Blueprint** and connect that repository.
3. Review the two free resources and approve creation. The Blueprint does not deploy until you approve it.
4. After the service is created, check `/api/health`, then complete the acceptance checklist using two separate business accounts.
5. Before entering real business or financial data, upgrade PostgreSQL to a paid plan with backups. Render's free PostgreSQL databases are limited to 1 GB, have no backups, and expire after 30 days. Free web services also spin down after 15 minutes of inactivity.

The Blueprint sets `autoDeploy: false` so later Git pushes do not automatically replace the running app without an intentional deploy.


## Vercel deployment

For Vercel, use the root `server.ts` Express entry point. Vite builds the frontend into `public/`, which Vercel serves as static assets. Select the Express Framework Preset and follow `VERCEL_DEPLOYMENT.md`. Do not recreate an `api/` catch-all function.


## Vercel deployment

For Vercel, use the Vite framework preset and the `public` output directory. The frontend is served as static files and `api/[...all].ts` exposes the Express API. Follow `VERCEL_DEPLOYMENT.md` for environment variables and verification.
