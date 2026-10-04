import { sql } from "drizzle-orm";
import {
  boolean,
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
     * `user_roles` (multi-role model); a single text field here is never the
     * source of truth for permission checks.
     */
    role: text("role").notNull().default("CLIENT"), // SUPER_ADMIN | MANAGER | RECEPTIONIST | BARBER | CLIENT
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_phone_idx").on(t.phone)],
);

/**
 * Multi-role membership: one user can hold several roles at once
 * (e.g. Owner + Barber + Instructor, or Customer + Trainee).
 * Roles are identities; what each role may do is resolved in src/lib/rbac.ts.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // CLIENT | TRAINEE | BARBER | INSTRUCTOR | RECEPTIONIST | MANAGER | FINANCE | SUPER_ADMIN
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("barbers_slug_idx").on(t.slug)],
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
    /**
     * Only APPROVED skills take part in scheduling. A barber may claim a skill
     * themselves (PENDING); management approves or rejects the claim.
     */
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
  /**
   * Whether this service may run side-by-side with another one on a different
   * staff member (e.g. skin cleanse while hair colour processes). The visit is
   * still ONE appointment. Client-visible processing waiting is derived as
   * duration_min - barber_duration_min.
   */
  allowParallel: boolean("allow_parallel").notNull().default(false),
  /** Booking this service requires a manager/reception confirmation before it is CONFIRMED. */
  managerApprovalRequired: boolean("manager_approval_required").notNull().default(false),
  active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("services_slug_idx").on(t.slug)],
);

/**
 * Data-driven combination rules between two services (pair is order
 * insensitive; stored with serviceAId < serviceBId). Absence of a row means
 * the default policy: combinable, same barber preferred but not required.
 */
export const serviceCombinationRules = pgTable(
  "service_combination_rules",
  {
    id: serial("id").primaryKey(),
    serviceAId: integer("service_a_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    serviceBId: integer("service_b_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    canCombine: boolean("can_combine").notNull().default(true),
    sameBarberRequired: boolean("same_barber_required").notNull().default(false),
    /** Shown to the client verbatim when canCombine is false (reason, not just a disabled control). */
    note: text("note").notNull().default(""),
  },
  (t) => [uniqueIndex("combination_pair_idx").on(t.serviceAId, t.serviceBId)],
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
      .where(sql`status not in ('CANCELLED_BY_CLIENT','CANCELLED_BY_STAFF','CANCELLED_EXPIRED')`),
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

/**
 * Concrete timed sessions of a class. The availability engine treats a
 * session as a hard block for the instructor, so Academy and Salon calendars
 * know about each other (a barber who teaches cannot be booked the same hours).
 */
export const classSessions = pgTable(
  "class_sessions",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    /** Extra minutes the instructor stays occupied after the session (teardown). */
    bufferMin: integer("buffer_min").notNull().default(15),
  },
  (t) => [index("class_sessions_date_idx").on(t.date)],
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

export const portfolioItems = pgTable("portfolio_items", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id")
    .notNull()
    .references(() => barbers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").notNull().default("FADE"),
  imageUrl: text("image_url").notNull(),
});

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

/**
 * A hold covers an ENTIRE scheduling plan, not a single slot. Every segment
 * of the plan gets one row; they share `planId` and one expiry so the whole
 * visit is secured or nothing is.
 */
export const bookingHolds = pgTable(
  "booking_holds",
  {
    id: serial("id").primaryKey(),
    planId: text("plan_id"),
    barberId: integer("barber_id")
      .notNull()
      .references(() => barbers.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    startMin: integer("start_min").notNull(),
    durationMin: integer("duration_min").notNull().default(0),
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
