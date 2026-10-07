"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  barberSchedule,
  barberServices,
  barberSkills,
  barbers,
  blockedTimes,
  portfolioItems,
  services,
  skills,
  userRoles,
  users,
} from "@/db/schema";
import { getCurrentUser, type SessionUser } from "@/lib/session";
import { ROLES, rolesFromLegacyRole, type Role } from "@/lib/rbac";
import { MANAGER_ASSIGNABLE_ROLES, PRIVILEGED_TEAM_ROLES, safeProfileSlug } from "@/lib/team";
import { isValidISODate } from "@/lib/time";
import { GALLERY_CATEGORY_KEYS } from "@/lib/gallery";

export type TeamActionResult = { ok: boolean; message: string };
const ok = (message: string): TeamActionResult => ({ ok: true, message });
const fail = (message: string): TeamActionResult => ({ ok: false, message });

const PHONE = /^09\d{9}$/;
const TEAM_MEMBER_ROLES: readonly Role[] = ["BARBER", "INSTRUCTOR", "RECEPTIONIST", "MANAGER", "FINANCE", "SUPER_ADMIN"];
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const LOCAL_IMAGE = /^\/(?:uploads|images)\/[a-zA-Z0-9/_-]+\.(?:jpe?g|png|webp|avif)$/i;

async function audit(actorId: number, action: string, target: string) {
  await db.insert(auditLogs).values({ actor: `user:${actorId}`, action, target });
}

function primaryLegacyRole(roles: readonly Role[]): Role {
  const order: Role[] = ["SUPER_ADMIN", "MANAGER", "RECEPTIONIST", "FINANCE", "BARBER", "INSTRUCTOR", "TRAINEE", "CLIENT"];
  return order.find((role) => roles.includes(role)) ?? "CLIENT";
}

function rolesFromForm(formData: FormData): Role[] | null {
  const values = formData.getAll("roles").map((value) => String(value));
  if (values.some((value) => !ROLES.includes(value as Role))) return null;
  return [...new Set(values as Role[])];
}

function rolesAllowed(actor: SessionUser, roles: readonly Role[]): boolean {
  if (actor.permissions.has("roles:manage")) return true;
  return roles.every((role) => MANAGER_ASSIGNABLE_ROLES.includes(role));
}

