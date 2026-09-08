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

## Cross-table checks without recursion

Membership-scoped policies must ask "is the actor an admin of this community?",
which reads `role_grants` and `person_community_memberships` — tables that are
themselves under RLS. Referencing an RLS table inside its own (or another's)
policy risks infinite recursion. To avoid it, the checks live in **`SECURITY
DEFINER` helper functions** ([migration 0004](../drizzle/network/0004_rls_relational.sql))
that run as the table owner and therefore bypass RLS internally:
`collab_actor()`, `collab_is_active_member(community)`,
`collab_is_community_admin(community)`, and `collab_can_admin_org(org)`.

Two subtleties the policies account for:

- **`SELECT ... FOR UPDATE` also enforces the UPDATE policy's `USING` clause.**
  Admin operations lock the community row, so `communities` carries a lock-only
  UPDATE policy (`USING (true) WITH CHECK (false)`): the row can be locked, but
  the runtime role still cannot alter catalog rows.
- **Accepting an invitation** runs under the *accepter's* context but must verify
  the *issuer* is still an admin — a cross-actor read RLS would hide. A dedicated
  `SECURITY DEFINER` helper (`collab_person_is_admin_locked`) performs that
  lock-and-check, bypassing RLS for that one integrity read.

## Coverage so far

- **`people`** ([0003](../drizzle/network/0003_rls_people.sql)): reads open;
  inserts allowed (login); updates locked to the actor's own row; deletes denied.
- **`person_community_memberships`, `role_grants`, `community_invitations`**
  ([0004](../drizzle/network/0004_rls_relational.sql)): visible to the row's own
  person or an admin of the community; writes limited the same way.
- **`organization_community_memberships`**: visible to active members of the
  community (the directory); no runtime writes.
- **`organization_affiliations`**: visible to the affiliated person; no runtime
  writes yet (M2).
- **`organizations`**: profiles readable; updatable only by a Business Admin of
  the org (`collab_can_admin_org`); create/delete provisioning-only.
- **`membership_audit`**: readable by community admins; insertable by an admin or
  by the actor recording their own action; update/delete blocked by both the
  immutability trigger (0002) and the absence of a policy.
- **Catalog (`communities`, `networks`, `regions`, `community_regions`)**:
  readable by the app; only the privileged provisioning path may change it.

Every runtime data path in `repository.ts`, `membership.ts`, and the workspace
loader now runs through `withActor`, so these policies apply to real traffic.

## Still deferred

- **`person_identities`** (provider subjects): login must look up an identity
  *before* an actor context exists, and the invitation flow checks a recipient's
  identity — both cross the own-row boundary. Locking this table down needs those
  reads moved to the privileged path (a separate login/provisioning connection)
  or a `SECURITY DEFINER` lookup. It has no enumeration endpoint today, so
  app-level scoping holds until then.
