import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    /**
     * Legacy primary role kept for display/compat only. Authorization reads
     * `user_roles` (multi-role model); this single field is not authoritative.
     */
    role: text("role").notNull().default("CLIENT"), // SUPER_ADMIN | MANAGER | RECEPTIONIST | BARBER | CLIENT
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_phone_idx").on(t.phone)],
);

/** Multi-role membership: one account may hold several independent roles. */
export const userRoles = pgTable(
  "user_roles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_roles_unique_idx").on(t.userId, t.role),
    index("user_roles_role_idx").on(t.role),
  ],
);

export const barbers = pgTable(
  "barbers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull().default("آرایشگر"),
    imageUrl: text("image_url").notNull().default(""),
    bio: text("bio").notNull().default(""),
    readme: text("readme").notNull().default(""),
    experienceYears: integer("experience_years").notNull().default(1),
    active: boolean("active").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("barbers_slug_idx").on(t.slug),
    uniqueIndex("barbers_user_id_unique_idx").on(t.userId).where(sql`${t.userId} is not null`),
    uniqueIndex("barbers_single_featured_idx").on(t.featured).where(sql`${t.featured} = true`),
  ],
);

export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const barberSkills = pgTable(
  "barber_skills",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("APPROVED"), // APPROVED | PENDING | REJECTED
    approvedBy: integer("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("barber_skill_idx").on(t.barberId, t.skillId)],
);

export const services = pgTable(
  "services",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    category: text("category").notNull().default("اصلاح"),
    requiredSkillId: integer("required_skill_id").references(() => skills.id),
    description: text("description").notNull().default(""),
    durationMin: integer("duration_min").notNull().default(30),
    barberDurationMin: integer("barber_duration_min").notNull().default(30),
    bufferMin: integer("buffer_min").notNull().default(5),
    basePrice: integer("base_price").notNull().default(0),
    paymentMode: text("payment_mode").notNull().default("NO_PAYMENT"), // NO_PAYMENT | DEPOSIT | FULL_PAYMENT
    depositAmount: integer("deposit_amount").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("services_slug_idx").on(t.slug)],
);

export const barberServices = pgTable(
  "barber_services",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    customPrice: integer("custom_price"),
    customDuration: integer("custom_duration"),
    customBarberDuration: integer("custom_barber_duration"),
  },
  (t) => [uniqueIndex("barber_service_idx").on(t.barberId, t.serviceId)],
);

/** weekday: 0=Saturday ... 6=Friday (Persian week) */
export const salonSchedule = pgTable(
  "salon_schedule",
  {
    id: serial("id").primaryKey(),
    weekday: integer("weekday").notNull(),
    openMin: integer("open_min").notNull().default(600),
    closeMin: integer("close_min").notNull().default(1320),
    closed: boolean("closed").notNull().default(false),
  },
  (t) => [uniqueIndex("salon_schedule_weekday_idx").on(t.weekday)],
);

export const barberSchedule = pgTable(
  "barber_schedule",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMin: integer("start_min").notNull().default(600),
    endMin: integer("end_min").notNull().default(1320),
    dayOff: boolean("day_off").notNull().default(false),
  },
  (t) => [uniqueIndex("barber_schedule_idx").on(t.barberId, t.weekday)],
);

export const blockedTimes = pgTable(
  "blocked_times",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    reason: text("reason").notNull().default("BLOCKED"),
    fullDay: boolean("full_day").notNull().default(false),
  },
  (t) => [index("blocked_times_barber_date_idx").on(t.barberId, t.date)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    clientName: text("client_name").notNull(),
    clientPhone: text("client_phone").notNull(),
    bookingGroupId: text("booking_group_id"),
    date: text("date").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    barberEndMin: integer("barber_end_min").notNull(),
    priceSnapshot: integer("price_snapshot").notNull().default(0),
    status: text("status").notNull().default("CONFIRMED"),
    source: text("source").notNull().default("ONLINE"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointments_barber_date_idx").on(t.barberId, t.date),
    index("appointments_status_idx").on(t.status),
    index("appointments_booking_group_idx").on(t.bookingGroupId),
    uniqueIndex("appointments_slot_unique")
      .on(t.barberId, t.date, t.startMin)
      .where(sql`status not in ('CANCELLED_BY_CLIENT','CANCELLED_BY_STAFF')`),
  ],
);

