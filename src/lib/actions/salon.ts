"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  appointments,
  auditLogs,
  barberSchedule,
  barberServices,
  barberSkills,
  barbers,
  blockedTimes,
  classSessions,
  classes,
  notifications,
  salonSchedule,
  serviceCombinationRules,
  services,
  userRoles,
  users,
} from "@/db/schema";
import { getCurrentUser, isStaff, type SessionUser } from "@/lib/session";
import { Permission } from "@/lib/rbac";
import { hashPassword } from "@/lib/passwords";
import { isValidISODate } from "@/lib/time";

export type ActionResult = { ok: boolean; message: string };

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

/** Permission-based gate: roles live in user_roles, not a single column. */
async function requirePermission(permission: Permission): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has(permission)) return null;
  return user;
}

async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && user.roles.includes("SUPER_ADMIN") ? user : null;
}

async function requireBarberAccess(barberId: number): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.permissions.has("staff:manage")) return user; // manager/owner may edit anyone
  if (user.roles.includes("BARBER") && user.barberId === barberId) return user;
  return null;
}

async function audit(actor: string, action: string, target: string) {
  await db.insert(auditLogs).values({ actor, action, target });
}

/* ---------- Admin ---------- */

const CreateBarberSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "شناسه باید انگلیسی و با خط تیره باشد"),
  title: z.string().trim().min(2).max(60),
  phone: z
    .string()
    .trim()
    .regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"),
  password: z.string().min(6).max(72),
  bio: z.string().trim().max(600).optional().default(""),
});

export async function createBarberAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return fail("دسترسی غیرمجاز.");
  const parsed = CreateBarberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const data = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: data.name,
          phone: data.phone,
          role: "BARBER",
          passwordHash: hashPassword(data.password),
        })
        .returning();
      const [barber] = await tx
        .insert(barbers)
        .values({
          userId: user.id,
          name: data.name,
          slug: data.slug,
          title: data.title,
          bio: data.bio ?? "",
        })
        .returning();
      for (let weekday = 0; weekday < 7; weekday += 1) {
        await tx.insert(barberSchedule).values({
          barberId: barber.id,
          weekday,
          startMin: 600,
          endMin: 1320,
          dayOff: weekday === 6,
        });
      }
    });
  } catch {
    return fail("شناسه یا شماره موبایل تکراری است.");
  }

  await audit(`user:${admin.id}`, "BARBER_CREATED", data.slug);
  revalidatePath("/admin");
  revalidatePath("/barbers");
  return ok("آرایشگر ایجاد شد.");
}

const ServiceSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/),
  description: z.string().trim().max(300).optional().default(""),
  durationMin: z.coerce.number().int().min(10).max(240),
  barberDurationMin: z.coerce.number().int().min(5).max(240).optional(),
  bufferMin: z.coerce.number().int().min(0).max(60),
  basePrice: z.coerce.number().int().min(0).max(100_000_000),
});

export async function createServiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return fail("دسترسی غیرمجاز.");
  const parsed = ServiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const serviceData = {
    ...parsed.data,
    barberDurationMin: parsed.data.barberDurationMin ?? parsed.data.durationMin,
  };
  if (serviceData.barberDurationMin > serviceData.durationMin)
    return fail("مدت کار آرایشگر نمی‌تواند از مدت کل خدمت بیشتر باشد.");
  try {
    await db.insert(services).values(serviceData);
  } catch {
    return fail("شناسه سرویس تکراری است.");
  }
  await audit(`user:${admin.id}`, "SERVICE_CREATED", serviceData.slug);
  revalidatePath("/admin");
  return ok("سرویس ایجاد شد.");
}

export async function toggleBarberServiceAction(formData: FormData): Promise<void> {
  const barberId = Number(formData.get("barberId"));
  const serviceId = Number(formData.get("serviceId"));
  const user = await requireBarberAccess(barberId);
  if (!user || !Number.isInteger(barberId) || !Number.isInteger(serviceId)) return;

  const [existing] = await db
    .select()
    .from(barberServices)
    .where(and(eq(barberServices.barberId, barberId), eq(barberServices.serviceId, serviceId)))
    .limit(1);
  if (existing) {
    await db.delete(barberServices).where(eq(barberServices.id, existing.id));
  } else {
    await db.insert(barberServices).values({ barberId, serviceId });
  }
  revalidatePath("/admin");
  revalidatePath("/barber");
}

