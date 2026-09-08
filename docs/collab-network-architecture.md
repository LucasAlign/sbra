# Collab network architecture review and proposal

Status: proposed architecture, September 8, 2026. This document reviews the current working tree, including existing UI changes. No runtime changes or database migrations are applied by this proposal.

Collab should provide shared identity, discovery, and networking infrastructure while chambers retain their brands, member administration, communications, and private organizational records. Berks County becomes the first geographic community and region. Expansion should mean provisioning records and policies, not copying the application.

## 1. Current architecture and necessary changes

| Evidence in this repository | Current behavior | Required change |
| --- | --- | --- |
| `lib/types.ts`, `lib/db/schema.ts`: `Member.businessId`, `members.email`, `isOwner`, `role` | One member belongs to exactly one business; identity, affiliation, and permissions are combined. Deleting a business cascades to members. | Separate people, authentication identities, organization affiliations, memberships, and scoped grants. Organization deletion must not delete people. |
| `businesses.tier` | Membership tier is global to a business. | Put community plan/tier and dues status on organization community membership; keep organization size separate if needed. |
| `lib/organizations.ts` | Static brand catalog, no persisted membership or region; unknown IDs fall back to the first organization. | Persist communities and operators; resolve unknown contexts to an error, never a different tenant. |
| `components/sbra-app.tsx`: `selectOrganization`, `isLatino` | Switching brands swaps directory seed arrays and changes navigation; content has no tenant keys. | Resolve branded context from community configuration and reload scoped data. Locale and enabled features become configuration. |
| `app/actions.ts`: `bootstrap` | Selects all businesses, people, referrals, RSVPs, posts, comments, and reactions without authentication or audience filtering. | Replace with bounded, authorized discovery and private-data queries; never send all records for client-side filtering. |
| `app/actions.ts`: mutation exports | Accept client identity/resource fields without calling `auth()` or checking grants; referral updates accept `Partial<Referral>`. | Derive actor on server, validate input and field allowlists, authorize each resource and transition, transact related writes. |
| `auth.ts`, UI session matching | Google JWT login exists, but UI matches email to loaded members; schema auth tables are not wired to an adapter. | Establish a durable server-resolved person ID and verified provider identity; do not grant affiliation or ownership from email matching. |
| `app/api/seed/route.ts` | GET can write demo records when a database is configured; no authorization check. | Replace with a controlled development/provisioning command before real data. A client feature flag is not access control. |
| `lib/importers.ts`, `lib/latino-directory.ts` | Import generates businesses per row, assigns ownership, and can copy roster notes into profile descriptions/bios; separate directories generate their own IDs. | Stage imports privately, preserve provenance, reconcile canonical organizations, and require verified claims. Never publish private roster notes or infer authority from an import. |
| `lib/data.ts`, UI direct calls to `app/actions.ts` | Stub data interface coexists with a second persistence path. README's single-file backend swap no longer describes the implementation. | Consolidate calls behind domain module interfaces with consistent demo and database behavior. |
| `lib/db/schema.ts` | Most relationship IDs lack foreign keys, states are free text, monetary values use floating point. | Add relational integrity, state checks, indexes, exact monetary values/currency, and explicit deletion rules. |

The existing Next.js/Postgres direction can support the proposed modular monolith. The blocking issues are identity, authorization, and data contracts, rather than a need for microservices. This is a static architecture review, not verification of a deployed database or a full security audit.

## 2. Tenant/community architecture

Confirmed domain direction, September 8, 2026: **Community is the primary tenant boundary; Region is an optional administrative parent. Businesses and people are not owned by tenants. Relationships and tenant-specific data are.** A tenant controls its membership administration, settings, branding, and private records. The platform maintains canonical identities in collaboration with the relevant people and verified business administrators.

The conceptual navigation is **Platform → Region → Community/Tenant → Business → Person**. Greater Reading Chamber, Hamburg Business Association, and SBRA illustrate separate communities associated with Berks County, not an assumed chain of administrative ownership. Rivco Signs can belong to all three using one canonical organization identity, and Bryant retains one person identity across those relationships. Any parent administration requires explicit scoped authority; geography and overlapping membership grant no private-data access.

