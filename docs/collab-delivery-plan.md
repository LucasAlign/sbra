# Collab delivery plan

Status: proposed execution plan, 2026-09-08. Operationalizes
[`docs/collab-network-architecture.md`](./collab-network-architecture.md) and
[`docs/network-foundation.md`](./network-foundation.md) into a sequenced,
shippable roadmap. Codex completed **Phase 0 (network foundation)**; this plan
covers everything from hardening that foundation through the full network and AI
phases, and the cutover that retires the seed-only prototype.

## Where we are today

Two front-ends coexist, chosen by `isBackendEnabled()` in [`app/page.tsx`](../app/page.tsx):

- **Seed mode (default):** the rich prototype — community feed, directory,
  referrals, events, the Tools hub, and the admin console — rebranded "Collab".
  All data is seed/`localStorage`; not multi-tenant-safe. This is the demo.
- **Backend mode (`NEXT_PUBLIC_BACKEND_ENABLED=1`):** the new, correct
  `NetworkWorkspace` — server-resolved identity, memberships, an authorized
  community directory, profile editing, invitations, and membership admin. Bare
  but safe. This is the foundation everything else is built on.

The plan's north star: **grow the backend app to feature parity with (and beyond)
the prototype, then cut over and retire seed mode.** The prototype stays as the
live demo until the backend replaces it milestone by milestone.

### Health snapshot (verified 2026-09-08)
- `npx tsc --noEmit` — clean
- `npm run test:network` — 10/10 pass
- `npm run test:network:integration` — requires a disposable Postgres
  (`COLLAB_TEST_DATABASE_URL`); skipped otherwise

## How we'll work

1. **Small, safe increments behind the flag.** Each milestone ships something
   testable without exposing real private data prematurely. Seed mode keeps
   working until a feature reaches parity in backend mode.
2. **Every increment carries its own tests.** Unit tests for permission/logic;
   integration tests (against `collab_test`) for anything touching SQL,
   transactions, or constraints. No milestone is "done" until its acceptance
   scenarios pass.
3. **Server-authoritative, default-deny, always.** Actor resolved from session;
   scope/grant/expiry/suspension/audience checked in the query; field allowlists
   on writes; related writes transacted; mutations audited.
4. **Policy decisions are surfaced, not assumed.** Open product/legal choices are
   listed per milestone under "Needs a decision" and must be answered before that
   milestone ships.
5. **Data access moves into domain modules** with matching demo + Postgres
   adapters, so the UI stops calling raw persistence and both modes behave the
   same.

## Milestones

Each milestone is independently shippable. Ordering respects dependencies;
within a milestone, tasks can be reordered.

---

### M0 — Domain module seams + dev-DB runway
**Goal:** make the rest of the plan cheap to build and safe to run locally.

- Stand up the five domain-module interfaces from architecture §6.5 —
  **Identity & Access, Organizations & Membership, Discovery & Publishing,
  Relationships, Community Operations** — each owning its own validation,
  authorization, transactions, and audience projection.
- Give each module a **demo adapter** (seed-backed) and a **Postgres adapter**
  (Drizzle-backed) behind one interface, so `isBackendEnabled()` selects the
  adapter, not a whole different UI.
- Document a repeatable **local Postgres** setup and wire
  `COLLAB_TEST_DATABASE_URL` so `test:network:integration` runs in CI and locally.
- Define **public vs. private response types** (no casting DB rows to UI types).

**Exit:** integration suite runs in CI on a disposable DB; one existing feature
(profile name edit) flows through a module interface end-to-end in both adapters.

**Status: complete (2026-09-08).**
- Module seam under [`lib/modules/`](../lib/modules): `types.ts` (public vs.
  private response contracts), `contracts.ts` (all five module interfaces),
  `identity-access.ts`, `discovery-publishing.ts`, `organizations-membership.ts`
  (each with a demo + Postgres adapter), a shared `demo-world.ts` for the demo
  adapters, and `index.ts` (registry selecting the adapter family by
  `isBackendEnabled()`). Relationships and Community Operations are interface-only
  until their milestones (M6/M7).
