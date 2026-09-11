# Local database demo

This demo uses the backend workspace, server actions, and PostgreSQL adapters. Membership is free for members; the organization pays for the platform. Payment collection is not configured.

## Setup in PowerShell

```powershell
docker run --name collab-local-demo -e POSTGRES_PASSWORD=local-demo-owner -e POSTGRES_DB=collab_demo -p 127.0.0.1:55440:5432 -d postgres:16-alpine
$env:COLLAB_DEMO_DATABASE_URL='postgres://postgres:local-demo-owner@127.0.0.1:55440/collab_demo'
npm run demo:seed
```

Create a runtime role once so row-level security is exercised:

```powershell
@'
create role collab_demo_runtime login password 'local-demo-runtime' nosuperuser nobypassrls;
grant usage on schema public to collab_demo_runtime;
grant select, insert, update, delete on all tables in schema public to collab_demo_runtime;
'@ | docker exec -i collab-local-demo psql -U postgres -d collab_demo
```

Start the workspace:

```powershell
$env:DATABASE_URL='postgres://collab_demo_runtime:local-demo-runtime@127.0.0.1:55440/collab_demo'
$env:NEXT_PUBLIC_BACKEND_ENABLED='1'
$env:COLLAB_LOCAL_DEMO='1'
$env:COLLAB_DEMO_PASSWORD='collab-local-demo-only'
$env:AUTH_SECRET='local-demo-auth-secret-change-for-any-other-environment'
$env:AUTH_URL='http://localhost:3011'
npx next dev -H 127.0.0.1 -p 3011
```

Use role `admin` or `member` and the configured demo password. Credentials are enabled only in development, with explicit opt-in, a password of at least 16 characters, and a loopback database named `collab_demo`. Production uses Google sign-in. These sample secrets are for this disposable local database only.

Seeding is idempotent: stable IDs preserve edits and content on subsequent runs. Docker stop/start preserves data. Removing the container deletes this demo's data, so reserve that for an intentional reset.

## Walkthrough

- Admin (`local-demo-admin`): publish announcements, organize events, review claims, manage invitations and memberships, inspect audit history.
- Member (`local-demo-member`): edit River Street Studio, claim Market Square Cafe, respond to the sample request, RSVP to the sample event, comment on announcements.
- Request an introduction using the other account's ID, then sign out and accept as that account. Contact appears after mutual acceptance. Connections support private notes and referrals.
- Save a request or offer as a private draft, then publish it explicitly. Responses remain private unless the responder shares them.
- Saving a business profile refreshes its directory listing automatically.

The older prototype remains available with `NEXT_PUBLIC_BACKEND_ENABLED` unset. Production migration, reconciliation, billing implementation, verified operators, and policy approval remain separate launch work.
