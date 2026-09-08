# Row-level security

Authorization in Collab is enforced in application SQL (every read and write
carries the membership/grant checks). Row-level security (RLS) is a **second,
independent layer**: even a query that forgets its `WHERE` clause, or a bug that
reuses the wrong id, cannot reach rows outside the current actor's scope. This is
defense in depth before multiple live tenants share a database.

## The actor context (pool-safe)

RLS policies need to know who the current actor is. We carry it in a
transaction-local GUC, `collab.person_id`, set by
[`lib/db/context.ts`](../lib/db/context.ts):

```ts
withActor(db, personId, tx => tx.update(people)...)   // set_config(..., true)
```

`set_config('collab.person_id', personId, true)` is **transaction-local** (the
`true`), so it is safe on a shared connection pool — it can never leak to another
request that later reuses the connection. Policies read it with
`current_setting('collab.person_id', true)`. Every runtime data path whose table
has actor-keyed RLS policies must run through `withActor`.

## The role model

RLS with `ENABLE ROW LEVEL SECURITY` (not `FORCE`) applies to every role **except
the table owner**. That split is the design:

- **Provisioning / bootstrap — the privileged path.** Migrations, the community
  provisioning and seed scripts, and identity resolution (login, which must
  create a person before an actor context can exist) run as the table owner /
  a privileged connection, which bypasses RLS.
- **The app — the restricted path.** The running app must connect as a
  **non-owner, least-privilege role (`collab_runtime`)** with `NOSUPERUSER
  NOBYPASSRLS` and only `SELECT/INSERT/UPDATE/DELETE` granted. RLS bites only for
  this role, so the backstop protects real traffic. If the app were run as the
  owner, RLS would be bypassed — running as `collab_runtime` is what makes it
  real.

The integration tests create exactly this `collab_runtime` role and run every
app operation through it, so the suite verifies the restricted-role behavior.

## Coverage so far

- **`people`** ([migration 0003](../drizzle/network/0003_rls_people.sql)):
  reads open (names are directory-visible); inserts allowed (login creates
  people); **updates locked to the actor's own row**, and deletes denied to the
  runtime role. This backstops the profile edit, which now runs through
  `withActor`.

## Extending RLS (follow-up in M1)

Each additional table needs (a) actor-keyed policies that are a superset of the
app's own checks (so correct queries keep working) and (b) its runtime data paths
routed through `withActor`. Notable cases:

- **`person_identities`** (provider subjects — the most sensitive table): own-row
  visibility conflicts with today's login lookup and the invitation existence
  check, so those reads must move to the privileged path or a `SECURITY DEFINER`
  function before this table's RLS can be locked down.
- **`role_grants`, `person_community_memberships`,
  `organization_community_memberships`, `community_invitations`,
  `membership_audit`**: scope visibility to communities where the actor has an
  active membership (or admin grant); route `membership.ts` and the directory
  reads through `withActor` and update the integration suites to set context.
