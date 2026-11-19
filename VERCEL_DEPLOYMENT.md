# Vercel deployment notes

This project uses a Vite-built React frontend, an Express API exposed through a Vercel catch-all function, and PostgreSQL.

## Required Vercel environment variables

- `NODE_ENV=production`
- `SESSION_SECRET` = a private random value of at least 32 characters
- `DATABASE_URL` = PostgreSQL connection string from the chosen database provider
- `PGSSL=true`
- `COOKIE_SECURE=true`
- `APP_ORIGIN` = the deployed site's canonical HTTPS origin (for example, `https://your-project.vercel.app`)

Do not commit real secrets or database credentials to GitHub.

## Database setup

Create a PostgreSQL database with your chosen provider. Run `npm run db:migrate` once against that database using the provider's connection string, or execute `db/schema.sql` in the provider's SQL editor. Vercel functions do not run migrations automatically.

## Deployment

Import the repository into Vercel with the project root as the Root Directory. The build command is `npm run build` and the output directory is `dist`. Add the environment variables above before deploying.

## Important

The first deployment should be treated as a staging deployment. Verify registration, login, logout, session persistence, creating and editing records, tenant isolation, team invitations, and database health before inviting real customers. A successful frontend build alone does not prove that the API or database works.