In this repository, the proposed `BusinessCommunityMembership` maps to `organization_community_memberships`, because businesses are a kind of organization. Membership status, membership type/tier, join date, dues, internal notes, private tags, and committee participation belong to the community relationship or related community-scoped records. Do not add a tenant owner to canonical people or organizations. The foundation schema currently includes status, tier, and creation time; the other relationship fields and workflows remain implementation work. Creation time must not silently substitute for an actual join date.

Acceptance scenarios for that boundary:

- Rivco joins two chambers: both reference the same organization, each controls its own membership terms, dues, notes, and tags, and neither can read the other's private relationship data.
- Rivco leaves one chamber: that membership ends and its member access is revoked; its canonical profile, Bryant's identity, and other memberships survive. Historical private records follow the owning community's retention policy.
- A Berks administrator requests a regional report: only permitted aggregates are available under regional authority; underlying private membership records require a separate explicit grant.
- A community publishes an event or opportunity: the published fields become discoverable to the approved audience, while attendance and other private child records retain separate access rules. Participants can access their own attendance information.

Treat `Person → Organization → Community → Region → Network` as a navigation and relationship model, not a strict ownership tree. Every arrow except a region's optional geographic parent can involve many-to-many relationships. A person can join a community without representing a business. An industry community can cover several counties.

Use a shared Postgres database and schema initially. Canonical identity and organizations are network-wide; community operations are tenant-scoped. A community has one accountable operator organization, configuration, status, and brand. The operator's own internal records use organization scope, so operating two communities does not expose internal records to either membership roster. Community administration is distinct from authority over its operator organization.

Persist a Collab network, a Berks County region, and a Berks County geographic community linked to that region. SBRA and the Latino Chamber are distinct operator organizations with distinct organizational communities linked to Berks. Their existence in demo data does not imply a verified operating partnership. Use opaque stable IDs and editable slugs; neither `1` nor `berks` is a special-case authorization value.

Regions can have an optional parent (county → state), with cycle prevention; add Pennsylvania later without rewriting Berks IDs. Communities have one primary discovery region and zero or more coverage regions. Region coverage does not grant administrative access. A network ID identifies the initial network; shared people and organizations are not duplicated if future network enrollment is added.

Resolve `/c/{slug}` to a community ID on the server; later add verified custom-domain mappings with unique hostnames. Brand, locale, logo, feature configuration, and operator attribution come from configuration. Use `/r/{slug}` for regional discovery. A chosen community is context, not proof of membership. An inactive community cannot accept new writes. Network/region discovery returns only expressly published records.

Every private query uses actor identity plus an authorized resource scope. Include person, community, audience, filters, and permission version in relevant cache keys; clear scoped state on account/community switches. Notifications, exports, attachments, background jobs, and search must enforce the same policy as page reads. Never cache personalized private results as a shared public response.

## 3. Core entities and database design

All durable records use opaque primary keys, creation/update timestamps, and explicit foreign keys. The following is a logical schema, not executable migration SQL.