function validImageUrl(value: string): boolean {
  if (!value) return true;
  if (LOCAL_IMAGE.test(value) && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function minutesFromTime(value: string): number | null {
  if (value === "24:00") return 1440;
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function positiveId(value: FormDataEntryValue | null): number | null {
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

type TeamExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function rolesForUser(userId: number, legacyRole: string, executor: TeamExecutor = db): Promise<Role[]> {
  const rows = await executor.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.length
    ? [...new Set(rows.map((row) => row.role as Role))]
    : rolesFromLegacyRole(legacyRole);
}

async function uniqueProfileSlug(name: string, phone: string, executor: TeamExecutor = db): Promise<string> {
  const base = safeProfileSlug(name);
  const fallback = `barber-${phone.slice(-4)}`;
  const root = base === "team-member" ? fallback : base;
  let candidate = root.slice(0, 40);
  let suffix = 2;
  while (true) {
    const [existing] = await executor.select({ id: barbers.id }).from(barbers).where(eq(barbers.slug, candidate)).limit(1);
    if (!existing) return candidate;
    const ending = `-${suffix++}`;
    candidate = `${root.slice(0, 40 - ending.length)}${ending}`;
  }
}

async function ensureBarberProfile(
  executor: TeamExecutor,
  userId: number,
  name: string,
  phone: string,
  options: { title?: string; bio?: string; active?: boolean },
) {
  const [profile] = await executor.select().from(barbers).where(eq(barbers.userId, userId)).limit(1);
  if (profile) return profile;
  const slug = await uniqueProfileSlug(name, phone, executor);
  const [created] = await executor
    .insert(barbers)
    .values({
      userId,
      slug,
      name,
      title: options.title?.trim() || "آرایشگر",
      bio: options.bio?.trim() || "",
      active: options.active ?? false,
    })
    .returning();
  for (let weekday = 0; weekday < 7; weekday += 1) {
    await executor.insert(barberSchedule).values({
      barberId: created.id,
      weekday,
      startMin: 600,
      endMin: 1320,
      dayOff: weekday === 6,
    });
  }
  return created;
}

async function authorizedBarber(barberId: number): Promise<{ actor: SessionUser; barber: typeof barbers.$inferSelect } | null> {
  const actor = await getCurrentUser();
  if (!actor) return null;
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId)).limit(1);
  if (!barber) return null;
  const canManage = actor.permissions.has("staff:manage");
  const self = barber.userId === actor.id && (actor.roles.includes("BARBER") || actor.roles.includes("INSTRUCTOR"));
  return canManage || self ? { actor, barber } : null;
}

async function revalidateTeam(barberId?: number, slug?: string, userId?: number) {
  revalidatePath("/admin");
  revalidatePath("/admin/team");
  revalidatePath("/booking");
  revalidatePath("/barber");
  revalidatePath("/barbers");
  revalidatePath("/work");
  revalidatePath("/home");
  if (barberId) revalidatePath(`/admin/team/${userId ?? barberId}`);
  if (slug) revalidatePath(`/barbers/${slug}`);
}

/* ----------------------- team creation ----------------------- */

const CreateStaffSchema = z.object({
  name: z.string().trim().min(2, "نام باید حداقل ۲ حرف باشد.").max(80),
  phone: z.string().trim().regex(PHONE, "شماره موبایل معتبر نیست؛ نمونه: 09123456789"),
  roles: z.array(z.enum(ROLES)).min(1, "حداقل یک نقش انتخاب کنید."),
  profileTitle: z.string().trim().max(60).optional().default(""),
  profileBio: z.string().trim().max(600).optional().default(""),
  publishProfile: z.enum(["on", "off"]).optional().default("off"),
});

export async function createTeamMemberAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const actor = await getCurrentUser();
  if (!actor?.permissions.has("staff:manage")) return fail("دسترسی غیرمجاز.");
  const roles = rolesFromForm(formData);
  if (!roles) return fail("نقش انتخاب‌شده معتبر نیست.");
  const parsed = CreateStaffSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    roles,
    profileTitle: formData.get("profileTitle") ?? "",
    profileBio: formData.get("profileBio") ?? "",
    publishProfile: formData.get("publishProfile") === "on" ? "on" : "off",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "اطلاعات واردشده معتبر نیست.");
  if (!parsed.data.roles.some((role) => TEAM_MEMBER_ROLES.includes(role))) return fail("حداقل یک نقش تیمی انتخاب کنید.");
  if (!rolesAllowed(actor, parsed.data.roles)) return fail("این نقش از سطح دسترسی شما بالاتر است.");
  if (parsed.data.phone === actor.phone) return fail("حساب خودتان از قبل وجود دارد؛ برای ویرایش دسترسی از حساب دیگری استفاده کنید.");

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(eq(users.phone, parsed.data.phone)).limit(1);
      const account = existing
        ? existing
        : (await tx
            .insert(users)
            .values({ phone: parsed.data.phone, name: parsed.data.name, role: primaryLegacyRole(parsed.data.roles) })
            .returning())[0];
      if (!account) throw new Error("ACCOUNT_CREATE_FAILED");

      const currentRoles = existing ? await rolesForUser(account.id, account.role, tx) : [];
      if (!actor.permissions.has("roles:manage") && currentRoles.some((role) => PRIVILEGED_TEAM_ROLES.includes(role))) {
        throw new Error("TARGET_ROLE_PROTECTED");
      }
      const mergedRoles = [...new Set([...currentRoles, ...parsed.data.roles])];
      if (existing) await tx.update(users).set({ name: parsed.data.name, role: primaryLegacyRole(mergedRoles) }).where(eq(users.id, account.id));
      for (const role of mergedRoles) {
        await tx.insert(userRoles).values({ userId: account.id, role }).onConflictDoNothing();
      }

      let profile: typeof barbers.$inferSelect | null = null;
      if (mergedRoles.includes("BARBER") || mergedRoles.includes("INSTRUCTOR")) {
        profile = await ensureBarberProfile(tx, account.id, parsed.data.name, parsed.data.phone, {
          title: parsed.data.profileTitle || (mergedRoles.includes("BARBER") ? "آرایشگر" : "مدرس آکادمی"),
          bio: parsed.data.profileBio,
          active: mergedRoles.includes("BARBER") && parsed.data.publishProfile === "on",
        });
        // BARBER is the only role that exposes a public profile to customers.
        if (!mergedRoles.includes("BARBER") && profile.active) {
          await tx.update(barbers).set({ active: false }).where(eq(barbers.id, profile.id));
        }
      }
      await tx.insert(auditLogs).values({
        actor: `user:${actor.id}`,
        action: "STAFF_CREATED",
        target: `user:${account.id}:${mergedRoles.join(",")}`,
      });
      return { userId: account.id, barberId: profile?.id ?? null, slug: profile?.slug ?? null, reused: Boolean(existing) };
    });
    await revalidateTeam(result.barberId ?? undefined, result.slug ?? undefined, result.userId);
    return ok(result.reused
      ? "همین حساب کاربری به عضویت تیم درآمد؛ حساب تکراری ساخته نشد."
      : "عضو تیم ساخته شد. برای ورود از روش ورود فعلی سامانه استفاده می‌کند.");
  } catch (error) {
    if (error instanceof Error && error.message === "TARGET_ROLE_PROTECTED") return fail("این حساب نقش مدیریتی دارد و فقط مالک می‌تواند آن را تغییر دهد.");
    return fail("ساخت عضو تیم انجام نشد؛ شماره موبایل یا آدرس پروفایل ممکن است تکراری باشد.");
  }
}

