// Drizzle/Postgres schema for the SBRA app — the "swap" target (ticket #12).
// Mirrors the domain model in lib/types.ts. Time fields are stored as bigint
// epoch-milliseconds so they map 1:1 to the client's `number` timestamps.
import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const businesses = pgTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  description: text("description").notNull().default(""),
  servicesOffered: text("services_offered").notNull().default(""),
  referralsWanted: text("referrals_wanted").notNull().default(""),
  website: text("website").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  tier: text("tier").notNull().default("solo"),
  createdAt: bigint("created_at", { mode: "number" }).notNull()
});

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  uid: text("uid"),
  role: text("role").default("member"),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().default(""),
  bio: text("bio").notNull().default(""),
  isOwner: boolean("is_owner").notNull().default(false)
});

export const referrals = pgTable("referrals", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  giverId: text("giver_id").notNull(),
  receiverId: text("receiver_id").notNull(),
  introducedMemberId: text("introduced_member_id"),
  prospectName: text("prospect_name"),
  prospectContact: text("prospect_contact"),
  need: text("need").notNull().default(""),
  status: text("status").notNull().default("given"),
  closedValue: doublePrecision("closed_value"),
  thankYou: text("thank_you"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  closedAt: bigint("closed_at", { mode: "number" })
});

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull().default(""),
  startsAt: bigint("starts_at", { mode: "number" }).notNull(),
  endsAt: bigint("ends_at", { mode: "number" }),
  recurrence: text("recurrence").notNull().default("none"),
  venueName: text("venue_name").notNull().default(""),
  venueAddress: text("venue_address").notNull().default(""),
  hostMemberId: text("host_member_id"),
  cost: doublePrecision("cost").notNull().default(0),
  capacity: integer("capacity"),
  createdById: text("created_by_id").notNull()
});

export const rsvps = pgTable(
  "rsvps",
  {
    eventId: text("event_id").notNull(),
    memberId: text("member_id").notNull(),
    status: text("status").notNull().default("going"),
    checkedIn: boolean("checked_in").notNull().default(false),
    respondedAt: bigint("responded_at", { mode: "number" }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.memberId] })
  })
);

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id"),
  author: text("author").notNull(),
  businessName: text("business_name").notNull().default(""),
  timeAgo: text("time_ago").notNull().default(""),
  category: text("category").notNull().default("General"),
  tone: text("tone").notNull().default("green"),
  body: text("body").notNull().default(""),
  note: text("note"),
  reactions: integer("reactions").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull()
});

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull()
});

export const reactions = pgTable("reactions", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  memberId: text("member_id").notNull(),
  type: text("type").notNull().default("celebrate")
});

export const supportRequests = pgTable("support_requests", {
  id: text("id").primaryKey(),
  authorId: text("author_id"),
  title: text("title").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("New request"),
  detail: text("detail").notNull().default(""),
  createdAt: bigint("created_at", { mode: "number" })
});

// ---- Auth.js (NextAuth) Drizzle adapter tables ----
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image")
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state")
  },
  (table) => ({
    pk: primaryKey({ columns: [table.provider, table.providerAccountId] })
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull()
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] })
  })
);
