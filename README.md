# Berks County Collab

The first network foundation implementation is available: [schema, migration, provisioning, tests, and remaining cutover work](docs/network-foundation.md).

The proposed platform direction is documented in the [Collab network architecture review](docs/collab-network-architecture.md), with shared terminology in [CONTEXT.md](CONTEXT.md). It covers the current architecture gaps, canonical identity and organizations, community isolation, permissions, privacy, migration, and the roadmap from Berks to a multi-region network. These are proposed changes; the backend instructions below describe the existing prototype and do not establish production access controls.

A shared digital home for Berks County business organizations. The **Small Business Resource Association (SBRA)** — *"Be Better. Grow Faster."* — is the founding network and retains its identity inside the broader Collab experience.

The network catalog lives in `lib/network/catalog.ts`; `lib/organizations.ts` adapts it for the seed prototype. Demo communities are active; database provisioning creates draft communities pending verified operators.

It helps SBRA members connect and communicate around the four things SBRA is built on:

1. **Referral exchange & tracking** — digitize the Breakfast Referral Club (give / receive / track referrals, closed-loop $ value credited to the giver)
2. **Events, Mingles & RSVP** — Breakfast Club, Mingles, ribbon-cuttings, workshops
3. **Member directory & business profiles** — searchable businesses, services offered, referrals wanted
4. **Community feed & announcements** — wins, The Pitch spotlights, org news

Planning lives on the [Wayfinder map](https://github.com/LucasAlign/sbra/issues/1).

## Stack

- Next.js (App Router) + TypeScript
- Custom CSS themed to the SBRA brand (navy `#001167` / red `#B81A1F` / yellow `#F7D744`; Fjalla One + Work Sans)
- The seed prototype runs without external services. The live workspace uses **Postgres + Drizzle + Auth.js**, with server-resolved identity and scoped queries in `app/network-actions.ts` and `lib/network/`.

> Firebase (the aluminate base) has been removed; there is no external service to configure to run the app.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. On Windows PowerShell use `npm.cmd install` / `npm.cmd run dev` if `npm.ps1` is blocked.

## Activating the live workspace

The app runs on seed data by default. To run the scoped workspace:

1. Provision Postgres and set `DATABASE_URL` (on Replit: add a Postgres DB — it sets this automatically).
2. `npm run db:network:migrate` — applies the reviewed additive network migrations.
3. `npm run db:network:seed` — provisions draft communities without importing people or granting access.
4. Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (Google OAuth credentials).
5. Set `NEXT_PUBLIC_BACKEND_ENABLED=1` and restart.

Sign in to create your person identity. Verified community activation and membership assignment are required before directories appear. The live workspace supports profile names, directories, account-bound invitations, and community-admin roster controls. The first admin is appointed with the controlled `community:provision` command after operator verification. The legacy content actions and HTTP seed route are retired; referrals, events, and posts remain in the seed demo until migrated. See [implementation and testing notes](docs/network-foundation.md).

## Deploy

The app is intended to be **imported into Replit** (Postgres + hosting). It runs immediately in seed mode with zero config; follow the swap steps above to enable persistence.

## Status

Scaffold baseline (ticket #2): forked, Firebase removed, `lib/data` seam in place, shell rebranded to SBRA. The member-facing screens still carry aluminate's alumni-era copy/fields — those are reworked feature-by-feature in the referral / events / directory / feed tickets.