/* ----------------------- public profile ----------------------- */

const ProfileSchema = z.object({
  barberId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, "نام باید حداقل ۲ حرف باشد.").max(80),
  slug: z.string().trim().toLowerCase().regex(SLUG, "آدرس باید انگلیسی و بدون فاصله باشد.").max(40),
  title: z.string().trim().min(2, "عنوان را وارد کنید.").max(60),
  bio: z.string().trim().max(600),
  readme: z.string().trim().max(4000),
  experienceYears: z.coerce.number().int().min(0).max(70),
  imageUrl: z.string().trim().max(500),
  active: z.enum(["on", "off"]).optional().default("off"),
});

export async function saveBarberPublicProfileAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const parsed = ProfileSchema.safeParse({
    ...Object.fromEntries(formData),
    active: formData.get("active") === "on" ? "on" : "off",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "اطلاعات پروفایل معتبر نیست.");
  if (!validImageUrl(parsed.data.imageUrl)) return fail("آدرس تصویر باید فایل تصویری امن و محلی باشد.");
  const auth = await authorizedBarber(parsed.data.barberId);
  if (!auth) return fail("دسترسی غیرمجاز.");
  const { actor, barber } = auth;
  const canManage = actor.permissions.has("staff:manage");
  if (canManage && parsed.data.active === "on" && barber.userId) {
    const [profileUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, barber.userId)).limit(1);
    const profileRoles = profileUser ? await rolesForUser(barber.userId, profileUser.role) : [];
    if (!profileRoles.includes("BARBER")) return fail("برای انتشار و دریافت نوبت، نقش آرایشگر این حساب را فعال کنید.");
  }
  const nextSlug = canManage ? parsed.data.slug : barber.slug;
  const [collision] = await db
    .select({ id: barbers.id })
    .from(barbers)
    .where(eq(barbers.slug, nextSlug))
    .limit(1);
  if (collision && collision.id !== barber.id) return fail("این آدرس برای پروفایل دیگری استفاده شده است.");

  await db.transaction(async (tx) => {
    await tx.update(barbers).set({
      name: parsed.data.name,
      slug: nextSlug,
      title: parsed.data.title,
      bio: parsed.data.bio,
      readme: parsed.data.readme,
      experienceYears: parsed.data.experienceYears,
      imageUrl: parsed.data.imageUrl,
      active: canManage ? parsed.data.active === "on" : barber.active,
    }).where(eq(barbers.id, barber.id));
    // Public identity stays separate from the login/account name.
    await tx.insert(auditLogs).values({ actor: `user:${actor.id}`, action: "BARBER_PROFILE_UPDATED", target: `barber:${barber.id}` });
  });
  await revalidateTeam(barber.id, barber.slug, barber.userId ?? undefined);
  await revalidateTeam(barber.id, nextSlug, barber.userId ?? undefined);
  return ok("پروفایل عمومی ذخیره شد.");
}

/* ----------------------- services & overrides ----------------------- */

