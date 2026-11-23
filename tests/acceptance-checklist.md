# Release acceptance checklist

Run these after configuring PostgreSQL and starting the app. Use two different test accounts/businesses.

## Authentication
- [ ] Register a new owner with a valid email and password of at least 10 characters.
- [ ] Verify a business workspace is created and the user is signed in.
- [ ] Sign out and sign back in.
- [ ] Verify incorrect passwords are rejected and repeated login attempts are rate limited.
- [ ] Verify an expired/invalid cookie is rejected.

## Tenant isolation (critical)
- [ ] Create Business A and add one expense, one sale, one job, one inventory item and one supplier.
- [ ] Register Business B in a separate browser session and verify its bootstrap returns no Business A records.
- [ ] Attempt to update/delete a Business A record using Business B's cookie and record UUID; expect 404.
- [ ] Verify Business B cannot change Business A settings or list Business A team members.
- [ ] Revoke a membership row and verify the next authenticated request is rejected.

## Business operations
- [ ] Create, edit and delete each supported record type.
- [ ] Reject negative or non-finite money/quantity values.
- [ ] Reject paidAmount greater than sale amount.
- [ ] Verify total revenue, total expenses, net profit and outstanding balances.
- [ ] Verify inventory alert when quantity is at or below reorder level.
- [ ] Change business currency and verify dashboard formatting.
- [ ] Export CSV files and inspect escaping of commas, quotes and newlines.

## Team and permissions
- [ ] Owner can view team and create invitations.
- [ ] Invited email must sign in with the matching account before accepting.
- [ ] Invitation expires after seven days and cannot be reused.
- [ ] Viewer cannot create, edit or delete records.
- [ ] Staff can manage records but cannot change business settings or invite members.
- [ ] Manager can manage records but cannot administer workspace settings or invitations.

## Deployment checks
- [ ] HTTPS enabled and COOKIE_SECURE=true.
- [ ] APP_ORIGIN matches the exact public origin.
- [ ] DATABASE_URL and SESSION_SECRET exist only as server environment variables.
- [ ] Database backup and restore procedure tested.
- [ ] Production logs, error monitoring and database connection limits configured.
