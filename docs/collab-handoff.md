# Collab — engineering handoff

Status: 2026-09-09. This doc hands off the Collab network backend so work can
continue (e.g. in Codex). It complements [`collab-delivery-plan.md`](./collab-delivery-plan.md)
(the milestone roadmap) and [`row-level-security.md`](./row-level-security.md)
(the RLS model). Read those two next; this doc is the orientation + the exact
"what's left and how to do it" for **M8 and beyond**.

---

## 1. Where things stand

Two front-ends coexist, selected by `isBackendEnabled()` (env
`NEXT_PUBLIC_BACKEND_ENABLED=1`) in [`app/page.tsx`](../app/page.tsx):
- **Seed mode (default):** the rich `SBRAApp` prototype (localStorage/seed). The
  live demo. Retired at the M8 cutover.
- **Backend mode:** `NetworkWorkspace` — the real, server-authoritative,
  RLS-backed app. Everything below is about this.

**Milestones M0–M7 are backend-complete; M8 part 1 (the backfill engine) is done.
The M8 production cutover is not started and is intentionally gated.**

| Milestone | State | Core tables |
| --- | --- | --- |
| M0 module seams + dev DB | done | — |
| M1 hardening (admin transfer, immutable audit, RLS, claims, import staging) | done | `claim_requests`, `import_batches`, … |
| M2 business claiming & profiles | done | `community_listing_overrides` |
| M3 authorized directory & slug routing | done | (reads) |
| M4 opportunities & requests | done | `opportunities`, `opportunity_responses` |
| M5 events & RSVP | done | `community_events`, `event_publications`, `event_rsvps` |
| M6 introductions, connections, referrals | done | `introductions`, `introduction_participants`, `connections`, `relationship_notes`, `member_referrals` |
| M7 announcements & home workspace | backend done; UI port pending | `announcements`, `announcement_publications`, `announcement_comments` |
| M8 legacy backfill & cutover | engine done; cutover gated | `legacy_id_map` |

### Health snapshot (verify before you start; must stay green)
- `npx tsc --noEmit` — clean
- `npm run test:network` — **31/31**
- `npm run test:network:integration` — **15/15** (needs a disposable Postgres; skips without one)
- `npx next build` — clean

Latest commits: `ffcae47` (M8 part 1), `c441c7e` (M7), `2060b52` (M6). Branch `main`.

---

## 2. Architecture you must respect

### The domain-module seam
All runtime data access goes through five modules ([`lib/modules/`](../lib/modules)),
each with a **demo (in-memory)** and a **Postgres (Drizzle)** adapter behind one
interface. The registry [`lib/modules/index.ts`](../lib/modules/index.ts) picks
the adapter family from `isBackendEnabled()`. UI/server actions call the module,
never raw persistence.

1. Identity & Access — [`identity-access.ts`](../lib/modules/identity-access.ts)
2. Organizations & Membership — [`organizations-membership.ts`](../lib/modules/organizations-membership.ts)
3. Discovery & Publishing — [`discovery-publishing.ts`](../lib/modules/discovery-publishing.ts) (directory, opportunities, events)
4. Relationships — [`relationships.ts`](../lib/modules/relationships.ts)
5. Community Operations — [`community-operations.ts`](../lib/modules/community-operations.ts) (announcements, home workspace)

Contracts (public/private response types + interfaces): [`contracts.ts`](../lib/modules/contracts.ts),
[`types.ts`](../lib/modules/types.ts). The Postgres adapters delegate to
`lib/network/*.ts` (the transactional, RLS-backed logic). Demo adapters mirror the
same authorization against [`demo-world.ts`](../lib/modules/demo-world.ts). Server
actions that expose them: [`app/network-actions.ts`](../app/network-actions.ts).

**When you add a feature: add the contract type + interface method, implement the
Postgres logic in `lib/network/`, wire both adapters, re-export types in
`index.ts`, add the server action, and cover it with a demo unit test AND a
Postgres integration test.** Keep the two adapters behaviourally identical.

### Row-level security (defense in depth) — read [`row-level-security.md`](./row-level-security.md)
- Authorization is enforced in application SQL **and** independently by Postgres
  RLS, so a forgotten `WHERE` still can't cross tenant boundaries.
- Actor context is transaction-local: `withActor(db, personId, tx => …)` in
  [`lib/db/context.ts`](../lib/db/context.ts) sets `collab.person_id` via
  `set_config(..., true)` (pool-safe). **Every runtime path whose tables have
  actor-keyed policies must run inside `withActor`.**
