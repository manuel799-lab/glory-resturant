# Vercel deployment

This project uses a Vite-built React frontend and an Express backend. Vercel deploys the Express app as one Node.js function.

## Vercel project settings

- Framework Preset: **Express** (not Vite)
- Root Directory: `./`
- Build Command: `npm run build`
- Output Directory: leave at the framework default; do not override it to `dist`
- Node.js: use a supported current LTS version

The Vite build writes static frontend files to `public/`, which Vercel serves through its CDN. The root `server.ts` is the Express entry point. Do not add an `api/` catch-all wrapper; Vercel detects and deploys the Express app directly.

## Required production environment variables

Set these in Vercel → Project → Settings → Environment Variables:

- `DATABASE_URL`: Neon PostgreSQL connection string
- `SESSION_SECRET`: private random value of at least 32 characters
- `COOKIE_SECURE`: `true`
- `APP_ORIGIN`: exact production URL, for example `https://glory-resturant-45bs.vercel.app`
- `PGSSL`: `true` (the app also enables SSL automatically on Vercel)

Apply them to the **Production** environment. Do not expose secrets in frontend-prefixed variables or commit them to GitHub.

`APP_ORIGIN` must match the browser's address exactly, including `https://` and without a trailing slash. It is used to validate requests that change data and to set the allowed origin.

## Database

The production Neon database must have the tables in `db/schema.sql`. Run that schema once in the Neon SQL Editor before registration. The `/api/health` endpoint runs `SELECT 1`, so it confirms the database connection, not that every table exists.

## First verification

1. Open `/api/health` on the production domain. Expected response: `{"ok":true,"database":"connected"}`.
2. Register a test business using an email not already registered.
3. Sign out and sign back in.
4. Create one test expense and one test sale.
5. Register a second test business in a separate browser session and verify it cannot see the first business's records.

Do not use real business data until registration, login, CRUD, and tenant-isolation checks pass. This baseline is not a security certification.