export async function setSalonHoursAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return fail("دسترسی غیرمجاز.");
  const weekday = Number(formData.get("weekday"));
  const openMin = Number(formData.get("openMin"));
  const closeMin = Number(formData.get("closeMin"));
  const closed = formData.get("closed") === "on";
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return fail("روز نامعتبر است.");
  if (!closed && (openMin >= closeMin || openMin < 0 || closeMin > 1440)) {
    return fail("ساعات نامعتبر است.");
  }
  await db
    .insert(salonSchedule)
    .values({ weekday, openMin, closeMin, closed })
    .onConflictDoUpdate({
      target: salonSchedule.weekday,
      set: { openMin, closeMin, closed },
    });
  await audit(`user:${admin.id}`, "SALON_HOURS_UPDATED", `weekday:${weekday}`);
  revalidatePath("/admin");
  return ok("ساعات سالن به‌روزرسانی شد.");
}

/* ---------- Barber scheduling ---------- */

export async function setBarberDayAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const barberId = Number(formData.get("barberId"));
  const user = await requireBarberAccess(barberId);
  if (!user) return fail("دسترسی غیرمجاز.");
  const weekday = Number(formData.get("weekday"));
  const startMin = Number(formData.get("startMin"));
  const endMin = Number(formData.get("endMin"));
  const dayOff = formData.get("dayOff") === "on";
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return fail("روز نامعتبر است.");
  if (!dayOff && (startMin >= endMin || startMin < 0 || endMin > 1440)) {
    return fail("ساعات نامعتبر است.");
  }
  await db
    .insert(barberSchedule)
    .values({ barberId, weekday, startMin, endMin, dayOff })
    .onConflictDoUpdate({
      target: [barberSchedule.barberId, barberSchedule.weekday],
      set: { startMin, endMin, dayOff },
    });
  await audit(`user:${user.id}`, "BARBER_SCHEDULE_UPDATED", `barber:${barberId}`);
  revalidatePath("/barber");
  revalidatePath("/admin");
  return ok("برنامه هفتگی به‌روزرسانی شد.");
}

const TEMPLATES: Record<string, { startMin: number; endMin: number; offWeekdays: number[] }> = {
  SALON: { startMin: 0, endMin: 0, offWeekdays: [] },
  FULL: { startMin: 600, endMin: 1320, offWeekdays: [6] },
  EVENING: { startMin: 900, endMin: 1320, offWeekdays: [6] },
  WEEKEND: { startMin: 600, endMin: 1080, offWeekdays: [1, 2, 3] },
};

export async function applyScheduleTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const barberId = Number(formData.get("barberId"));
  const template = String(formData.get("template") ?? "");
  const user = await requireBarberAccess(barberId);
  if (!user) return fail("دسترسی غیرمجاز.");
  const preset = TEMPLATES[template];
  if (!preset) return fail("قالب نامعتبر است.");

  const salonRows = await db.select().from(salonSchedule);
  await db.transaction(async (tx) => {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const salon = salonRows.find((s) => s.weekday === weekday);
      const useSalon = template === "SALON";
      const startMin = useSalon ? (salon?.openMin ?? 600) : preset.startMin;
      const endMin = useSalon ? (salon?.closeMin ?? 1320) : preset.endMin;
      const dayOff = useSalon
        ? Boolean(salon?.closed)
        : preset.offWeekdays.includes(weekday);
      await tx
        .insert(barberSchedule)
        .values({ barberId, weekday, startMin, endMin, dayOff })
        .onConflictDoUpdate({
          target: [barberSchedule.barberId, barberSchedule.weekday],
          set: { startMin, endMin, dayOff },
        });
    }
  });
  await audit(`user:${user.id}`, "SCHEDULE_TEMPLATE_APPLIED", `${template}:${barberId}`);
  revalidatePath("/barber");
  return ok(template === "SALON" ? "ساعات سالن اعمال شد." : "قالب اعمال شد.");
}

