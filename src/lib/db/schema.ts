import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  index,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const userRole = pgEnum("user_role", ["client", "admin"]);
export const subPlan = pgEnum("sub_plan", ["start", "growth", "business", "scale"]);
export const subStatus = pgEnum("sub_status", ["active", "past_due", "paused", "canceled"]);
export const avitoStatus = pgEnum("avito_status", ["pending", "connected", "blocked"]);
export const proxyProvider = pgEnum("proxy_provider", ["ltespace", "ltecenter", "other"]);
export const proxyStatus = pgEnum("proxy_status", ["free", "assigned", "banned", "dead"]);
export const listingStatus = pgEnum("listing_status", [
  "draft",
  "queued",
  "publishing",
  "live",
  "error",
  "paused",
]);
export const jobType = pgEnum("job_type", [
  "publish",
  "update",
  "reply",
  "promo",
  "report",
  "heal_access",
]);
export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "done",
  "failed",
  "canceled",
]);
export const leadUrgency = pgEnum("lead_urgency", ["hot", "normal"]);
export const leadStatus = pgEnum("lead_status", ["new", "handled", "escalated_to_client"]);
export const ledgerKind = pgEnum("ledger_kind", [
  "subscription",
  "deposit",
  "promo_spend",
  "refund",
]);
export const workMode = pgEnum("work_mode", ["own_cabinet", "materials_only"]);
export const paymentKind = pgEnum("payment_kind", ["subscription", "deposit"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "rejected"]);
export const notifyChannel = pgEnum("notify_channel", ["email", "telegram", "operator"]);
export const notifyStatus = pgEnum("notify_status", ["pending", "sent"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  phone: text("phone"),
  telegram: text("telegram"),
  role: userRole("role").notNull().default("client"),
  passwordHash: text("password_hash").notNull(),
  cabinetConsentAt: timestamp("cabinet_consent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    plan: subPlan("plan").notNull(),
    status: subStatus("status").notNull().default("active"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    paymentProvider: text("payment_provider"),
    paymentProviderId: text("payment_provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("subscriptions_user_id_unique").on(table.userId)],
);

export const avitoAccounts = pgTable(
  "avito_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    loginHint: text("login_hint"),
    status: avitoStatus("status").notNull().default("pending"),
    avitoUserId: text("avito_user_id"),
    refreshToken: text("refresh_token"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("avito_accounts_user_id_unique").on(table.userId)],
);

export const proxySlots = pgTable("proxy_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: proxyProvider("provider").notNull(),
  label: text("label").notNull(),
  region: text("region"),
  operator: text("operator"),
  status: proxyStatus("status").notNull().default("free"),
  assignedUserId: uuid("assigned_user_id").references(() => users.id),
  secretRef: text("secret_ref").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  category: text("category").notNull(),
  city: text("city").notNull(),
  priceRub: integer("price_rub").notNull(),
  body: text("body").notNull(),
  photos: jsonb("photos").$type<string[]>().notNull().default([]),
  avitoUrl: text("avito_url"),
  externalId: text("external_id"),
  status: listingStatus("status").notNull().default("draft"),
  errorNote: text("error_note"),
  sku: text("sku"),
  deliveryNote: text("delivery_note"),
  kitNote: text("kit_note"),
  operatorNotes: text("operator_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  listingId: uuid("listing_id").references(() => listings.id),
  type: jobType("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: jobStatus("status").notNull().default("queued"),
  assignedAgent: text("assigned_agent"),
  createdBy: text("created_by").notNull().default("system"),
  errorCode: text("error_code"),
  errorNote: text("error_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const messagesDigest = pgTable("messages_digest", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  listingId: uuid("listing_id").references(() => listings.id),
  preview: text("preview").notNull(),
  externalRef: text("external_ref"),
  urgency: leadUrgency("urgency").notNull().default("normal"),
  status: leadStatus("status").notNull().default("new"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promoBudgets = pgTable("promo_budgets", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  weekLimitRub: integer("week_limit_rub").notNull().default(0),
  spentRub: integer("spent_rub").notNull().default(0),
  enabled: boolean("enabled").notNull().default(false),
  weekStart: date("week_start", { mode: "string" }).notNull(),
});

export const ledger = pgTable("ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  kind: ledgerKind("kind").notNull(),
  amountRub: integer("amount_rub").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accessStatus = pgTable("access_status", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  state: text("state").notNull(),
  reason: text("reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientProfiles = pgTable("client_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  companyName: text("company_name").notNull(),
  phone: text("phone").notNull(),
  telegram: text("telegram"),
  workMode: workMode("work_mode").notNull(),
  cities: text("cities").array().notNull(),
  categories: text("categories").array().notNull(),
  replyRules: text("reply_rules"),
  escalateRules: text("escalate_rules"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentRequests = pgTable("payment_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  kind: paymentKind("kind").notNull(),
  plan: subPlan("plan"),
  amountRub: integer("amount_rub").notNull(),
  status: paymentStatus("status").notNull().default("pending"),
  providerPaymentId: text("provider_payment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deskTasks = pgTable("desk_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  listingId: uuid("listing_id").references(() => listings.id),
  role: text("role").notNull(),
  status: text("status").notNull().default("queued"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const curatorOffers = pgTable("curator_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guestDrafts = pgTable(
  "guest_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    product: text("product"),
    location: text("location"),
    price: integer("price"),
    title: text("title"),
    description: text("description"),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    visibleTranscript: jsonb("visible_transcript")
      .$type<{ role: "user" | "assistant"; content: string; at: string }[]>()
      .notNull()
      .default([]),
    missingFields: jsonb("missing_fields").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, { onDelete: "cascade" }),
    claimedListingId: uuid("claimed_listing_id").references(() => listings.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("guest_drafts_token_hash_unique").on(table.tokenHash),
    index("guest_drafts_claimed_by_user_id_idx").on(table.claimedByUserId),
    index("guest_drafts_status_expires_idx").on(table.status, table.expiresAt),
  ],
);

export const curatorLines = pgTable("curator_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  cardHref: text("card_href"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  channel: notifyChannel("channel").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: notifyStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  attemptAt: timestamp("attempt_at", { withTimezone: true }),
});

export type Plan = (typeof subPlan.enumValues)[number];
export type JobType = (typeof jobType.enumValues)[number];
export type JobStatus = (typeof jobStatus.enumValues)[number];
export type ListingStatus = (typeof listingStatus.enumValues)[number];
export type AccessState = "green" | "yellow" | "red";
