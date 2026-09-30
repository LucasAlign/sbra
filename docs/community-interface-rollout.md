# Community interface rollout

The member navigation is Home, Directory, Opportunities, Events, and Connections. The community switcher preserves the selected member section when moving between communities. Explore the network is a separate discovery destination; opening a community from discovery starts at its home. Account, business tools, and community management are secondary destinations.

The live workspace and prototype share navigation labels and the switcher. They retain their existing data adapters: prototype offers come from local business listings, while the live opportunities page uses private drafts and explicit community publication. The prototype's limited Latino Chamber catalog is explicitly directory-only; language no longer determines capabilities.

## Organization identity and access

- The live workspace reads names, short names, logos, descriptions, and locale from community records. `/c/{slug}` opens the same workspace with that community's identity, including before sign-in.
- A visitor sees the organization's public identity, not a membership grant. The switcher distinguishes visiting a community from belonging to it.
- Manage community appears only for an active community administrator in the selected community. Server authorization and row-level policies remain authoritative.
- Connections show the actor's introductions, connections, and referrals across communities. Creating an introduction or referral still requires an active selected community; private notes remain personal.
- Event organizers can publish one existing event to another community they actively belong to. This reuses the existing event/publication model and does not create co-host authority. Event cards display organizer attribution and the event's timezone.

## Network discovery

The new discovery action selects only the public community projection, only for active communities. Search covers organization name and description, with a geographic region filter and bounded keyset pagination. It never returns member rosters, contact details, billing, or private activity. An empty area selection means all participating areas, not a claim of nationwide coverage.

## Verification

- TypeScript and the 62-test unit suite passed.
- The optimized production build passed.
- All 15 PostgreSQL integration tests passed against a new disposable local container, including public field projection, hidden drafts, regional filtering, literal wildcard search, membership isolation, shared events, and private attendance.
- Browser checks covered both interfaces, preserving Events while switching communities, the restricted prototype's availability message, unknown live community handling, live admin controls scoped to one of two communities, and publishing a seeded event into the second community.
- A 390px viewport check found no horizontal overflow; secondary account/management controls collapse on mobile.

## Remaining launch work

This rollout is the navigation and collaboration interface foundation. It does not implement self-service brand color/logo editing, custom domains, co-host invitation/acceptance and delegated responsibilities, nationwide public business/event/opportunity publication, partner governance, billing, or a production rollout. Existing configured community branding is preserved. The live shell currently uses English interface copy, independently of a community's locale; complete interface localization remains separate work.