| Entity/table | Key relationships and constraints | Scope |
| --- | --- | --- |
| `people`, auth users/accounts | Auth user links uniquely to person; provider + subject unique. Verified login addresses separate from optional profile contacts. Imported contacts are not login accounts. | Shared identity; personal fields private by default |
| `organizations` | Canonical name, kind, description, claim status; locations and service areas in separate tables. Names/domains are matching evidence, not unique identities. | Shared canonical profile |
| `organization_affiliations` | Unique person + organization; title, status, verification. Multiple active affiliations allowed. | Person/organization |
| `networks`, `regions` | Region belongs to network, optional parent in same network; unique network + region slug. | Network geography |
| `communities`, `community_regions` | Operator organization FK; kind geographic/organizational/interest; unique network + community slug and community + region pair. Region links must use same network. | Community configuration |
| `person_community_memberships` | Unique person + community; invited/pending/active/suspended/left status and dates. | Community |
| `organization_community_memberships` | Unique organization + community; status, plan, renewal metadata. Private dues fields separated from published listing. | Community |
| `community_representatives` | Person membership linked to organization membership in the same community and an active organization affiliation; explicit designation. | Community |
| `community_listing_overrides` | Unique organization membership; local offer, description, visibility. Cannot overwrite canonical organization fields. | Community |
| Scoped role grants | Separate platform, region, community, and organization grant tables with real scope FKs; unique person + role + scope; grantor, expiry, revocation, audit. | Explicit administrative scope |
| `import_batches`, `source_records`, `external_entity_links`, `claim_requests`, `merge_history` | Unique source-system + operator + external ID; staging retains original data privately. Canonical merge maps old IDs and references transactionally. | Source owner; canonical link only shared |
| `opportunities`, `opportunity_responses` | Creator person, optional represented organization, owning community; kind, structured need/services, geography, status, expiry. Responses are requester/author-private unless shared. | Owner and published audience |
| `events`, `event_publications`, `rsvps` | One event with owning community; multiple destination publications, no copies. Unique event + person RSVP; attending-as organization optional and verified. Timezone plus timestamps. | Published event; private attendance |
| `announcements`, `announcement_publications` | Community communication with explicit audience and author authority. Comments inherit parent access. | Community or published audience |
| `introductions`, `introduction_participants`, `referrals` | Origin context, involved people and represented organizations; consent/status transitions. Referral financial details remain restricted. | Participants; explicit optional reporting |
| `connections`, `relationship_notes` | Unique normalized person pair, acceptance state; notes have an individual or organization owner and separate access. | Participants; notes private to owner |
| `organization_private_records`, `community_private_records` | CRM notes, roster contacts, billing metadata, and internal records carry mandatory owner scope. | Owning organization/community only |
| `audit_events`, `consent_records`, `outbox_events` | Actor, scope, resource, purpose/version, timestamps; minimize sensitive payloads. Outbox committed with the originating write. | Restricted operational data |

Use concrete publication tables for events, opportunities, and announcements so foreign keys remain enforceable. Each content record has exactly one owning community; each publication targets exactly one community, region, network, or public audience, enforced by a check constraint and target FKs. Publication in another community requires its acceptance; region/network discovery follows publishing policy. Private is the default when no publication exists. Audience access is a union of approved publications but never widens private child records.

Business membership does not automatically enroll all employees. A community may sponsor seats, but each person must accept membership and any representation must be verified. Revoking an affiliation removes the ability to act for that organization without destroying personal identity, past authorship, or unrelated memberships.

Use composite FKs where pairs must share a community/network. Add indexes on membership person/status and community/status, content owner/status/date, publication target, and relationship participant. Use keyset pagination with stable ID tie-breakers and bounded page sizes. Unique RSVP/reaction keys and transactional upserts prevent races; enforce event capacity in a transaction. Use exact decimal or minor-unit monetary values with currency. Avoid blanket cascading deletes of shared or historical records.

## 4. Roles and permissions

Roles are scoped grants, not an ordered global ladder. A person can be Community Admin in SBRA, Member in another chamber, and Business Admin for two organizations. Public User is the unauthenticated access class, not a stored admin grant.

| Role | Permitted authority | Explicit limits |
| --- | --- | --- |
| Platform Admin | Provision network/regions, manage platform grants, handle abuse and operational configuration. | No routine access to private notes, messages, prospect contacts, or dues. Exceptional support access requires purpose, time limit, and audit. |
| Regional Admin | Manage assigned region metadata, regional discovery moderation, community onboarding and regional publications. | Cannot grant community/business admins or inspect chamber-private data merely because it covers the region. |
| Community Admin | Manage assigned community brand, invitations, membership, approved communications/events, local moderation, and community reports. | Cannot edit canonical organizations or see unrelated communities, operator-private files, or participant-private relationship details. |
| Business Admin | Manage assigned canonical organization, affiliations, business-admin grants, and permitted organization membership requests. | Cannot administer chambers or read employees' personal relationship notes; not automatically admin of a community operated by that organization. |
| Member | Read authorized community content, manage own profile, RSVP, connect, respond, and create opportunities where community policy allows. | Can act for a business only with active verified affiliation and the necessary capability. Cannot set own membership or grants. |
| Public User | Read explicitly public business profile fields, public events, and public opportunities. | No private contacts, rosters, attendee lists, internal communications, or relationship history. |