const BlockSchema = z.object({
  barberId: z.coerce.number().int().positive(),
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر است"),
  startMin: z.coerce.number().int().min(0).max(1440),
  endMin: z.coerce.number().int().min(0).max(1440),
  reason: z.string().trim().min(2).max(60),
  fullDay: z.union([z.literal("on"), z.undefined()]).optional(),
});

export async function blockTimeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = BlockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const user = await requireBarberAccess(parsed.data.barberId);
  if (!user) return fail("دسترسی غیرمجاز.");
  const fullDay = parsed.data.fullDay === "on";
  if (!fullDay && parsed.data.startMin >= parsed.data.endMin) return fail("بازه زمانی نامعتبر است.");
  await db.insert(blockedTimes).values({
    barberId: parsed.data.barberId,
    date: parsed.data.date,
    startMin: fullDay ? 0 : parsed.data.startMin,
    endMin: fullDay ? 1440 : parsed.data.endMin,
    reason: parsed.data.reason,
    fullDay,
  });
  await audit(`user:${user.id}`, "TIME_BLOCKED", `barber:${parsed.data.barberId}`);
  revalidatePath("/barber");
  return ok("زمان مسدود شد.");
}

export async function removeBlockAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("blockId"));
  if (!Number.isInteger(id)) return;
  const [row] = await db.select().from(blockedTimes).where(eq(blockedTimes.id, id)).limit(1);
  if (!row) return;
  const user = await requireBarberAccess(row.barberId);
  if (!user) return;
  await db.delete(blockedTimes).where(eq(blockedTimes.id, id));
  revalidatePath("/barber");
}

const PROFILE_MAX = 4000;

export async function updateBarberProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const barberId = Number(formData.get("barberId"));
  const user = await requireBarberAccess(barberId);
  if (!user) return fail("دسترسی غیرمجاز.");
  const title = String(formData.get("title") ?? "").trim().slice(0, 60);
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 600);
  const readme = String(formData.get("readme") ?? "")
    .replace(/<[^>]*>/g, "")
    .slice(0, PROFILE_MAX);
  if (title.length < 2) return fail("عنوان کوتاه است.");
  await db.update(barbers).set({ title, bio, readme }).where(eq(barbers.id, barberId));
  revalidatePath("/barber");
  revalidatePath("/barbers");
  return ok("پروفایل ذخیره شد.");
}

/* ---------- Appointments ---------- */

const STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED_BY_CLIENT",
  "CANCELLED_BY_STAFF",
] as const;

export async function updateAppointmentStatusAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("appointmentId"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isInteger(id) || !STATUSES.includes(status as (typeof STATUSES)[number])) return;
  const [row] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  if (!row) return;
  const user = await getCurrentUser();
  if (!user) return;
  const allowed = isStaff(user) || (user.roles.includes("BARBER") && user.barberId === row.barberId);
  if (!allowed) return;
  await db.update(appointments).set({ status }).where(eq(appointments.id, id));
  await audit(`user:${user.id}`, "APPOINTMENT_STATUS_CHANGED", `appointment:${id}:${status}`);
  revalidatePath("/admin");
  revalidatePath("/barber");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT") return;
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.targetRole, user.role), eq(notifications.isRead, false)));
  revalidatePath("/admin");
  revalidatePath("/barber");
}

/* ---------- Academy ---------- */

const ClassSchema = z.object({
  title: z.string().trim().min(3).max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,50}$/),
  description: z.string().trim().max(800).optional().default(""),
  instructorBarberId: z.coerce.number().int().positive(),
  capacity: z.coerce.number().int().min(1).max(100),
  price: z.coerce.number().int().min(0),
  startsOn: z.string().refine(isValidISODate),
  sessions: z.coerce.number().int().min(1).max(30),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
});

export async function createClassAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return fail("دسترسی غیرمجاز.");
  const parsed = ClassSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  try {
    await db.insert(classes).values(parsed.data);
  } catch {
    return fail("شناسه دوره تکراری است.");
  }
  await audit(`user:${admin.id}`, "CLASS_CREATED", parsed.data.slug);
  revalidatePath("/admin");
  revalidatePath("/academy");
  return ok("دوره ایجاد شد.");
}