export async function saveBarberServicesAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const barberId = positiveId(formData.get("barberId"));
  const auth = barberId ? await authorizedBarber(barberId) : null;
  if (!barberId || !auth || !auth.actor.permissions.has("staff:manage")) return fail("دسترسی غیرمجاز.");
  const ids = formData.getAll("serviceId").map((value) => Number(value));
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return fail("خدمت انتخاب‌شده معتبر نیست.");
  const serviceIds = [...new Set(ids)];
  const serviceRows = serviceIds.length ? await db.select().from(services).where(inArray(services.id, serviceIds)) : [];
  if (serviceRows.length !== serviceIds.length) return fail("یکی از خدمات دیگر در دسترس نیست.");

  const links: { barberId: number; serviceId: number; customPrice: number | null; customDuration: number | null; customBarberDuration: number | null }[] = [];
  for (const service of serviceRows) {
    const value = (name: string) => String(formData.get(name) ?? "").trim();
    const customPriceRaw = value(`price-${service.id}`);
    const customDurationRaw = value(`duration-${service.id}`);
    const customBarberRaw = value(`barber-duration-${service.id}`);
    const customPrice = customPriceRaw ? Number(customPriceRaw) : null;
    const customDuration = customDurationRaw ? Number(customDurationRaw) : null;
    const customBarberDuration = customBarberRaw ? Number(customBarberRaw) : null;
    if (customPrice !== null && (!Number.isSafeInteger(customPrice) || customPrice < 0 || customPrice > 100_000_000)) return fail(`قیمت اختصاصی «${service.name}» معتبر نیست.`);
    if (customDuration !== null && (!Number.isInteger(customDuration) || customDuration < 10 || customDuration > 360)) return fail(`مدت اختصاصی «${service.name}» معتبر نیست.`);
    if (customBarberDuration !== null && (!Number.isInteger(customBarberDuration) || customBarberDuration < 5 || customBarberDuration > 360)) return fail(`زمان کار آرایشگر برای «${service.name}» معتبر نیست.`);
    if ((customBarberDuration ?? service.barberDurationMin) > (customDuration ?? service.durationMin)) return fail(`زمان کار آرایشگر برای «${service.name}» نمی‌تواند از مدت خدمت بیشتر باشد.`);
    links.push({ barberId, serviceId: service.id, customPrice, customDuration, customBarberDuration });
  }

  await db.transaction(async (tx) => {
    await tx.delete(barberServices).where(eq(barberServices.barberId, barberId));
    if (links.length) await tx.insert(barberServices).values(links);
    await tx.insert(auditLogs).values({ actor: `user:${auth.actor.id}`, action: "BARBER_SERVICES_UPDATED", target: `barber:${barberId}:${links.length}` });
  });
  await revalidateTeam(barberId, auth.barber.slug, auth.barber.userId ?? undefined);
  return ok("خدمات و تنظیمات اختصاصی ذخیره شد؛ زمان‌بندی از همین داده‌ها استفاده می‌کند.");
}

/* ----------------------- approved skills ----------------------- */

export async function createTeamSkillAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const actor = await getCurrentUser();
  if (!actor?.permissions.has("staff:manage")) return fail("دسترسی غیرمجاز.");
  const parsed = z.object({ name: z.string().trim().min(2).max(60) }).safeParse({ name: formData.get("name") });
  if (!parsed.success) return fail("نام مهارت باید بین ۲ تا ۶۰ نویسه باشد.");
  const [existing] = await db.select({ id: skills.id }).from(skills).where(ilike(skills.name, parsed.data.name)).limit(1);
  if (existing) return fail("این مهارت از قبل ثبت شده است.");
  try {
    const [created] = await db.insert(skills).values({ name: parsed.data.name }).returning({ id: skills.id });
    await audit(actor.id, "SKILL_CREATED", `skill:${created.id}`);
    revalidatePath("/admin");
    revalidatePath("/admin/team");
    return ok("مهارت به فهرست سالن اضافه شد.");
  } catch {
    return fail("افزودن مهارت انجام نشد.");
  }
}