- Two roles: the **privileged owner** (migrations, provisioning, seed, and the M8
  backfill — bypasses RLS) vs. the restricted **`collab_runtime`** (the app;
  `NOSUPERUSER NOBYPASSRLS`, only DML granted — RLS bites here).
- Cross-table checks live in `SECURITY DEFINER` helpers so a policy never
  re-enters an RLS table (which would recurse). Naming convention: `collab_*`.

### Migrations (network schema only)
- Schema: [`lib/db/network-schema.ts`](../lib/db/network-schema.ts). Legacy
  prototype tables live in [`lib/db/schema.ts`](../lib/db/schema.ts) (which
  re-exports network-schema).
- Migrations are **hand-written** under [`drizzle/network/`](../drizzle/network).
  Create the scaffold (empty SQL + journal entry + snapshot) then fill it in:
  ```bash
  npx drizzle-kit generate --config=drizzle.network.config.ts --custom --name=<name>
  ```
  Convention: DDL in one migration (`NNNN_<feature>.sql`), its RLS in the next
  (`NNNN_rls_<feature>.sql`). Current head is **0015**. The migrator only reads
  `meta/_journal.json` + the `.sql` files; snapshots are for drizzle-kit's own
  diffing and are not consumed at apply time.

---

## 3. Gotchas learned the hard way (do not rediscover these)

1. **Legacy name collisions.** `lib/db/schema.ts` defines legacy prototype tables
   (`referrals`, `events`, `rsvps`, `businesses`, `members`, …) in the same
   `public` schema and re-exports network-schema via `export *`. A local export
   **shadows** a same-named star-export. That's why network tables are named
   `community_events` / `event_rsvps` / `member_referrals`, not `events` / `rsvps`
   / `referrals`. **Never name a new network table the same as a legacy one.**
2. **`INSERT … ON CONFLICT DO UPDATE` needs the target row visible via the SELECT
   policy.** When a writer (e.g. a vouching admin) can't SELECT the row they're
   upserting, the upsert fails even with no real conflict. Use **update-then-insert**
   instead (see `claims.ts`, `repository.setListingOverride`).
3. **Checking *another* person's membership from the actor's context is blocked**
   by the per-person policy on `person_community_memberships`. Use the
   `collab_person_is_active_member(person, community)` SECURITY DEFINER helper
   (see `relationships.ts`). Same shape as `collab_person_has_identity`.
4. **`SELECT … FOR UPDATE` also enforces the UPDATE policy's `USING`.** Locking a
   row you may not update fails. Where a non-owner must serialize (e.g. RSVP
   capacity), use `pg_advisory_xact_lock(hashtextextended(id, 0))` instead of
   locking an owner-scoped row (see `events.rsvpToEvent`).
5. **The integration suite shares ONE database across all test files.** Fixtures
   use fixed ids; a full run needs a **freshly recreated container** (below).
   **Assertions must be scoped to the test's own rows** (join `legacy_id_map`, or
   filter by the test's community/id prefix) — never global `count(*)`/`.length`.
6. **Field-level audience is enforced in the projection, not RLS** (RLS is
   row-level). E.g. an introduction participant's `contact` is gated in
   `readIntroductions`; event `goingCount` is organizer-only in `readEvents`. RLS
   still guarantees only the right *rows* are visible.

---

## 4. Standard workflow (do this every change)

```bash
# 1. Disposable Postgres (fresh container per authoritative full run)
docker rm -f collab-pg-test 2>/dev/null
docker run -d --name collab-pg-test -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=collab_test -p 55432:5432 postgres:16-alpine
# wait until: docker exec collab-pg-test pg_isready -U postgres -d collab_test

# 2. Verify
npx tsc --noEmit
npm run test:network
COLLAB_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55432/collab_test" \
  npm run test:network:integration
npx next build

# 3. Clean up
docker rm -f collab-pg-test
```

Integration tests self-guard: they skip unless `COLLAB_TEST_DATABASE_URL` is set,
and assert the host is `localhost`/`127.0.0.1` and the db name is `/collab_test`
(never point them at anything real). They provision fixtures via the privileged
owner connection and run the operations-under-test as `collab_runtime`.

**Git:** work on `main`; `git pull --rebase origin main` then `git push`. End every
commit message with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
Keep `collab-delivery-plan.md` + `row-level-security.md` current as milestones land.

---

## 5. What's left in M8 (the cutover) — the main task

The **decision-independent engine is done**:
[`lib/network/backfill.ts`](../lib/network/backfill.ts) +
[`legacy_id_map`](../drizzle/network/0015_legacy_backfill.sql), covered by
[`backfill.integration.test.ts`](../lib/network/backfill.integration.test.ts).

