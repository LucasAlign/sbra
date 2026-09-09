import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import * as s from "../db/network-schema";
import { withActor } from "../db/context";
import { boundedText } from "./identity";

type Database = PostgresJsDatabase<typeof fullSchema>;

// Events & RSVP (M5): one canonical event, published to many communities.
//
// An event is a single row organized by a person (optionally on behalf of an
// org). Publishing adds an event_publications row per community — there are no
// copies, so one event ID appears in every community it reaches. A member
// discovers an event if they actively belong to any community it is published to.
// Attendance is private: a participant sees only their own RSVP; the organizer
// sees the roster. Capacity is enforced inside the RSVP transaction (advisory
// locked per event, counted through a definer that bypasses RLS). All of this is
// also enforced independently by row-level security (0010).

function activeMember(personId: string, communityId: string) {
  return sql`exists (select 1 from ${s.personCommunityMemberships} m
    join ${s.communities} c on c.id = m.community_id
    where m.person_id = ${personId} and m.community_id = ${communityId}
      and m.status = 'active' and c.status = 'active')`;
}

// An active affiliation plus an unexpired Business Admin grant for the org.
function businessAdminAccess(personId: string, organizationId: string) {
  return sql`exists (select 1 from ${s.organizationAffiliations} a
    join ${s.roleGrants} g on g.organization_id = a.organization_id and g.person_id = a.person_id
    where a.person_id = ${personId} and a.organization_id = ${organizationId}
      and a.status = 'active' and g.role = 'business_admin' and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now()))`;
}

export type EventInput = {
  communityId: string; title: string; startsAt: Date; endsAt?: Date | null;
  description?: string; location?: string; timezone?: string;
  capacity?: number | null; organizationId?: string | null;
};

function validateEvent(input: EventInput) {
  const communityId = boundedText(input.communityId, 200);
  const title = boundedText(input.title, 200);
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) throw new Error("Choose when the event starts.");
  const endsAt = input.endsAt ?? null;
  if (endsAt !== null && (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime()))) throw new Error("Invalid end time.");
  if (endsAt && endsAt.getTime() < input.startsAt.getTime()) throw new Error("The event cannot end before it starts.");
  const description = input.description ?? "";
  const location = input.location ?? "";
  const timezone = input.timezone ?? "UTC";
  if (typeof description !== "string" || description.length > 5000) throw new Error("Invalid description.");
  if (typeof location !== "string" || location.length > 500) throw new Error("Invalid location.");
  if (typeof timezone !== "string" || timezone.length > 100) throw new Error("Invalid timezone.");
  const capacity = input.capacity ?? null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) throw new Error("Capacity must be a positive whole number.");
  const organizationId = input.organizationId ? boundedText(input.organizationId, 200) : null;
  return { communityId, title, startsAt: input.startsAt, endsAt, description: description.trim(),
    location: location.trim(), timezone, capacity, organizationId };
}

export async function createEvent(db: Database, personId: string, input: EventInput) {
  const v = validateEvent(input);
  return withActor(db, personId, async tx => {
    // The organizer must actively belong to the first community they publish to;
    // a represented org must be one they administer.
    const [member] = await tx.select({ id: s.communities.id }).from(s.communities)
      .where(and(eq(s.communities.id, v.communityId), activeMember(personId, v.communityId)));
    if (!member) throw new Error("This community is not available to your account.");
    if (v.organizationId) {
      const [org] = await tx.select({ ok: businessAdminAccess(personId, v.organizationId) })
        .from(s.organizations).where(eq(s.organizations.id, v.organizationId));
      if (!org?.ok) throw new Error("You cannot organize on behalf of that organization.");
    }
    const event = { id: crypto.randomUUID(), organizerId: personId, organizationId: v.organizationId,
      title: v.title, description: v.description, location: v.location, timezone: v.timezone,
      startsAt: v.startsAt, endsAt: v.endsAt, capacity: v.capacity };
    await tx.insert(s.communityEvents).values(event);
    await tx.insert(s.eventPublications).values({ eventId: event.id, communityId: v.communityId, publishedBy: personId });
    return { id: event.id };
  });
}

export async function publishEvent(db: Database, personId: string, eventId: string, communityId: string) {
  boundedText(eventId, 200); boundedText(communityId, 200);
  // Add another community to an existing event (shared discovery, no copies).
  return withActor(db, personId, async tx => {
    const [event] = await tx.select({ id: s.communityEvents.id }).from(s.communityEvents)
      .where(and(eq(s.communityEvents.id, eventId), eq(s.communityEvents.organizerId, personId)));
    if (!event) throw new Error("You cannot publish this event.");
    const [member] = await tx.select({ id: s.communities.id }).from(s.communities)
      .where(and(eq(s.communities.id, communityId), activeMember(personId, communityId)));
    if (!member) throw new Error("You can only publish to a community you actively belong to.");
    await tx.insert(s.eventPublications).values({ eventId, communityId, publishedBy: personId })
      .onConflictDoNothing({ target: [s.eventPublications.eventId, s.eventPublications.communityId] });
  });
}