/* ---------- Skill approval (skills are claims; management approves) ---------- */

const SkillClaimSchema = z.object({
  barberId: z.coerce.number().int().positive(),
  skillId: z.coerce.number().int().positive(),
});

/** A barber claims a skill for themselves: it lands as PENDING, never self-approved. */
export async function requestSkillAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = SkillClaimSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("داده نامعتبر است.");
  const user = await requireBarberAccess(parsed.data.barberId);
  if (!user) return fail("دسترسی غیرمجاز.");
  try {
    await db
      .insert(barberSkills)
      .values({
        barberId: parsed.data.barberId,
        skillId: parsed.data.skillId,
        status: "PENDING",
      })
      .onConflictDoUpdate({
        target: [barberSkills.barberId, barberSkills.skillId],
        set: { status: "PENDING", approvedBy: null, approvedAt: null },
      });
  } catch {
    return fail("مهارت یافت نشد.");
  }
  await audit(`user:${user.id}`, "SKILL_CLAIMED", `barber:${parsed.data.barberId}:skill:${parsed.data.skillId}`);
  revalidatePath("/barber");
  revalidatePath("/admin");
  return ok("درخواست ثبت شد و در انتظار تأیید مدیریت است.");
}

const SkillDecisionSchema = z.object({
  membershipId: z.coerce.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT"]),
});

export async function decideSkillAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = SkillDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("داده نامعتبر است.");
  const manager = await requirePermission("skills:approve");
  if (!manager) return fail("دسترسی غیرمجاز.");
  const update =
    parsed.data.decision === "APPROVE"
      ? { status: "APPROVED", approvedBy: manager.id, approvedAt: new Date() }
      : { status: "REJECTED", approvedBy: manager.id, approvedAt: new Date() };
  const [row] = await db
    .update(barberSkills)
    .set(update)
    .where(eq(barberSkills.id, parsed.data.membershipId))
    .returning({ barberId: barberSkills.barberId });
  if (!row) return fail("درخواست یافت نشد.");
  await db.insert(notifications).values({
    targetRole: "BARBER",
    kind: "SKILL_DECISION",
    title: parsed.data.decision === "APPROVE" ? "مهارت شما تأیید شد" : "مهارت شما تأیید نشد",
    body:
      parsed.data.decision === "APPROVE"
        ? "این مهارت از این پس در زمان‌بندی نوبت‌ها فعال است."
        : "برای بررسی بیشتر با مدیر سالن گفت‌وگو کنید.",
  });
  await audit(`user:${manager.id}`, `SKILL_${parsed.data.decision}`, `membership:${parsed.data.membershipId}`);
  revalidatePath("/admin");
  revalidatePath("/barber");
  return ok(parsed.data.decision === "APPROVE" ? "مهارت تأیید شد." : "مهارت رد شد.");
}

/** Manager removes a skill link entirely (revoke). */
export async function revokeSkillAction(formData: FormData): Promise<void> {
  const membershipId = Number(formData.get("membershipId"));
  if (!Number.isInteger(membershipId)) return;
  const manager = await requirePermission("skills:approve");
  if (!manager) return;
  await db.delete(barberSkills).where(eq(barberSkills.id, membershipId));
  revalidatePath("/admin");
  revalidatePath("/barber");
}

/* ---------- Service combination rules (data-driven, admin UI) ---------- */

const CombinationRuleSchema = z.object({
  serviceAId: z.coerce.number().int().positive(),
  serviceBId: z.coerce.number().int().positive(),
  canCombine: z.union([z.literal("on"), z.undefined()]).optional(),
  sameBarberRequired: z.union([z.literal("on"), z.undefined()]).optional(),
  note: z.string().trim().max(200).optional().default(""),
});

