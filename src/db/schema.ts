import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["customer", "admin", "super_admin"]);
export const pricingModel = pgEnum("pricing_model", ["hourly", "fixed", "quote"]);
export const bookingFrequency = pgEnum("booking_frequency", ["one_time", "daily", "weekly", "monthly"]);
export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
]);
export const paymentMethod = pgEnum("payment_method", ["cash", "card_link"]);
export const paymentStatus = pgEnum("payment_status", ["unpaid", "link_sent", "paid", "refunded"]);
export const outboxChannel = pgEnum("outbox_channel", ["email", "whatsapp"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed"]);
export const enquiryKind = pgEnum("enquiry_kind", ["contact", "monthly_contract"]);
export const quoteStatus = pgEnum("quote_status", ["none", "sent", "accepted", "declined"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* Better Auth tables. Property names must match the names Better Auth expects. */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("customer"),
  phone: text("phone"),
  locale: text("locale").notNull().default("en"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  // Set when the customer asks for their account to be deleted; staff complete the request.
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("two_factor_user_idx").on(t.userId)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* Rate limits the app applies itself, such as per-email limits Better Auth does not cover. */
export const rateLimitBucket = pgTable("rate_limit_bucket", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/* Catalogue. Prices are stored in fils (AED 1 = 100 fils). */

export const serviceCategory = pgTable("service_category", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const service = pgTable(
  "service",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => serviceCategory.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    descriptionEn: text("description_en").notNull().default(""),
    descriptionAr: text("description_ar").notNull().default(""),
    pricingModel: pricingModel("pricing_model").notNull(),
    priceFils: integer("price_fils"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("service_category_idx").on(t.categoryId),
    check("service_price_set", sql`${t.pricingModel} = 'quote' OR ${t.priceFils} IS NOT NULL`),
    check("service_price_non_negative", sql`${t.priceFils} IS NULL OR ${t.priceFils} >= 0`),
  ],
);

export const addOn = pgTable(
  "add_on",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    priceFils: integer("price_fils"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [check("add_on_price_non_negative", sql`${t.priceFils} IS NULL OR ${t.priceFils} >= 0`)],
);

/* Customers and operations. */

export const customerAddress = pgTable(
  "customer_address",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull().default(""),
    building: text("building").notNull(),
    unit: text("unit").notNull(),
    area: text("area").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    ...timestamps,
  },
  (t) => [index("customer_address_user_idx").on(t.userId)],
);

/* Cleaners have no login in version one; dispatch assigns them to bookings. */
export const cleaner = pgTable("cleaner", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const booking = pgTable(
  "booking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique(),
    customerId: text("customer_id").references(() => user.id, { onDelete: "set null" }),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email").notNull(),
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "restrict" }),
    frequency: bookingFrequency("frequency").notNull(),
    cleanerCount: integer("cleaner_count").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    building: text("building").notNull(),
    unit: text("unit").notNull(),
    area: text("area").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    status: bookingStatus("status").notNull().default("pending"),
    paymentMethod: paymentMethod("payment_method").notNull(),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    // Quote bookings have no price until the team sends one.
    quoteRequired: boolean("quote_required").notNull().default(false),
    // The price staff send for a quote booking, and the customer's answer.
    quoteFils: integer("quote_fils"),
    quoteStatus: quoteStatus("quote_status").notNull().default("none"),
    serviceFils: integer("service_fils"),
    addOnsFils: integer("add_ons_fils").notNull().default(0),
    totalFils: integer("total_fils"),
    priceSnapshot: jsonb("price_snapshot").notNull(),
    notes: text("notes"),
    jobDetails: text("job_details"),
    locale: text("locale").notNull().default("en"),
    cancelReason: text("cancel_reason"),
    ...timestamps,
  },
  (t) => [
    index("booking_customer_idx").on(t.customerId),
    index("booking_start_idx").on(t.startAt),
    index("booking_status_idx").on(t.status),
    check("booking_cleaners_positive", sql`${t.cleanerCount} > 0`),
    check("booking_duration_positive", sql`${t.durationMinutes} > 0`),
    check("booking_end_after_start", sql`${t.endAt} > ${t.startAt}`),
    check("booking_total_non_negative", sql`${t.totalFils} IS NULL OR ${t.totalFils} >= 0`),
    check("booking_quote_non_negative", sql`${t.quoteFils} IS NULL OR ${t.quoteFils} >= 0`),
    check("booking_priced_or_quote", sql`${t.quoteRequired} OR ${t.totalFils} IS NOT NULL`),
  ],
);

export const bookingAddOn = pgTable(
  "booking_add_on",
  {
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    addOnId: uuid("add_on_id")
      .notNull()
      .references(() => addOn.id, { onDelete: "restrict" }),
    unitPriceFils: integer("unit_price_fils"),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.addOnId] })],
);

export const bookingAssignment = pgTable(
  "booking_assignment",
  {
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    cleanerId: uuid("cleaner_id")
      .notNull()
      .references(() => cleaner.id, { onDelete: "restrict" }),
    assignedBy: text("assigned_by").references(() => user.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.cleanerId] }), index("booking_assignment_cleaner_idx").on(t.cleanerId)],
);

/* Internal notes the team keeps on a booking. Customers never see these; the migration limits them to staff. */
export const bookingNote = pgTable(
  "booking_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_note_booking_idx").on(t.bookingId)],
);

export const bookingEvent = pgTable(
  "booking_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    fromStatus: bookingStatus("from_status"),
    toStatus: bookingStatus("to_status").notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_event_booking_idx").on(t.bookingId)],
);

/* Business settings the Super Admin can change, such as slot capacity and policy hours. */
export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/* Append-only: the migration blocks UPDATE and DELETE on this table. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    ipAddress: text("ip_address"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_actor_idx").on(t.actorId)],
);

/* Bookings save first; messages go through this queue so an outage cannot lose a booking. */
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: outboxChannel("channel").notNull(),
    template: text("template").notNull(),
    recipient: text("recipient").notNull(),
    payload: jsonb("payload").notNull(),
    bookingId: uuid("booking_id").references(() => booking.id, { onDelete: "set null" }),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [index("notification_outbox_due_idx").on(t.status, t.nextAttemptAt)],
);

/* Contact and monthly-contract enquiries from the public website. */
export const enquiry = pgTable(
  "enquiry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: enquiryKind("kind").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    service: text("service"),
    area: text("area"),
    message: text("message").notNull(),
    details: jsonb("details"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("enquiry_created_idx").on(t.createdAt)],
);
