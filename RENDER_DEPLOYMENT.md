# Render deployment guide — Glory's Business Dashboard

## What is prepared

- A Render Blueprint (`render.yaml`) defining one Docker web service and one PostgreSQL database.
- A generated `SESSION_SECRET`; no credential is committed to source control.
- HTTPS-only session cookies (`COOKIE_SECURE=true`).
- Same-origin protection and invitation URLs that use Render's public hostname.
- A startup migration command that applies `db/schema.sql` before Express starts.
- A database-aware `/api/health` endpoint for Render health checks.
- Automatic deploys from Git are disabled in the Blueprint; deployments remain intentional.

## Deploy through Render

1. Create a private GitHub repository and push the contents of this project to its root.
2. Sign in to Render and select **New → Blueprint**.
3. Connect the GitHub repository containing `render.yaml`.
4. Review the Blueprint. It creates a free web service and a free PostgreSQL database. Approve only after reviewing the resource plans and limits.
5. Wait for the first build and deploy to finish. Render will build the Dockerfile, run the schema migration on container startup, and start the Express server.
6. Open the service URL ending in `.onrender.com` and verify `/api/health` returns `{"ok":true,"database":"connected"}`.
7. Run the release acceptance checklist with two separate business accounts before using real data.

## Environment variables

The Blueprint supplies `NODE_ENV`, `DATABASE_URL`, `SESSION_SECRET`, `COOKIE_SECURE`, and `PGSSL`. The app derives its public origin from Render's `RENDER_EXTERNAL_HOSTNAME`. If deploying outside Render, set `APP_ORIGIN` to the exact HTTPS origin, for example `https://your-service.onrender.com`.

Never put `DATABASE_URL` or `SESSION_SECRET` in frontend variables or commit their values to Git.

## Free-tier warning — read before storing real business data

Render's free web service spins down after 15 minutes without traffic and can take about a minute to wake. More importantly, Render's free PostgreSQL database is limited to 1 GB, has no backups, and expires 30 days after creation. After expiry, there is a 14-day upgrade grace period before deletion. The free database is appropriate only for a short-lived test/demo. Upgrade the database to a paid plan with backups before entering real financial or customer records. See Render's current [free-tier limitations](https://render.com/docs/free).

## Local commands

```bash
npm install
cp .env.example .env
# Edit DATABASE_URL and SESSION_SECRET in .env
npm run db:migrate
npm run dev
```

Production build and start:

```bash
npm run build
NODE_ENV=production COOKIE_SECURE=true APP_ORIGIN=https://your-service.onrender.com npm start
```

The local machine used for this preparation did not have Docker or PostgreSQL installed, and outbound DNS access to the npm registry was unavailable. Therefore dependency installation, TypeScript compilation, database migration execution, and end-to-end acceptance tests remain to be run in a network-enabled environment or by Render's first build.