export async function upsertCombinationRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = CombinationRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("داده نامعتبر است.");
  const { serviceAId, serviceBId } = parsed.data;
  if (serviceAId === serviceBId) return fail("یک خدمت با خودش ترکیب نمی‌شود.");
  const manager = await requirePermission("services:manage");
  if (!manager) return fail("دسترسی غیرمجاز.");
  const [a, b] = serviceAId < serviceBId ? [serviceAId, serviceBId] : [serviceBId, serviceAId];
  await db
    .insert(serviceCombinationRules)
    .values({
      serviceAId: a,
      serviceBId: b,
      canCombine: parsed.data.canCombine === "on",
      sameBarberRequired: parsed.data.sameBarberRequired === "on",
      note: parsed.data.note ?? "",
    })
    .onConflictDoUpdate({
      target: [serviceCombinationRules.serviceAId, serviceCombinationRules.serviceBId],
      set: {
        canCombine: parsed.data.canCombine === "on",
        sameBarberRequired: parsed.data.sameBarberRequired === "on",
        note: parsed.data.note ?? "",
      },
    });
  await audit(`user:${manager.id}`, "COMBINATION_RULE_SAVED", `${a}:${b}`);
  revalidatePath("/admin");
  return ok("قانون ترکیب ذخیره شد.");
}

export async function deleteCombinationRuleAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("ruleId"));
  if (!Number.isInteger(id)) return;
  const manager = await requirePermission("services:manage");
  if (!manager) return;
  await db.delete(serviceCombinationRules).where(eq(serviceCombinationRules.id, id));
  revalidatePath("/admin");
}

/* ---------- Roles & permissions (multi-role membership) ---------- */

const RoleMembershipSchema = z.object({
  userId: z.coerce.number().int().positive(),
  role: z.enum(["CLIENT", "TRAINEE", "BARBER", "INSTRUCTOR", "RECEPTIONIST", "MANAGER", "FINANCE", "SUPER_ADMIN"]),
  action: z.enum(["GRANT", "REVOKE"]),
});

export async function setRoleMembershipAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = RoleMembershipSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("داده نامعتبر است.");
  const owner = await requirePermission("roles:manage");
  if (!owner) return fail("دسترسی غیرمجاز.");
  if (parsed.data.userId === owner.id && parsed.data.role === "SUPER_ADMIN" && parsed.data.action === "REVOKE")
    return fail("نمی‌توانید نقش مدیر ارشد خود را بردارید.");
  if (parsed.data.action === "GRANT") {
    // user_roles is the source of truth; the legacy users.role column is not touched.
    await db
      .insert(userRoles)
      .values({ userId: parsed.data.userId, role: parsed.data.role })
      .onConflictDoNothing();
  } else {
    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, parsed.data.userId), eq(userRoles.role, parsed.data.role)));
  }
  await audit(`user:${owner.id}`, `ROLE_${parsed.data.action}`, `user:${parsed.data.userId}:${parsed.data.role}`);
  revalidatePath("/admin");
  return ok("دسترسی به‌روزرسانی شد.");
}

/* ---------- Class sessions (academy blocks instructor availability) ---------- */

const ClassSessionSchema = z.object({
  classId: z.coerce.number().int().positive(),
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر است"),
  startMin: z.coerce.number().int().min(0).max(1439),
  endMin: z.coerce.number().int().min(1).max(1440),
});

export async function addClassSessionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = ClassSessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("داده نامعتبر است.");
  if (parsed.data.startMin >= parsed.data.endMin) return fail("بازه زمانی نامعتبر است.");
  const manager = await requirePermission("academy:manage");
  if (!manager) return fail("دسترسی غیرمجاز.");
  await db.insert(classSessions).values(parsed.data);
  await audit(`user:${manager.id}`, "CLASS_SESSION_ADDED", `class:${parsed.data.classId}:${parsed.data.date}`);
  revalidatePath("/admin");
  revalidatePath("/barber");
  return ok("جلسه ثبت شد و در تقویم مدرس مسدود می‌شود.");
}

export async function removeClassSessionAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("sessionId"));
  if (!Number.isInteger(id)) return;
  const manager = await requirePermission("academy:manage");
  if (!manager) return;
  await db.delete(classSessions).where(eq(classSessions.id, id));
  revalidatePath("/admin");
}
