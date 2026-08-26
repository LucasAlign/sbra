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

## Deploy

The app is intended to be **imported into Replit** (Postgres + hosting) once features are built and the backend is wired.

## Status

Scaffold baseline (ticket #2): forked, Firebase removed, `lib/data` seam in place, shell rebranded to SBRA. The member-facing screens still carry aluminate's alumni-era copy/fields — those are reworked feature-by-feature in the referral / events / directory / feed tickets.