export async function saveBarberSkillsAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const barberId = positiveId(formData.get("barberId"));
  const auth = barberId ? await authorizedBarber(barberId) : null;
  if (!barberId || !auth || !auth.actor.permissions.has("skills:approve")) return fail("دسترسی غیرمجاز.");
  const ids = formData.getAll("skillId").map((value) => Number(value));
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return fail("مهارت انتخاب‌شده معتبر نیست.");
  const skillIds = [...new Set(ids)];
  const skillRows = skillIds.length ? await db.select({ id: skills.id }).from(skills).where(inArray(skills.id, skillIds)) : [];
  if (skillRows.length !== skillIds.length) return fail("یکی از مهارت‌ها پیدا نشد.");
  await db.transaction(async (tx) => {
    await tx.delete(barberSkills).where(eq(barberSkills.barberId, barberId));
    if (skillIds.length) {
      await tx.insert(barberSkills).values(skillIds.map((skillId) => ({ barberId, skillId, status: "APPROVED", approvedBy: auth.actor.id, approvedAt: new Date() })));
    }
    await tx.insert(auditLogs).values({ actor: `user:${auth.actor.id}`, action: "BARBER_SKILLS_UPDATED", target: `barber:${barberId}:${skillIds.length}` });
  });
  await revalidateTeam(barberId, auth.barber.slug, auth.barber.userId ?? undefined);
  return ok("مهارت‌های تأییدشده ذخیره شد و مستقیماً در انتخاب آرایشگر اثر می‌گذارد.");
}

/* ----------------------- schedule ----------------------- */

export async function saveBarberScheduleAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const barberId = positiveId(formData.get("barberId"));
  const auth = barberId ? await authorizedBarber(barberId) : null;
  if (!barberId || !auth) return fail("دسترسی غیرمجاز.");
  const rows: { barberId: number; weekday: number; startMin: number; endMin: number; dayOff: boolean }[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const dayOff = formData.get(`off-${weekday}`) === "on";
    const startMin = minutesFromTime(String(formData.get(`start-${weekday}`) ?? ""));
    const endMin = minutesFromTime(String(formData.get(`end-${weekday}`) ?? ""));
    if (startMin === null || endMin === null) return fail(`ساعت کاری ${weekday + 1} معتبر نیست.`);
    if (!dayOff && startMin >= endMin) return fail(`بازهٔ ${weekday + 1} باید ساعت پایان بعد از شروع داشته باشد.`);
    rows.push({ barberId, weekday, startMin, endMin, dayOff });
  }
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.insert(barberSchedule).values(row).onConflictDoUpdate({
        target: [barberSchedule.barberId, barberSchedule.weekday],
        set: { startMin: row.startMin, endMin: row.endMin, dayOff: row.dayOff },
      });
    }
    await tx.insert(auditLogs).values({ actor: `user:${auth.actor.id}`, action: "BARBER_SCHEDULE_UPDATED", target: `barber:${barberId}` });
  });
  await revalidateTeam(barberId, auth.barber.slug, auth.barber.userId ?? undefined);
  return ok("برنامهٔ هفتگی ذخیره شد و تقویم رزرو بر همین اساس محاسبه می‌شود.");
}

export async function copyBarberScheduleAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const barberId = positiveId(formData.get("barberId"));
  const auth = barberId ? await authorizedBarber(barberId) : null;
  const sourceWeekday = Number(formData.get("sourceWeekday"));
  const targetWeekdays = [...new Set(formData.getAll("targetWeekday").map(Number))];
  if (!barberId || !auth) return fail("دسترسی غیرمجاز.");
  if (!Number.isInteger(sourceWeekday) || sourceWeekday < 0 || sourceWeekday > 6 || targetWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return fail("روز انتخاب‌شده معتبر نیست.");
  const [source] = await db.select().from(barberSchedule).where(and(eq(barberSchedule.barberId, barberId), eq(barberSchedule.weekday, sourceWeekday))).limit(1);
  if (!source) return fail("برنامهٔ روز مبدا تنظیم نشده است.");
  const targets = targetWeekdays.filter((day) => day !== sourceWeekday);
  if (!targets.length) return fail("حداقل یک روز مقصد انتخاب کنید.");
  await db.transaction(async (tx) => {
    for (const weekday of targets) {
      await tx.insert(barberSchedule).values({ barberId, weekday, startMin: source.startMin, endMin: source.endMin, dayOff: source.dayOff }).onConflictDoUpdate({
        target: [barberSchedule.barberId, barberSchedule.weekday],
        set: { startMin: source.startMin, endMin: source.endMin, dayOff: source.dayOff },
      });
    }
    await tx.insert(auditLogs).values({ actor: `user:${auth.actor.id}`, action: "BARBER_SCHEDULE_UPDATED", target: `barber:${barberId}:copied:${sourceWeekday}` });
  });
  await revalidateTeam(barberId, auth.barber.slug, auth.barber.userId ?? undefined);
  return ok("ساعت روز انتخاب‌شده برای روزهای مقصد کپی شد.");
}

