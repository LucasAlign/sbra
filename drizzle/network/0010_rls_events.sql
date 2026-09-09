-- Row-level security, increment 5: events, publications & RSVPs (M5).
--
-- Continues the pattern from 0004/0006/0008: cross-table authorization lives in
-- SECURITY DEFINER helpers so a policy predicate never re-enters an
-- RLS-protected table (which would recurse). The helpers read the transaction's
-- actor from collab.person_id via collab_actor().
--
-- Audience model:
--   * An event is one row, published to many communities. It is visible to its
--     ORGANIZER, and to active members of ANY community it is published to.
--   * Attendance is private: a participant sees only their OWN RSVP; the
--     organizer sees the whole roster. No one else sees who is attending.
--   * Capacity is enforced in the RSVP transaction, which advisory-locks the
--     event and counts the going RSVPs through a definer (RLS would otherwise
--     hide other people's rows from the person RSVPing).

-- The organizer of an event, regardless of the reader's own visibility.
CREATE OR REPLACE FUNCTION "collab_event_organizer"(p_event text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT organizer_id FROM community_events WHERE id = p_event
$$;--> statement-breakpoint

-- May the current actor see this event at all? Organizer, or an active member of
-- any community the event is published to.
CREATE OR REPLACE FUNCTION "collab_can_see_event"(p_event text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM community_events e WHERE e.id = p_event AND e.organizer_id = collab_actor())
      OR EXISTS (SELECT 1 FROM event_publications p
        WHERE p.event_id = p_event AND collab_is_active_member(p.community_id))
$$;--> statement-breakpoint

-- Count of 'going' RSVPs for an event, bypassing RLS so capacity can be enforced
-- by whoever is RSVPing (they cannot see other people's RSVP rows).
CREATE OR REPLACE FUNCTION "collab_event_going_count"(p_event text) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT count(*)::int FROM event_rsvps WHERE event_id = p_event AND status = 'going'
$$;--> statement-breakpoint

-- community_events: organized by the actor, or visible once it reaches a community
-- they actively belong to; created and edited only by the organizer.
ALTER TABLE "community_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "event_select" ON "community_events" FOR SELECT
  USING ("organizer_id" = collab_actor() OR collab_can_see_event("id"));--> statement-breakpoint
CREATE POLICY "event_insert" ON "community_events" FOR INSERT
  WITH CHECK ("organizer_id" = collab_actor());--> statement-breakpoint
CREATE POLICY "event_update" ON "community_events" FOR UPDATE
  USING ("organizer_id" = collab_actor()) WITH CHECK ("organizer_id" = collab_actor());--> statement-breakpoint

-- event_publications: visible to active members of the community (shared
-- discovery) or to the organizer; only the organizer publishes, and only to a
-- community they are an active member of ("approved communities").
ALTER TABLE "event_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "event_publication_select" ON "event_publications" FOR SELECT
  USING (collab_is_active_member("community_id") OR collab_event_organizer("event_id") = collab_actor());--> statement-breakpoint
CREATE POLICY "event_publication_insert" ON "event_publications" FOR INSERT
  WITH CHECK (collab_event_organizer("event_id") = collab_actor() AND collab_is_active_member("community_id"));--> statement-breakpoint
CREATE POLICY "event_publication_delete" ON "event_publications" FOR DELETE
  USING (collab_event_organizer("event_id") = collab_actor());--> statement-breakpoint

-- event_rsvps: a participant reads/writes only their own; the organizer reads the
-- whole roster (attendance is otherwise private). Inserting requires being able
-- to see the event.
ALTER TABLE "event_rsvps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rsvp_select" ON "event_rsvps" FOR SELECT
  USING ("person_id" = collab_actor() OR collab_event_organizer("event_id") = collab_actor());--> statement-breakpoint
CREATE POLICY "rsvp_insert" ON "event_rsvps" FOR INSERT
  WITH CHECK ("person_id" = collab_actor() AND collab_can_see_event("event_id"));--> statement-breakpoint
CREATE POLICY "rsvp_update" ON "event_rsvps" FOR UPDATE
  USING ("person_id" = collab_actor()) WITH CHECK ("person_id" = collab_actor());