- Three existing features now flow through modules in both adapters:
  **profile-name edit** (Identity & Access), **directory read** (Discovery &
  Publishing), and **organization-description edit** (Organizations & Membership)
  — [`network-actions.ts`](../app/network-actions.ts) calls the modules via
  [`requirePerson`](../lib/network/server.ts). Demo adapters are unit-tested;
  Postgres adapters are integration-tested under the restricted `collab_runtime`
  role.
- Dev-DB runway: [`docs/local-postgres.md`](./local-postgres.md), a CI workflow
  ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) that runs typecheck
  + both suites against a disposable Postgres service, and `COLLAB_TEST_DATABASE_URL`
  documented in [`.env.example`](../.env.example). Verified locally: typecheck
  clean, `test:network` 17/17, `test:network:integration` 3/3 on a throwaway DB.
- **Follow-up (not blocking):** unify the error class across adapters (the demo
  adapters raise `ModuleError`; the Postgres adapters currently surface the
  legacy repository's plain `Error`) when the remaining repository logic moves
  behind the modules.

---

### M1 — Finish Phase 0 hardening
**Goal:** close the gaps `network-foundation.md` calls out before real data.

- **Administrator transfer workflow.** Last-admin protection exists; build the
  transfer (appoint successor → atomically move the grant → audit). Covers the
  "a community cannot lose its last admin" gap.
- **Audit coverage + viewer.** Extend `membership_audit` writes to every
  administrative mutation; add a scoped, read-only audit viewer for admins;
  make audit rows immutable at the DB level.
- **Row-level security.** Add Postgres RLS policies and run the app under a
  restricted `collab_runtime` role (transaction-local context, pool-safe);
  provisioning uses a separate privileged path. Defense in depth before multiple
  live tenants.
- **Private import staging + verified claims.** `import_batches` /
  `source_records` / `external_entity_links` / `claim_requests` / `merge_history`;
  imports stay private, never assign ownership, never publish roster notes.

**Needs a decision:** profile-claim dispute owner; import provenance retention.
**Exit:** isolation acceptance scenarios (architecture §6) pass against the
restricted role; admin transfer + audit covered by integration tests.

---

### M2 — Canonical business claiming & profiles (Phase 1 begins)
**Goal:** a signed-in person can claim and manage their real business.

- **Verified affiliation → Business Admin grant** flow (claim request → review →
  grant), replacing any imported-owner assumption.
- **Canonical organization profile editing** (name, kind, description, locations,
  service areas) gated by an active affiliation + unexpired Business Admin grant,
  checked in the same SQL update.
- **Community listing overrides** (`community_listing_overrides`): local offer,
  description, visibility — without overwriting canonical fields.

**Needs a decision:** what counts as sufficient claim verification for MVP
(operator vouch vs. domain email vs. manual review).
**Exit:** one person represents two businesses; a single profile edit shows in
all listings while local overrides stay local (architecture acceptance scenario).

---

### M3 — Authorized directory & community context
**Goal:** the directory becomes real, scoped, and routed.

- Expand the paginated directory into **public projections** with keyset
  pagination and bounded pages; never ship private fields.
- **Route by community:** resolve `/c/{slug}` → community ID server-side;
  `/r/{slug}` for regional discovery. Brand/locale/logo/features from config.
- Retire brand conditionals (`isLatino`, seed-array swaps); rename generic
  `SbraEvent` → `CommunityEvent`. Preserve Berks/SBRA names in seed/brand content.

**Exit:** an unknown slug errors (never falls back to another tenant); directory
paginates from Postgres with only allowlisted fields.

---

### M4 — Opportunities & requests
**Goal:** the core networking primitive — structured business needs/offers.

- `opportunities` + `opportunity_responses` with owning community, optional
  represented organization, structured need/services, geography, status, expiry.
- Publication model (private by default; publish to a specific audience).
- Responses private to requester/author unless shared.

**Exit:** a member posts an opportunity, another responds, and neither is visible
outside its published audience.

---

### M5 — Events & RSVP (shared discovery)
**Goal:** one event, many communities, private attendance.

- `events` + `event_publications` + `rsvps`: one event owns → many publications
  (no copies); unique event+person RSVP; capacity enforced in a transaction;
  timezone + timestamps.
- Shared event discovery across approved communities; attendance stays private;
  participants see their own RSVP/attendance.

**Exit:** an event appears in two approved communities with one event ID and one
RSVP per person; private attendance stays private.

---

### M6 — Introductions, connections & referrals
**Goal:** member-driven relationships with consent.

- `introductions` / `introduction_participants` with consent/status transitions
  (contact details shared only after acceptance).
- `connections` + `relationship_notes` (notes private to their owner).
- `referrals` rebuilt on participant relationships; financial details restricted;
  no automatic leaderboards.

**Exit:** an introduction requires recipient acceptance before contact sharing; a
connection never exposes either party's private notes.

---

### M7 — Community announcements & home workspace
**Goal:** the product's real front door.

- `announcements` + `announcement_publications` with explicit audience + author
  authority; comments inherit parent access.
- **Home workspace** (roadmap §7): open requests, recommended next actions,
  introductions awaiting response, upcoming relevant events, chamber messages.
  A feed can carry announcements, but reaction counts don't organize the product.
- Port the valuable prototype pieces (Tools hub, admin console) onto real,
  scoped data where they fit.

**Exit:** Berks MVP exit condition — two communities share a business and an
event while keeping private operations separate; members complete an
opportunity → introduction workflow.

---

### M8 — Legacy backfill & MVP cutover
**Goal:** move real Berks/SBRA data onto the backend and retire seed mode.

- Inventory deployed data; back up; rehearse restore.
- Build legacy-ID mapping tables; map each legacy member → person + affiliation
  via verified account linkage (manual review for duplicate/missing emails —
  never treat shared mailboxes as one person).
- Reconcile businesses with source evidence; attach community memberships to the
  canonical org; record merge history. Migrate `tier` per membership. Review
  legacy admin roles explicitly (no global promotion).
- Validate counts, FKs, mappings, money precision; shadow-compare authorized
  projections in staging; short write-freeze cutover; keep legacy tables
  read-only for a defined recovery window.

**Needs a decision:** initial verified community operators; retention periods;
free vs. paid membership plans.
**Exit:** reads/writes switched together; denied-access and failed-write
monitoring clean; prototype/seed mode removed from the entry point.

---

### M9 — Phase 2: neighboring counties
- Region onboarding via records/config (no per-tenant source code).
- Configurable branding/locale; community publishing agreements; cross-community
  opportunity/event discovery; admin invitations + scoped exports.
- **Exit:** a new county is provisioned entirely through configuration/records.

### M10 — Phase 3: Pennsylvania network
- Regional administration; search projections; rate limits/quotas; reliable
  notification outbox; audit/export tooling; retention automation; performance
  work driven by measured queries.
- **Exit:** load + isolation tests meet agreed service objectives; operators can
  onboard and leave cleanly.

### M11 — Phase 4: broader network + AI
- Consent-based opportunity ranking, introduction suggestions, engagement
  assistance; optional custom domains and external integrations.
- Recommendations recheck source access, cite evidence, and honor
  revocation/deletion of derived records.
- **Exit:** recommendations respect source permissions; admins can assess
  usefulness without seeing other communities' behavior.

## Cross-cutting workstreams (run continuously)

- **Testing:** unit for logic/permissions; integration on `collab_test` for SQL,
  constraints, transactions, and the restricted role; acceptance scenarios per
  milestone.
- **Observability:** denied-access and failed-write metrics from M1 onward.
- **Caching/invalidation:** scope-keyed caches cleared on account/community
  switch and on grant/membership/publication changes (from M3).
- **Docs:** keep the README backend instructions and these docs current as each
  milestone lands.

## Open policy decisions (blockers, by milestone)

| Decision | Gates |
| --- | --- |
| Initial verified community operators (who's a real tenant at launch) | M8 |
| Free vs. paid membership plans / dues model | M8 |
| Business-claim verification bar for MVP | M2 |
| Profile-claim dispute ownership & process | M1 |
| Who may publish to regional/network discovery | M9 |
| Data retention periods & scoped export format | M8 |
| AI opt-in defaults | M11 |

## Immediate next step

**M0 is complete.** Start **M1** (finish Phase 0 hardening: administrator
transfer, audit coverage + viewer, row-level security under `collab_runtime`, and
private import staging). This is the last work before real tenant data can land.

To keep the critical path moving, M1/M2 need two policy answers:
- **Profile-claim dispute owner & process** (gates M1).
- **Business-claim verification bar for MVP** (gates M2).
