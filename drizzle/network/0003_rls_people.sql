-- Row-level security, increment 1: the `people` table.
--
-- Defense in depth. Authorization is already enforced in application SQL; RLS is
-- a backstop so that even a query that forgets its WHERE clause cannot rewrite
-- another person's profile. It bites only when the app connects as a NON-owner,
-- least-privilege role (collab_runtime): ENABLE (not FORCE) lets the table owner
-- and provisioning path bypass RLS, which is where trusted bootstrap/migrations
-- run. The app must therefore run as collab_runtime for this to protect anything.
--
-- The current actor is carried in a transaction-local GUC, collab.person_id, set
-- by lib/db/context.ts#withActor via set_config(..., true) — pool-safe because it
-- is scoped to the transaction, never the session.

ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Names are visible within the app; which people surface is scoped by the joins
-- in each query (directory, roster, audit), not by row visibility here.
CREATE POLICY "people_select" ON "people" FOR SELECT USING (true);--> statement-breakpoint

-- Identity resolution (login) creates people rows before an actor context exists;
-- creating a person is not the sensitive vector (linking an identity is), so
-- inserts are allowed. The runtime role still cannot choose another person's id
-- to then masquerade, because updates are locked to the actor below.
CREATE POLICY "people_insert" ON "people" FOR INSERT WITH CHECK (true);--> statement-breakpoint

-- The backstop: a person may modify only their own row, and cannot rename it to
-- impersonate a different id. NULLIF guards the unset-context case (empty string
-- from current_setting) so a context-less update matches nothing.
CREATE POLICY "people_update" ON "people" FOR UPDATE
  USING ("id" = nullif(current_setting('collab.person_id', true), ''))
  WITH CHECK ("id" = nullif(current_setting('collab.person_id', true), ''));
