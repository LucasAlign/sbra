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
- **`INSERT ... ON CONFLICT DO UPDATE` also needs the target row to be visible
  through the `SELECT` policy.** When a vouching admin writes another person's
  affiliation (whose `SELECT` is scoped to its owner), an upsert is blocked even
  with no real conflict. Those idempotent writes (claim approval's affiliation,
  listing overrides) are therefore done as **update-then-insert**, so each
  statement satisfies its own admin write policy and never needs a cross-actor
  read.

## The claim-approval writes ([0006](../drizzle/network/0006_rls_claims.sql))

Approving a business claim (operator vouch) grants the claimant a `business_admin`
role and an active affiliation — writes the *reviewing admin* performs on the
*claimant's* behalf. Two helpers make that expressible without weakening the
per-owner policies:

- `collab_admins_org_community(org)` — is the actor a community admin of any
  community the org is actively listed in? `role_grants` `INSERT`/`UPDATE` and
  `organization_affiliations` `INSERT`/`UPDATE` allow the write when this holds
  (org-scoped grants have no `community_id` for a policy to key on directly).
- The claim itself (`claim_requests`) is visible to its filer or a community
  admin; a member files only their own (`person_id = collab_actor()`); the admin
  decides. Import-staging tables (`import_batches`, `source_records`,
  `external_entity_links`, `merge_history`) are entirely admin-private to the
  owning community via `FOR ALL` policies — there is no member-facing projection.

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
- **`claim_requests`, `community_listing_overrides`, and the import-staging
  tables** ([0006](../drizzle/network/0006_rls_claims.sql)): see the claim-approval
  section above.
- **`person_identities`** ([0006](../drizzle/network/0006_rls_claims.sql)): no
  general `SELECT` — a signed-in actor may read only its own rows; inserts are
  open (login/linking). Login resolves a subject *before* an actor context exists,
  so it reads through the `SECURITY DEFINER` `collab_lookup_identity`; the invite
  flow's recipient check goes through `collab_person_has_identity`. Both bypass
  RLS for exactly one existence read.
- **`opportunities`, `opportunity_responses`** ([0008](../drizzle/network/0008_rls_opportunities.sql)):
  an opportunity is selectable by its author, or by active members of the owning
  community **once published** (`visibility = 'community'`); insert requires the
  author be an active member; update is the author's. A response is selectable by
  the responder, by the requester (the opportunity's author), or — only when
  `shared` — by anyone who can see the opportunity; insert requires being able to
  see it; update (including the `shared` flag) is the responder's. Two
  `SECURITY DEFINER` audience helpers keep the response policies from re-entering
  `opportunities`: `collab_opportunity_author(opp)` and
  `collab_can_see_opportunity(opp)`. Net effect: responses are **private to
  requester/responder unless shared**, and nothing leaks outside the opportunity's
  published audience.
- **`community_events`, `event_publications`, `event_rsvps`** ([0010](../drizzle/network/0010_rls_events.sql)):
  one event, published to many communities. An event is selectable by its
  organizer or by active members of any community it is published to; a publication
  is inserted only by the organizer, and only to a community they actively belong
  to. **Attendance is private** — a participant selects only their own RSVP row,
  while the organizer selects the whole roster. Capacity is enforced inside the
  RSVP transaction, which advisory-locks the event (rather than the organizer-owned
  row, so no lock-only policy is needed) and counts the going RSVPs through
  `collab_event_going_count(event)` — a definer, because the person RSVPing cannot
  see others' rows. The audience helpers `collab_event_organizer(event)` and
  `collab_can_see_event(event)` keep the publication/RSVP policies from re-entering
  `community_events` / `event_publications`.

Every runtime data path in `repository.ts`, `membership.ts`, `claims.ts`,
`import-staging.ts`, `opportunities.ts`, `events.ts`, and the workspace loader
runs through `withActor`, so these policies apply to real traffic.
