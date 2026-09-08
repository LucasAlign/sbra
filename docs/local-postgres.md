# Local Postgres & the integration suite

The unit tests (`npm run test:network`) need nothing external. The **integration
suite** (`npm run test:network:integration`) exercises real SQL — constraints,
transactions, advisory locks, and the restricted `collab_runtime` role — so it
needs a throwaway Postgres. This is the dev-DB runway from M0.

> The suite refuses to run against anything but a local, disposable database: it
> asserts the host is `localhost`/`127.0.0.1` and the database name is
> `collab_test`. Never point `COLLAB_TEST_DATABASE_URL` at real data.

## One-time: start a disposable database (Docker)

```bash
docker run -d --name collab-pg-test \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=collab_test \
  -p 55432:5432 \
  postgres:16-alpine
```

Port `55432` avoids colliding with a local Postgres on `5432`. The container is
disposable — `docker rm -f collab-pg-test` throws it away.

## Run the integration suite

```bash
export COLLAB_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55432/collab_test"
npm run test:network:integration
```

On Windows PowerShell:

```powershell
$env:COLLAB_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:55432/collab_test"
npm run test:network:integration
```

The suite migrates `./drizzle/network`, creates the least-privilege
`collab_runtime` role, and runs every check under that role — the same posture
the app will run under. Migrations and role creation are idempotent.

The suite seeds fixed-id fixtures, so **each run needs a clean database.** Reset
between runs (the role lives at the cluster level and survives this, so you don't
recreate the container):

```bash
docker exec collab-pg-test psql -U postgres \
  -c "DROP DATABASE collab_test WITH (FORCE);" -c "CREATE DATABASE collab_test;"
```

If `COLLAB_TEST_DATABASE_URL` is unset, the integration tests **skip** (they do
not fail), so `npm run test:network:integration` is safe to run anywhere.

## Tear down

```bash
docker rm -f collab-pg-test
```

## CI

`.github/workflows/ci.yml` runs the typecheck and both suites on every push and
PR. It starts a `postgres:16` service, sets `COLLAB_TEST_DATABASE_URL` to it, and
so runs the integration suite on a disposable database automatically — no secrets
and no shared state.
