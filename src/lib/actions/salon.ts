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
  barbers,
  blockedTimes,
  classes,
  notifications,
  salonSchedule,
  services,
  users,
} from "@/db/schema";
import { getCurrentUser, isStaff, type SessionUser } from "@/lib/session";
import { hashPassword } from "@/lib/passwords";
import { isValidISODate, minutesToLabel } from "@/lib/time";
import { createDbPlannerSource } from "@/lib/visit-planner-db";
import { validateVisitItems } from "@/lib/visit-planner";
import { resolveService } from "@/lib/availability";

export type ActionResult = { ok: boolean; message: string };

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && user.role === "SUPER_ADMIN" ? user : null;
}

async function requireBarberAccess(barberId: number): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "SUPER_ADMIN") return user;
  if (user.role === "BARBER" && user.barberId === barberId) return user;
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

const ReassignSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
  barberId: z.coerce.number().int().positive(),
  time: z
    .string()
    .trim()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "ساعت باید مانند 14:30 باشد")
    .optional()
    .or(z.literal("")),
});

/**
 * Moves one segment of a visit to another barber and/or time.
 *
 * The whole visit is revalidated through the visit planner before anything is
 * written — capability, working hours, blocked time, other bookings and
 * per-customer overlap — so an invalid assignment cannot be created simply
 * because an admin clicked it.
 */
export async function reassignAppointmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) return fail("دسترسی غیرمجاز.");
  const parsed = ReassignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { appointmentId, barberId } = parsed.data;

  const [target] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!target) return fail("نوبت پیدا نشد.");
  if (target.status.startsWith("CANCELLED")) return fail("نوبت لغوشده قابل جابه‌جایی نیست.");

  const groupRows = target.bookingGroupId
    ? await db.select().from(appointments).where(eq(appointments.bookingGroupId, target.bookingGroupId))
    : [target];

  const startMin = parsed.data.time
    ? Number(parsed.data.time.split(":")[0]) * 60 + Number(parsed.data.time.split(":")[1])
    : target.startMin;

  const page = await db.transaction(async (tx) => {
    const items = groupRows.map((row) => ({
      attendeeId: row.bookingGroupId ?? `appointment:${row.id}`,
      barberId: row.id === target.id ? barberId : row.barberId,
      serviceId: row.serviceId,
      date: row.date,
      startMin: row.id === target.id ? startMin : row.startMin,
    }));

    const source = createDbPlannerSource({
      serviceIds: items.map((item) => item.serviceId),
      excludeAppointmentIds: groupRows.map((row) => row.id),
    });
    const validation = await validateVisitItems(source, items);
    if (!validation.ok) return { ok: false as const, error: validation.error };

    const service = await resolveService(barberId, target.serviceId);
    if (!service) return { ok: false as const, error: "این خدمت برای آرایشگر انتخابی فعال نیست." };

    await tx
      .update(appointments)
      .set({
        barberId,
        startMin,
        endMin: startMin + service.durationMin,
        barberEndMin: startMin + service.barberDurationMin + service.bufferMin,
      })
      .where(eq(appointments.id, target.id));

    await tx.insert(auditLogs).values({
      actor: `user:${user.id}`,
      action: "APPOINTMENT_REASSIGNED",
      target: `appointment:${target.id} → barber:${barberId} @ ${minutesToLabel(startMin)}`,
    });
    await tx.insert(notifications).values({
      targetRole: "BARBER",
      kind: "BOOKING_REASSIGNED",
      title: "نوبت جابه‌جا شد",
      body: `${minutesToLabel(startMin)} — کد ${target.id}`,
    });
    return { ok: true as const };
  });

  if (!page.ok) return fail(page.error);
  revalidatePath("/admin");
  revalidatePath("/barber");
  return ok("نوبت با موفقیت جابه‌جا شد.");
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
  const allowed = isStaff(user.role) || (user.role === "BARBER" && user.barberId === row.barberId);
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