Use capabilities such as `community.members.manage`, `organization.profile.edit`, `event.check_in`, and `opportunity.publish` behind a small authorization interface. Staff duties can receive narrow capabilities later without resurrecting an ambiguous global `staff` role. Grant changes require authority in that exact scope; protect the last active administrator and audit transfers. Community admin appointment requires an existing authorized community admin or explicit platform provisioning, not regional geographic inheritance.

For every operation: resolve server session → resolve person → validate scope/resource → check active memberships, grants, expiry, suspension, and audience → validate allowed fields/state transition → execute transaction → audit. Never trust submitted author IDs, selected roles, or organization IDs. Enforce permission predicates in database queries and add Postgres row-level policies as defense in depth before hosting multiple live tenants. Use a runtime role that cannot bypass those policies and transaction-local context compatible with connection pooling; provisioning uses a separate privileged path.

## 5. Data ownership and privacy

This defines proposed product control, export, and access rights; contractual terms remain a launch decision.

| Data | Steward/control | Sharing and departure behavior |
| --- | --- | --- |
| Person identity and contact preferences | Person; platform maintains verified identity | Publish selected profile fields only. Leaving a chamber does not delete identity. |
| Canonical organization profile | Verified Business Admin; platform resolves disputed claims | Approved public fields reused across communities. A chamber may propose corrections but cannot seize ownership. |
| Membership, dues, internal roster notes | Relevant community/operator with explicit scope | Never included in shared directory payloads. Authorized scoped export; retain/delete under configured retention rules. |
| Local listing and community content | Community manages listing; creator retains attribution | Removing membership hides local listing without deleting canonical business. Community departure revokes member-only access. |
| Referral prospects, deal amounts, introductions | Authorized participants; subject to contact consent | No automatic regional leaderboard or admin access. Share aggregates only with permission and small-cohort suppression. |
| Relationship history and notes | Connection participants for shared milestones; note owner for notes | A connection does not share either participant's private notes. Organization-owned notes remain with that organization. |
| AI signals and recommendations | Same steward as source data | Same scope, consent, retention, and deletion rules; no broader visibility through derived data. |

Publication exposes only a field allowlist, not an entire database row. Shared event discovery does not reveal RSVPs; shared organization profiles do not reveal private membership details. Use short-lived authorized attachment URLs and recheck access for exports. Removal of a publication, membership, or grant invalidates affected caches/search entries and queued deliveries. Reauthorize at delivery time.

Account deletion requires retention-aware redaction of personal data while preserving lawful historical attribution where applicable; organization closure archives listings and memberships rather than cascading through people. A departing chamber can export its scoped membership/communication records but not the broader network's identities or another chamber's records. Set retention periods, export format, support-access approval, and profile-claim dispute procedures before production onboarding.

## 6. Changes needed now and migration strategy

Before substantial feature work or real private data:

1. Establish durable person identity and server-side authorization on every action, read, upload, and provisioning path. Remove client-side email matching as the identity authority and isolate demo sessions from real database access.
2. Add networks, regions, communities, organization affiliations, separate person/business community memberships, and scoped grants. Put ownership/audience on content before adding more content types.
3. Replace global bootstrap with paginated directory, community workspace, event discovery, and participant relationship queries. Define separate public and private response types instead of casting database rows to UI types.
4. Introduce private import staging and verified claims; stop automatic imported-owner assignments and note publication. Define canonical organization merge/reversal policy and human review for uncertain matches.
5. Consolidate data access into domain modules: Identity and Access; Organizations and Membership; Discovery and Publishing; Relationships; Community Operations. Their interfaces own validation, authorization, transactions, and audience projection. Demo and Postgres adapters implement the same contracts. Keep Next.js and a single deployment.
6. Replace brand conditionals with community configuration, rename generic `SbraEvent` to `CommunityEvent`, and route by validated community IDs. Preserve Berks/SBRA names in seed/brand content. Update README backend instructions when that implementation lands.

Migration sequence:

- Inventory any deployed data first; this review does not assume an empty production database. Back up and rehearse restoration. Add versioned reviewed migrations instead of relying on `db:push` against populated databases.
- Add new tables/nullable transition columns. Seed Collab, Berks region/geographic community, and each confirmed operator community with an idempotent provisioning command.
- Build legacy-ID mapping tables. Map each legacy member to a person and affiliation; use verified account linkage, manually review duplicate or missing emails. Do not treat names/shared mailboxes as unique people.
- Reconcile businesses with source evidence, preserving branch/location distinctions. Attach each community membership to the canonical business; record merge history. Stage ambiguous ownership and origin records for review.
- Backfill old content to its verified originating community. Do not label every record Berks-public or SBRA-owned by default. Assign referrals to participants and restrict unknown-origin data until resolved. Migrate `tier` per membership and explicitly review legacy admin roles instead of promoting them globally.
- Validate counts, foreign keys, mappings, scope coverage, money precision, and representative constraints. Shadow-compare authorized projections in staging. Use a short write freeze for a controlled MVP cutover rather than prolonged dual writes.
- Switch reads/writes together, invalidate old caches, monitor denied access and failed writes, and retain read-only legacy tables for a defined recovery period. Roll back application routing only while legacy data remains consistent; after new writes, reconcile through a tested reverse mapping or restore/replay process. Drop old columns only after acceptance.

Required acceptance scenarios:

- One person represents two businesses in three communities without identity duplication; a single business profile edit appears in all its listings while local overrides remain local.
- A chamber admin cannot read another chamber's private roster or grant business ownership. A regional/platform role alone cannot read private relationship notes.
- Forged actor IDs, unknown community slugs, cross-tenant resource IDs, and revoked sessions/grants fail at the server. Test the actual restricted database role and pooled connection reuse.
- An event appears in two approved communities but has one event ID and one RSVP per person. Private attendance stays private.
- Leaving one community preserves other memberships and canonical profiles; revocation also blocks cached results, exports, queued notifications, and recommendations.
- Reimporting a roster is idempotent, does not confer ownership, and does not publish notes. A merge preserves references and can be audited.
- Add a neighboring region and community using configuration/records without an application code branch.

## 7. Phased development roadmap

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| 0 — Network foundation | Identity split, canonical organizations, community/region records, scoped authorization, private imports, controlled provisioning, migrations. | Isolation and migration acceptance scenarios pass; backend safe for real member data. |
| 1 — Berks MVP | Directory and canonical business claiming; structured opportunities/requests; shared event discovery and RSVP; member-driven introductions; connection history; targeted chamber announcements. Branded Berks and confirmed founding partner communities. | Two communities can share a business and event while keeping private operations separate; members complete opportunity-to-introduction workflows. |
| 2 — Neighboring counties | Region onboarding, configurable branding and locale, community publishing agreements, cross-community opportunity/event discovery, admin invitations and scoped exports. | New county provisioned through records/configuration; no new tenant-specific source code. |
| 3 — Pennsylvania network | Regional administration, search projections, rate limits and quotas, reliable notification outbox, audit/export tools, retention automation, performance work based on measured queries. | Load and isolation tests meet agreed service objectives; independent operators can onboard and leave cleanly. |
| 4 — Broader network and AI | Consent-based opportunity ranking, introduction suggestions, and community-specific engagement assistance; optional domain onboarding and external-system integrations. | Recommendations respect source permissions/revocation and show evidence; admins can assess usefulness without exposing other communities' behavior. |

Prioritize a home workspace with open requests, recommended next actions, introductions awaiting response, upcoming relevant events, and chamber messages. A feed can support announcements, but reaction counts and posting volume should not organize the product. Track response rate, accepted introductions, reported useful outcomes, event participation, and repeat participation; keep chamber value visible through attribution and scoped reporting. Establish baseline measurements before choosing numeric targets.

AI preparation starts with structured services, needs, geography, opportunity expiry, consent, and relationship outcomes. Begin with explainable rules and human-initiated introductions; later evaluate AI against that baseline. Record recommendation source IDs, model/rule version, audience, rationale, consent, expiry, and feedback. Recheck source access when serving recommendations, and remove derived search/embedding records after deletion or revocation. Community disengagement signals use only that community's permitted activity and are visible only to its authorized admins; inactivity is a prompt for human review, not a label about a person's business or an automated membership decision. No automatic outreach, contact disclosure, or use of private notes for network-wide matching.

Open operating-policy decisions: initial verified community operators; free versus paid membership plans; who can publish to regional/network discovery; profile claim review ownership; retention periods; and AI opt-in defaults. The architecture supports these as policies rather than Berks-specific branches.
