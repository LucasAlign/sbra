# Network foundation: first implementation

The additive schema in `lib/db/network-schema.ts` separates people, provider identities, canonical organizations, affiliations, person/community memberships, organization/community memberships, regions, communities, and scoped administrative grants. Berks and partner branding live in `lib/network/catalog.ts`; the prototype switcher uses a compatibility projection of that catalog and rejects unknown IDs.

`lib/network/permissions.ts` defines default-deny decisions from trusted facts. Community administration requires active membership plus a scope-specific grant; business administration requires active affiliation plus a business grant. Regional and platform administration do not inherit private community or relationship access. Public reads mean an already explicitly public projection, not permission to return arbitrary rows.

## Apply to a development database

Back up any existing database first and review `drizzle/network/0000_wet_makkari.sql`. With `DATABASE_URL` set:

```sh
npm run db:network:migrate
npm run db:network:seed
```

The migration creates only new foundation tables; it does not backfill, alter, or remove legacy records. Seeding is transactional, repeatable, and preserves existing configuration. Persisted communities start as drafts pending verified operators, even though the demo catalog displays active communities. No accounts, affiliations, memberships, or role grants are inferred from old rosters. There is no HTTP provisioning endpoint for this catalog.

Use `npm run db:network:generate` for subsequent foundation schema changes. Do not mix this migration stream with a generated initial migration of the full legacy schema. Database constraints enforce valid role scopes, valid membership states, unique memberships and provider subjects, and same-network community/region links. Organization deletion cannot cascade into people.

## Live identity and community workspace

With `NEXT_PUBLIC_BACKEND_ENABLED=1`, the app opens `NetworkWorkspace`. Google authentication supplies the provider subject in the signed session; the server resolves it to a stable person ID, serializing concurrent first requests. Email and roster matches never establish identity or permissions. Existing sessions from the old auth configuration must sign in again.

The live workspace shows the person's own memberships, profile-name editor, and a community directory paginated at 25 organizations. Queries check current active membership and active community state and project only organization ID, name, kind, and description. They do not return rosters, dues, contacts, or relationship records. A separate organization-description action requires both active affiliation and an unexpired, unrevoked Business Admin grant in the same SQL update. No client-supplied person ID is accepted by the new server actions.

New people start without memberships or grants. The initial catalog command deliberately keeps persisted communities in draft. No old members or permissions are inferred automatically.

## Invitations and membership administration

Apply the second network migration before using these controls. For the first administrator, verify the operator's authority and intended recipient, have that person sign in and share their Collab account ID, then run:

```sh
npm run community:provision -- <community-id> <person-id> --operator-verified
```

This controlled command works only on a draft community with no prior community-admin appointments. It activates that community, creates the person's active membership and scoped Community Admin grant, and records a provisioning audit event. It cannot appoint an admin in an already active community. No command was run against an application database during development.

Community Admins see a paginated member roster and can create or revoke invitations. Recipients use the invitation inbox in their signed-in workspace to accept. Invitations are addressed to existing provider-linked person IDs, expire after seven days, are single-use, and grant only ordinary community membership. No email is sent, and no business affiliation or administrative permission is inferred. Sending email invitations to people without accounts is a later workflow.

Acceptance rechecks the recipient, community status, expiry, revocation, and issuer's current active membership and administrative grant. Transactions serialize community membership changes and lock authorization rows. Suspended members must be restored through the roster; an invitation cannot bypass suspension. Ordinary member suspension affects only the selected community. These controls reject administrator-membership changes, including self-suspension, so a community cannot lose its last administrator through this workflow. A separate administrator transfer workflow remains to be built.

Invitation creation, revocation, acceptance, and member suspension/restoration record actor, target, community, action, and timestamp in `membership_audit` within the same transaction. The application exposes no audit modification action; database-level audit immutability and an audit viewer remain future work. Lists are bounded: 25 roster members per page and the oldest 100 pending invitations.

The existing prototype remains seed-only when the flag is unset. Every legacy server action now rejects, and `/api/seed` returns HTTP 410 without database access. Live referrals, events, and posts are unavailable until their ownership and participant relationships are migrated; this avoids making unscoped historical records accessible through the new login.

## Verification and remaining cutover

`npm run test:network` runs ten tests for scoped permissions, identity parsing, validation, invalid community lookup, and closed legacy endpoints. `npm run test:network:integration` exercises a fresh local Postgres database named `collab_test` using `COLLAB_TEST_DATABASE_URL`; it skips if that variable is absent. Use a disposable database: the suite creates fixture records and a restricted `collab_runtime` role. It verifies migration replay, concurrent identity resolution, database constraints, private-field exclusion, cross-community denial, shared profile updates, and revocation with a non-superuser role. The suite expects a fresh database each run.

The integration suite also verifies invitation recipient binding, expiry, revocation, concurrent single-use acceptance, cross-community admin denial, issuer revocation, suspension/restoration, administrator protection, and transactional audit recording.

This is still Phase 0. Remaining work includes private import staging, verified business claims, administrator transfers, content ownership/publication tables, legacy backfill, audit records for other administrative mutations, and row-level policies. Current application queries enforce access, but database RLS is not yet enabled. The tests do not constitute an end-to-end Google OAuth verification or a full production security review. Only a disposable local test database was migrated during this implementation.