/* ----------------------- time off / blocked periods ----------------------- */

export async function createBarberBlockAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const barberId = positiveId(formData.get("barberId"));
  const auth = barberId ? await authorizedBarber(barberId) : null;
  if (!barberId || !auth) return fail("دسترسی غیرمجاز.");
  const parsed = z.object({
    date: z.string().refine(isValidISODate, "تاریخ نامعتبر است."),
    startTime: z.string(),
    endTime: z.string(),
    reason: z.string().trim().min(2).max(60),
    fullDay: z.enum(["on", "off"]).optional().default("off"),
  }).safeParse({
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    reason: formData.get("reason"),
    fullDay: formData.get("fullDay") === "on" ? "on" : "off",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "اطلاعات بازه معتبر نیست.");
  const fullDay = parsed.data.fullDay === "on";
  const startMin = minutesFromTime(parsed.data.startTime);
  const endMin = minutesFromTime(parsed.data.endTime);
  if (!fullDay && (startMin === null || endMin === null || startMin >= endMin)) return fail("بازهٔ زمانی را بررسی کنید.");
  const [created] = await db.insert(blockedTimes).values({
    barberId,
    date: parsed.data.date,
    startMin: fullDay ? 0 : startMin!,
    endMin: fullDay ? 1440 : endMin!,
    reason: parsed.data.reason,
    fullDay,
  }).returning({ id: blockedTimes.id });
  await audit(auth.actor.id, "TIME_BLOCKED", `barber:${barberId}:block:${created.id}`);
  await revalidateTeam(barberId, auth.barber.slug, auth.barber.userId ?? undefined);
  return ok("بازهٔ عدم حضور ثبت شد و در زمان‌بندی رزرو لحاظ می‌شود.");
}

export async function deleteBarberBlockAction(formData: FormData): Promise<void> {
  const blockId = positiveId(formData.get("blockId"));
  const barberId = positiveId(formData.get("barberId"));
  if (!blockId || !barberId) return;
  const auth = await authorizedBarber(barberId);
  if (!auth) return;
  const [block] = await db.select().from(blockedTimes).where(and(eq(blockedTimes.id, blockId), eq(blockedTimes.barberId, barberId))).limit(1);
  if (!block) return;
  await db.delete(blockedTimes).where(eq(blockedTimes.id, blockId));
  await audit(auth.actor.id, "TIME_BLOCK_DELETED", `barber:${barberId}:block:${blockId}`);
  await revalidateTeam(barberId, auth.barber.slug, auth.barber.userId ?? undefined);
}

/* ----------------------- portfolio ----------------------- */

function validCategory(value: string): boolean {
  return (GALLERY_CATEGORY_KEYS as readonly string[]).includes(value);
}