export const classes = pgTable(
  "classes",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    instructorBarberId: integer("instructor_barber_id").references(() => barbers.id),
    kind: text("kind").notNull().default("WORKSHOP"),
    level: text("level").notNull().default("BEGINNER"),
    capacity: integer("capacity").notNull().default(10),
    seatsTaken: integer("seats_taken").notNull().default(0),
    price: integer("price").notNull().default(0),
    startsOn: text("starts_on").notNull(),
    sessions: integer("sessions").notNull().default(1),
    location: text("location").notNull().default("سالن مرکزی"),
    status: text("status").notNull().default("OPEN"),
    outcomes: text("outcomes").notNull().default(""),
  },
  (t) => [uniqueIndex("classes_slug_idx").on(t.slug)],
);

/** Admin-managed site content/configuration. */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Editable pages keep a private draft beside the explicitly published revision. */
export const siteContentDocuments = pgTable(
  "site_content_documents",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    draftContent: text("draft_content").notNull().default("{}"),
    publishedContent: text("published_content"),
    draftVersion: integer("draft_version").notNull().default(1),
    publishedVersion: integer("published_version"),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    publishedBy: integer("published_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("site_content_documents_slug_unique_idx").on(t.slug),
    check("site_content_documents_slug_check", sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{0,79}$'`),
    check("site_content_documents_draft_version_check", sql`${t.draftVersion} > 0`),
    check("site_content_documents_published_version_check", sql`${t.publishedVersion} is null or ${t.publishedVersion} > 0`),
  ],
);

/** Server-managed metadata for files in the reusable media library. */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: serial("id").primaryKey(),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mediaType: text("media_type").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("media_assets_storage_key_unique_idx").on(t.storageKey),
    index("media_assets_created_at_idx").on(t.createdAt),
    check("media_assets_media_type_check", sql`${t.mediaType} in ('image', 'video')`),
    check("media_assets_file_size_check", sql`${t.fileSize} > 0`),
  ],
);

export const classRegistrations = pgTable(
  "class_registrations",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentName: text("student_name").notNull(),
    studentPhone: text("student_phone").notNull(),
    status: text("status").notNull().default("CONFIRMED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("class_registrations_class_idx").on(t.classId),
    uniqueIndex("class_registration_unique").on(t.classId, t.studentPhone),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // APPOINTMENT | APPOINTMENT_GROUP | CLASS
    refId: integer("ref_id").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("PENDING"),
    reference: text("reference").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_status_idx").on(t.status),
    uniqueIndex("payments_reference_idx").on(t.reference),
  ],
);

export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("FADE"),
    imageUrl: text("image_url").notNull(),
    isPublic: boolean("is_public").notNull().default(true),
  },
  (t) => [index("portfolio_items_is_public_idx").on(t.isPublic, t.barberId)],
);

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id")
    .notNull()
    .references(() => barbers.id, { onDelete: "cascade" }),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  clientName: text("client_name").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    targetRole: text("target_role").notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("NEW_BOOKING"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_role_idx").on(t.targetRole)],
);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSecrets = pgTable("app_secrets", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otps = pgTable("otps", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookingPolicyAcceptance = pgTable(
  "booking_policy_acceptance",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    policyVersion: text("policy_version").notNull().default("1.0"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("policy_user_ver_idx").on(t.userId, t.policyVersion)],
);

export const bookingHolds = pgTable(
  "booking_holds",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    startMin: integer("start_min").notNull(),
    clientPhone: text("client_phone").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_holds_slot_idx").on(t.barberId, t.date, t.startMin)],
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    category: text("category").notNull().default("استایل مو"),
    price: integer("price").notNull().default(0),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url").notNull(),
    inStock: boolean("in_stock").notNull().default(true),
    rating: integer("rating").notNull().default(5),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("products_slug_idx").on(t.slug)],
);
