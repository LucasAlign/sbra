# Cutover rehearsal

Status: local preparation, 2026-09-09. Production cutover is not complete.

## Decisions and recommendations

The platform is free for members; the organization pays for the platform
(confirmed by the product owner). Legacy membership tiers describe community
membership, not a member platform subscription. Organization pricing, billing
cadence and payment collection remain to be specified.

Use the existing isolated demo administrator for now: on the seed-mode login,
choose Admin and Enter admin demo. The fixed demo credentials are
`admin@sbra.demo` / `sbrademo`. This grants no production backend authority.
The module demo actor also already has a community-admin grant scoped to
`demo-community`. Real operators must still sign in and be explicitly verified.

Recommended starting policy, pending approval:

- Keep a read-only legacy snapshot for 30 days after cutover, with a tested
  restore before switching traffic. Restrict snapshot access to operators.
- Export a versioned JSON archive plus CSV tables for human review, scoped to
  the requesting organization's authorized community data. Exclude other
  communities' private records and members' private relationship notes.
- Retain import evidence only as long as needed for reconciliation; propose
  deletion 90 days after reconciliation closes. Set audit and billing retention
  separately before production, based on actual operational requirements.

These are proposed defaults, not an implemented deletion or export policy.

## Backfill command

Set `COLLAB_BACKFILL_DATABASE_URL` to the privileged owner connection of a
restored staging database. Apply is limited to databases named `collab_staging`
or `collab_test`; the command never falls back to the app's `DATABASE_URL`.

```powershell
npm run community:backfill -- <community-id> <source> --report
npm run community:backfill -- <community-id> <source> --apply-staging
```

Report is the default and runs in a read-only, repeatable-read transaction.
Apply wraps the entire engine in a serializable transaction, including its
validation, so failures roll back the rehearsal. Output is JSON with a
source-filtered review queue and explicitly database-wide validation. Exit 2
means review or validation needs attention; exit 1 means the command failed.
Protect saved reports because they contain legacy identifiers and review reasons.

The underlying engine reads all legacy businesses and members; `source` labels
the mappings and does not filter legacy input. Use a staging copy containing
only the intended legacy import. Mapping IDs are global, so rerunning into a
different community does not copy previously mapped memberships.

The current validator counts any grants held by mapped people, including later
legitimate provisioning; run this rehearsal before real operator provisioning.
It is not a complete cutover readiness check. `readyForCutover` is always false.

## Still required before production

Inventory and restore rehearsal, reviewed organization reconciliation with
merge history, authorized shadow comparisons, manual identity review, verified
real admins, approved retention/export policy, monitoring, and coordinated
read/write switch remain outstanding. The [database demo](./local-database-demo.md)
is now available alongside the seed-only prototype.
The backend home summary and core Tools workflows now render. Advanced
workflow parity and production migration tooling remain follow-ups. No production data was migrated by this change.