export async function createPortfolioItemAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const barberId = positiveId(formData.get("barberId"));
  const auth = barberId ? await authorizedBarber(barberId) : null;
  if (!barberId || !auth) return fail("دسترسی غیرمجاز.");
  const parsed = z.object({ title: z.string().trim().min(2).max(100), category: z.string().min(1).max(40), imageUrl: z.string().trim().min(1).max(500) }).safeParse({
    title: formData.get("title"), category: formData.get("category"), imageUrl: formData.get("imageUrl"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "عنوان و تصویر را وارد کنید.");
  if (!validCategory(parsed.data.category)) return fail("دسته‌بندی نمونه‌کار معتبر نیست.");
  if (!validImageUrl(parsed.data.imageUrl)) return fail("تصویر باید فایل تصویری امن باشد.");
  const [item] = await db.insert(portfolioItems).values({ barberId, title: parsed.data.title, category: parsed.data.category, imageUrl: parsed.data.imageUrl }).returning({ id: portfolioItems.id });
  await audit(auth.actor.id, "PORTFOLIO_ITEM_CREATED", `barber:${barberId}:item:${item.id}`);
  await revalidateTeam(barberId, auth.barber.slug, auth.barber.userId ?? undefined);
  return ok("نمونه‌کار افزوده شد و در گالری سایت نمایش داده می‌شود.");
}

export async function updatePortfolioItemAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const barberId = positiveId(formData.get("barberId"));
  const itemId = positiveId(formData.get("itemId"));
  const auth = barberId ? await authorizedBarber(barberId) : null;
  if (!barberId || !itemId || !auth) return fail("دسترسی غیرمجاز.");
  const parsed = z.object({ title: z.string().trim().min(2).max(100), category: z.string().min(1).max(40), imageUrl: z.string().trim().min(1).max(500) }).safeParse({
    title: formData.get("title"), category: formData.get("category"), imageUrl: formData.get("imageUrl"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "اطلاعات نمونه‌کار معتبر نیست.");
  if (!validCategory(parsed.data.category)) return fail("دسته‌بندی نمونه‌کار معتبر نیست.");
  if (!validImageUrl(parsed.data.imageUrl)) return fail("تصویر باید فایل تصویری امن باشد.");
  const [item] = await db.select({ id: portfolioItems.id }).from(portfolioItems).where(and(eq(portfolioItems.id, itemId), eq(portfolioItems.barberId, barberId))).limit(1);
  if (!item) return fail("نمونه‌کار پیدا نشد.");
  await db.update(portfolioItems).set({ title: parsed.data.title, category: parsed.data.category, imageUrl: parsed.data.imageUrl }).where(eq(portfolioItems.id, itemId));
  await audit(auth.actor.id, "PORTFOLIO_ITEM_UPDATED", `barber:${barberId}:item:${itemId}`);
  await revalidateTeam(barberId, auth.barber.slug, auth.barber.userId ?? undefined);
  return ok("تغییرات نمونه‌کار ذخیره شد.");
}

export async function deletePortfolioItemAction(formData: FormData): Promise<void> {
  const barberId = positiveId(formData.get("barberId"));
  const itemId = positiveId(formData.get("itemId"));
  const auth = barberId ? await authorizedBarber(barberId) : null;
  if (!barberId || !itemId || !auth) return;
  const [item] = await db.select({ id: portfolioItems.id }).from(portfolioItems).where(and(eq(portfolioItems.id, itemId), eq(portfolioItems.barberId, barberId))).limit(1);
  if (!item) return;
  await db.delete(portfolioItems).where(eq(portfolioItems.id, itemId));
  // Media is only unlinked. It may be reused by another portfolio/content row.
  await audit(auth.actor.id, "PORTFOLIO_ITEM_DELETED", `barber:${barberId}:item:${itemId}`);
  await revalidateTeam(barberId, auth.barber.slug, auth.barber.userId ?? undefined);
}

/* ----------------------- role/access management ----------------------- */

export async function updateTeamRolesAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !(actor.permissions.has("staff:manage") || actor.permissions.has("roles:manage"))) return fail("دسترسی غیرمجاز.");
  const userId = positiveId(formData.get("userId"));
  const submitted = rolesFromForm(formData);
  if (!userId || !submitted) return fail("اطلاعات دسترسی معتبر نیست.");
  if (userId === actor.id) return fail("دسترسی‌های حساب خودتان از این صفحه تغییر نمی‌کند.");
  if (!rolesAllowed(actor, submitted)) return fail("این نقش از سطح دسترسی شما بالاتر است.");
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return fail("حساب کاربری پیدا نشد.");
  const currentRoles = await rolesForUser(userId, target.role);
  if (!actor.permissions.has("roles:manage") && currentRoles.some((role) => PRIVILEGED_TEAM_ROLES.includes(role))) return fail("این حساب مدیریتی فقط توسط مالک قابل ویرایش است.");
  const manageable = actor.permissions.has("roles:manage") ? ROLES : MANAGER_ASSIGNABLE_ROLES;
  const preserved = currentRoles.filter((role) => !manageable.includes(role));
  const selectedRoles = [...new Set([...preserved, ...submitted])];
  // Offboarding removes team permissions without deleting the login or history.
  const nextRoles = selectedRoles.length ? selectedRoles : ["CLIENT" as Role];

  try {
    await db.transaction(async (tx) => {
      if (currentRoles.includes("SUPER_ADMIN") && !nextRoles.includes("SUPER_ADMIN")) {
        await tx.execute(sql`select pg_advisory_xact_lock(731941) `);
        const joined = await tx.select({ userId: users.id, legacyRole: users.role, memberRole: userRoles.role }).from(users).leftJoin(userRoles, eq(userRoles.userId, users.id));
        const grouped = new Map<number, { legacyRole: string; roles: string[] }>();
        for (const row of joined) {
          const group = grouped.get(row.userId) ?? { legacyRole: row.legacyRole, roles: [] };
          if (row.memberRole) group.roles.push(row.memberRole);
          grouped.set(row.userId, group);
        }
        const admins = [...grouped.values()].filter((group) => {
          const effective = group.roles.length ? group.roles : rolesFromLegacyRole(group.legacyRole);
          return effective.includes("SUPER_ADMIN");
        });
        if (admins.length <= 1) throw new Error("LAST_SUPER_ADMIN");
      }
      // Persist the complete effective role set so the legacy role can no longer
      // silently reappear after the final explicit membership is removed.
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      await tx.insert(userRoles).values(nextRoles.map((role) => ({ userId, role })));
      await tx.update(users).set({ role: primaryLegacyRole(nextRoles) }).where(eq(users.id, userId));
      const [profile] = await tx.select({ id: barbers.id, slug: barbers.slug, userId: barbers.userId }).from(barbers).where(eq(barbers.userId, userId)).limit(1);
      if (profile && !nextRoles.includes("BARBER")) await tx.update(barbers).set({ active: false }).where(eq(barbers.id, profile.id));
      if (!profile && (nextRoles.includes("BARBER") || nextRoles.includes("INSTRUCTOR"))) {
        await ensureBarberProfile(tx, userId, target.name, target.phone, {
          title: nextRoles.includes("BARBER") ? "آرایشگر" : "مدرس آکادمی",
          active: false,
        });
      }
      await tx.insert(auditLogs).values({ actor: `user:${actor.id}`, action: "STAFF_ROLE_UPDATED", target: `user:${userId}:${nextRoles.join(",")}` });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_SUPER_ADMIN") return fail("نقش آخرین مدیر ارشد قابل برداشتن نیست.");
    return fail("تغییر دسترسی ذخیره نشد.");
  }
  revalidatePath("/admin");
  revalidatePath("/admin/team");
  revalidatePath(`/admin/team/${userId}`);
  revalidatePath("/barber");
  revalidatePath("/barbers");
  revalidatePath("/booking");
  if (!nextRoles.some((role) => TEAM_MEMBER_ROLES.includes(role))) redirect("/admin/team?offboarded=1");
  return ok("نقش‌ها ذخیره شد؛ دسترسی پنل‌ها از همین نقش‌ها محاسبه می‌شود.");
}

/* ----------------------- account identity ----------------------- */

export async function updateTeamAccountNameAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const actor = await getCurrentUser();
  if (!actor?.permissions.has("staff:manage")) return fail("دسترسی غیرمجاز.");
  const parsed = z.object({ userId: z.coerce.number().int().positive(), name: z.string().trim().min(2).max(80) }).safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return fail("نام حساب باید بین ۲ تا ۸۰ نویسه باشد.");
  const [target] = await db.select().from(users).where(eq(users.id, parsed.data.userId)).limit(1);
  if (!target) return fail("حساب کاربری پیدا نشد.");
  const targetRoles = await rolesForUser(target.id, target.role);
  if (!targetRoles.some((role) => TEAM_MEMBER_ROLES.includes(role))) return fail("این حساب عضو تیم نیست.");
  await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, target.id));
  await audit(actor.id, "TEAM_ACCOUNT_NAME_UPDATED", `user:${target.id}`);
  revalidatePath("/account");
  revalidatePath("/admin");
  revalidatePath("/admin/team");
  revalidatePath(`/admin/team/${target.id}`);
  revalidatePath("/barber");
  return ok("نام حساب کاربری به‌روز شد؛ نام پروفایل عمومی مستقل باقی می‌ماند.");
}

export async function updateOwnAccountNameAction(
  _previous: TeamActionResult | null,
  formData: FormData,
): Promise<TeamActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return fail("ابتدا وارد حساب شوید.");
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse({ name: formData.get("name") });
  if (!parsed.success) return fail("نام باید بین ۲ تا ۸۰ نویسه باشد.");
  await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, actor.id));
  await audit(actor.id, "ACCOUNT_NAME_UPDATED", `user:${actor.id}`);
  revalidatePath("/account");
  revalidatePath("/admin");
  revalidatePath("/admin/team");
  revalidatePath("/barber");
  return ok("نام حساب کاربری به‌روز شد؛ این تغییر با نام پروفایل عمومی جداست.");
}