- `backfillCommunity(db, { communityId, source })` — legacy `businesses` →
  organizations (tier → community membership; address/city → `locations`); legacy
  `members` → people **only via a verified account** (`uid` → identity).
  Ambiguous rows (no uid, shared uid, missing/duplicate email) → `needs_review`,
  never merged. `isOwner` → affiliation title, **never a role grant**. Idempotent.
- `readBackfillReview(db, source?)` — the manual queue.
- `validateBackfill(db)` — integrity: no dangling affiliations/memberships, zero
  grants minted.

Runs on the **privileged owner connection** (like the seed/provision scripts),
not `collab_runtime`.

### Blocked on decisions (get answers before the cutover)
1. **Initial verified community operators** — who is a real tenant at launch. Drives
   which communities to provision and whom to grant `community_admin` (explicitly,
   after review — the backfill promotes no one).
2. **Data retention periods & scoped export format.**
3. **Free vs. paid membership plans / dues model** — affects whether/how `tier`
   maps to plans.

### Cutover steps (need decisions + real data access; do NOT run against prod unattended)
1. **Inventory + back up** the deployed data; **rehearse restore** on a staging copy.
2. Provision the launch communities/networks/regions (see
   [`scripts/provision-community-admin.ts`](../scripts/provision-community-admin.ts),
   [`scripts/seed-network.ts`](../scripts/seed-network.ts) for the privileged path).
3. Run `backfillCommunity` against **staging**; `readBackfillReview` and resolve the
   `needs_review` queue by hand (duplicate/missing emails, shared accounts —
   never auto-merge a shared mailbox into one person).
4. **Grant reviewed operators/admins explicitly** (the backfill never does).
5. **Shadow-compare authorized projections** (legacy-derived vs. canonical) in
   staging until they match — see the suggested tooling below.
6. **Short write-freeze cutover:** switch reads and writes together; keep legacy
   tables read-only for a defined recovery window; flip `NEXT_PUBLIC_BACKEND_ENABLED`
   and **remove seed mode from the entry point** ([`app/page.tsx`](../app/page.tsx)).
7. Watch denied-access / failed-write metrics; they must be clean.

### Suggested non-prod tooling to build next (unblocked, high value)
- `scripts/backfill-community.ts` — a thin CLI wrapping `backfillCommunity` /
  `readBackfillReview` / `validateBackfill` for a named community + source, run via
  the owner connection (mirror `provision-community-admin.ts`). Prints the summary
  and the review queue.
- A **shadow-compare report**: for a community, diff the legacy projection
  (directory/members/events derived from the legacy tables) against the canonical
  authorized projection, listing mismatches. Add an integration test.
- **`merge_history`** reconciliation: when a legacy business matches an existing
  canonical org (by evidence), record it (table exists from M1) rather than
  creating a duplicate — the current engine always creates a new org.

---

## 6. Other open follow-ups

- **M7 UI port (presentation only; data + authz are done).** Port the prototype's
  Tools hub and admin console onto the scoped modules in `NetworkWorkspace`, and
  render the home workspace (`readHomeWorkspace` / `loadHomeWorkspace`) as the
  backend-mode landing surface. Best done alongside the M8 cutover when seed mode
  retires. This is the one place where **verifying in the browser preview**
  matters — start the dev server and check the rendered pages.
- **M9–M11** (see the delivery plan): neighbouring counties via config (no
  per-tenant source), regional admin + rate limits + notification outbox, then
  consent-based AI ranking. All build on the same module + RLS pattern.

---

## 7. Quick file map

| Concern | Files |
| --- | --- |
| Network schema | `lib/db/network-schema.ts`; migrations `drizzle/network/*.sql` |
| Actor context / RLS glue | `lib/db/context.ts` |
| Postgres logic | `lib/network/{repository,membership,claims,import-staging,opportunities,events,relationships,community-ops,backfill}.ts` |
| Modules (demo + PG) | `lib/modules/*.ts`; registry `lib/modules/index.ts` |
| Server actions | `app/network-actions.ts` |
| Slug routes | `app/c/[slug]/page.tsx`, `app/r/[slug]/page.tsx`; `lib/network/discovery.ts`; `lib/brand.ts` |
| Tests | `lib/**/*.test.ts` (unit), `lib/**/*.integration.test.ts` (Postgres); scripts in `package.json` |
| Docs | `docs/collab-delivery-plan.md`, `docs/row-level-security.md`, `docs/local-postgres.md`, this file |
