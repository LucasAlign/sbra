# SBRA Member Network

A social / networking platform for the **Small Business Resource Association (SBRA)** — *"Be Better. Grow Faster."* — adapted from the [aluminate](https://github.com/LucasAlign/aluminate) MVP.

It helps SBRA members connect and communicate around the four things SBRA is built on:

1. **Referral exchange & tracking** — digitize the Breakfast Referral Club (give / receive / track referrals, closed-loop $ value credited to the giver)
2. **Events, Mingles & RSVP** — Breakfast Club, Mingles, ribbon-cuttings, workshops
3. **Member directory & business profiles** — searchable businesses, services offered, referrals wanted
4. **Community feed & announcements** — wins, The Pitch spotlights, org news

Planning lives on the [Wayfinder map](https://github.com/LucasAlign/sbra/issues/1).

## Stack

- Next.js (App Router) + TypeScript
- Custom CSS themed to the SBRA brand (navy `#001167` / red `#B81A1F` / yellow `#F7D744`; Fjalla One + Work Sans)
- **Build order is seed-first:** the app runs on local seed data behind a single data-access seam (`lib/data.ts`). The real backend — **Replit Postgres (Neon) + Drizzle + Auth.js** — gets wired at "the swap" and only `lib/data.ts` changes.

> Firebase (the aluminate base) has been removed; there is no external service to configure to run the app.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. On Windows PowerShell use `npm.cmd install` / `npm.cmd run dev` if `npm.ps1` is blocked.

## Activating the backend (the swap)

The app runs on seed data by default. To switch to real persistence (Postgres) + auth (Auth.js / Google), all localized to `lib/db/*`, `app/actions.ts`, and `auth.ts`:

1. Provision Postgres and set `DATABASE_URL` (on Replit: add a Postgres DB — it sets this automatically).
2. `npm run db:push` — creates the tables from `lib/db/schema.ts`.
3. Visit `/api/seed` once — loads the seed data into Postgres.
4. Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (Google OAuth credentials).
5. Set `NEXT_PUBLIC_BACKEND_ENABLED=1` and restart.

The UI is unchanged — it reads from Postgres via server actions (`app/actions.ts`) and members sign in with Google.

## Deploy

The app is intended to be **imported into Replit** (Postgres + hosting). It runs immediately in seed mode with zero config; follow the swap steps above to enable persistence.

## Status

Scaffold baseline (ticket #2): forked, Firebase removed, `lib/data` seam in place, shell rebranded to SBRA. The member-facing screens still carry aluminate's alumni-era copy/fields — those are reworked feature-by-feature in the referral / events / directory / feed tickets.