export async function cancelEvent(db: Database, personId: string, eventId: string) {
  boundedText(eventId, 200);
  const changed = await withActor(db, personId, tx => tx.update(s.communityEvents)
    .set({ status: "canceled" })
    .where(and(eq(s.communityEvents.id, eventId), eq(s.communityEvents.organizerId, personId)))
    .returning({ id: s.communityEvents.id }));
  if (!changed.length) throw new Error("You cannot cancel this event.");
}

export async function rsvpToEvent(db: Database, personId: string, eventId: string, status: "going" | "not_going") {
  boundedText(eventId, 200);
  if (status !== "going" && status !== "not_going") throw new Error("Invalid RSVP.");
  return withActor(db, personId, async tx => {
    // Serialize RSVPs for this event so the capacity check and the write are
    // atomic without depending on locking the organizer-owned event row.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`);
    // RLS scopes this to an event the actor may see; absent row → not available.
    const [event] = await tx.select({ id: s.communityEvents.id, capacity: s.communityEvents.capacity,
      status: s.communityEvents.status }).from(s.communityEvents).where(eq(s.communityEvents.id, eventId));
    if (!event) throw new Error("This event is not available to your account.");
    if (event.status === "canceled") throw new Error("This event has been canceled.");
    if (status === "going" && event.capacity !== null) {
      // The person cannot count others' RSVPs under RLS, so use the definer count.
      const [{ going }] = await tx.execute(sql`select collab_event_going_count(${eventId}) as going`) as unknown as { going: number }[];
      const [mine] = await tx.select({ status: s.eventRsvps.status }).from(s.eventRsvps)
        .where(and(eq(s.eventRsvps.eventId, eventId), eq(s.eventRsvps.personId, personId)));
      const alreadyGoing = mine?.status === "going";
      if (Number(going) + (alreadyGoing ? 0 : 1) > event.capacity) throw new Error("This event is full.");
    }
    // The person may SELECT their own RSVP row, so an upsert is safe under RLS.
    await tx.insert(s.eventRsvps).values({ eventId, personId, status, respondedAt: sql`now()` })
      .onConflictDoUpdate({ target: [s.eventRsvps.eventId, s.eventRsvps.personId], set: { status, respondedAt: sql`now()` } });
    return { status };
  });
}

export async function readEvents(db: Database, personId: string, communityId: string) {
  boundedText(communityId, 200);
  // Events published to this community that the actor may see (RLS scopes the
  // publication join to active members / the organizer). Attendance stays
  // private: the going count is surfaced only to the organizer; everyone else
  // gets a boolean `full` derived from it, plus their own RSVP status.
  return withActor(db, personId, async tx => {
    const organizer = alias(s.people, "event_organizer");
    const mine = alias(s.eventRsvps, "my_rsvp");
    const rows = await tx.select({ id: s.communityEvents.id, organizerId: s.communityEvents.organizerId,
      organizerName: organizer.name, organizationId: s.communityEvents.organizationId,
      organizationName: s.organizations.name, title: s.communityEvents.title,
      description: s.communityEvents.description, location: s.communityEvents.location,
      timezone: s.communityEvents.timezone, startsAt: s.communityEvents.startsAt, endsAt: s.communityEvents.endsAt,
      capacity: s.communityEvents.capacity, status: s.communityEvents.status,
      going: sql<number>`collab_event_going_count(${s.communityEvents.id})`, myStatus: mine.status })
      .from(s.communityEvents)
      .innerJoin(s.eventPublications, eq(s.eventPublications.eventId, s.communityEvents.id))
      .innerJoin(organizer, eq(organizer.id, s.communityEvents.organizerId))
      .leftJoin(s.organizations, eq(s.organizations.id, s.communityEvents.organizationId))
      .leftJoin(mine, and(eq(mine.eventId, s.communityEvents.id), eq(mine.personId, personId)))
      .where(eq(s.eventPublications.communityId, communityId))
      .orderBy(asc(s.communityEvents.startsAt), asc(s.communityEvents.id)).limit(100);
    const events = rows.map(r => {
      const going = Number(r.going);
      const isOrganizer = r.organizerId === personId;
      const { going: _going, myStatus, ...rest } = r;
      return { ...rest, mine: isOrganizer, myStatus: myStatus ?? null,
        full: r.capacity !== null && going >= r.capacity, goingCount: isOrganizer ? going : null };
    });
    return { events };
  });
}

export async function readEventAttendance(db: Database, personId: string, eventId: string) {
  boundedText(eventId, 200);
  // Organizer-only roster. RLS lets the organizer read every RSVP for their event;
  // a non-organizer would see only their own, so gate explicitly for a clean error.
  return withActor(db, personId, async tx => {
    const [event] = await tx.select({ id: s.communityEvents.id }).from(s.communityEvents)
      .where(and(eq(s.communityEvents.id, eventId), eq(s.communityEvents.organizerId, personId)));
    if (!event) throw new Error("Event attendance is not available to your account.");
    const attendees = await tx.select({ personId: s.eventRsvps.personId, name: s.people.name,
      status: s.eventRsvps.status, respondedAt: s.eventRsvps.respondedAt })
      .from(s.eventRsvps).innerJoin(s.people, eq(s.people.id, s.eventRsvps.personId))
      .where(eq(s.eventRsvps.eventId, eventId))
      .orderBy(asc(s.eventRsvps.status), asc(s.people.name)).limit(500);
    return { attendees };
  });
}
