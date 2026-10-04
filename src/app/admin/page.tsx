import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  auditLogs,
  barberSkills,
  barbers,
  blockedTimes,
  bookingHolds,
  classRegistrations,
  classSessions,
  classes,
  notifications,
  salonSchedule,
  serviceCombinationRules,
  services,
  skills,
  userRoles,
  users,
} from "@/db/schema";
import { LiveSalonTimeline, type TimelineBlock, type TimelineRow } from "@/components/admin/live-salon-timeline";
import { sweepExpiredPending } from "@/lib/appointment-lifecycle";
import { DashboardShell, Panel } from "@/components/dashboard-shell";
import { CourseAdminPanel } from "@/components/admin/course-admin";
import { ContactAdmin } from "@/components/admin/contact-admin";
import { getSiteContact, neshanApiKey } from "@/lib/site-settings";
import { setSiteContactAction } from "@/lib/actions/courses";
import { ActionForm, Field } from "@/components/action-form";
import { BookingFlow } from "@/components/booking-flow";
import { NotificationList } from "@/components/notifications";
import { loadBookingData } from "@/app/(public)/booking/page";
import { getCurrentUser, isStaff } from "@/lib/session";
import {
  createBarberAction,
  createClassAction,
  createServiceAction,
  decideSkillAction,
  setSalonHoursAction,
  setRoleMembershipAction,
  updateAppointmentStatusAction,
  upsertCombinationRuleAction,
} from "@/lib/actions/salon";
import {
  WEEKDAY_LABELS,
  currentEpochMs,
  formatPersianDate,
  formatPrice,
  isValidISODate,
  minutesToLabel,
  persianWeekday,
  salonMinuteOfDay,
  todayISO,
} from "@/lib/time";
import type { Permission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Async slice so the contact panel can read site_settings without threading
 *  it through the dashboard's big Promise.all. */
async function ContactAdminWrapper() {
  const [contact] = await Promise.all([getSiteContact()]);
  return <ContactAdmin initial={contact} action={setSiteContactAction} neshanEnabled={neshanApiKey() !== null} />;
}

/** Nav is grouped by the JOB being done — not by table inventory. */
const SECTIONS: { id: string; label: string; group?: string }[] = [
  { id: "live", label: "خط روز سالن", group: "امروز" },
  { id: "calendar", label: "تقویم روز" },
  { id: "notifications", label: "اعلان‌ها" },
  { id: "walkin", label: "پذیرش حضوری" },
  { id: "team", label: "تیم سالن", group: "مردم" },
  { id: "skills", label: "تأیید مهارت‌ها" },
  { id: "clients", label: "مشتریان" },
  { id: "roles", label: "دسترسی‌ها و نقش‌ها" },
  { id: "services", label: "سرویس‌ها و قیمت‌ها", group: "سالن و محتوا" },
  { id: "combos", label: "قوانین ترکیب خدمات" },
  { id: "hours", label: "ساعت کاری سالن" },
  { id: "academy", label: "کارگاه‌های حضوری" },
  { id: "courses", label: "دوره‌های آنلاین" },
  { id: "contact", label: "آدرس و نقشه" },
  { id: "audit", label: "لاگ سیستم" },
];

const ROLE_LABEL_FA: Record<string, string> = {
  CLIENT: "مشتری",
  TRAINEE: "هنرجو",
  BARBER: "آرایشگر",
  INSTRUCTOR: "مدرس",
  RECEPTIONIST: "پذیرش",
  MANAGER: "مدیر",
  FINANCE: "مالی",
  SUPER_ADMIN: "مالک / مدیر ارشد",
};

const STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار پرداخت",
  AWAITING_APPROVAL: "در انتظار تأیید مدیر",
  CONFIRMED: "تأیید شده",
  CHECKED_IN: "حاضر شد",
  IN_PROGRESS: "در حال انجام",
  COMPLETED: "تکمیل",
  NO_SHOW: "غیبت",
  CANCELLED_BY_CLIENT: "لغو مشتری",
  CANCELLED_EXPIRED: "لغو خودکار (انقضای پرداخت)",
  CANCELLED_BY_STAFF: "لغو سالن",
};
const STATUS_TONE: Record<string, "ok" | "wait" | "bad" | "mute"> = {
  PENDING: "wait",
  AWAITING_APPROVAL: "wait",
  CONFIRMED: "ok",
  CHECKED_IN: "ok",
  IN_PROGRESS: "ok",
  COMPLETED: "mute",
  NO_SHOW: "bad",
  CANCELLED_BY_CLIENT: "bad",
  CANCELLED_EXPIRED: "bad",
  CANCELLED_BY_STAFF: "bad",
};
const CHIP_TONE: Record<string, string> = {
  ok: "ops-chip ops-chip-ok",
  wait: "ops-chip ops-chip-wait",
  bad: "ops-chip ops-chip-bad",
  mute: "ops-chip ops-chip-mute",
};

const AUDIT_FA: Record<string, string> = {
  APPOINTMENT_STATUS_CHANGED: "وضعیت نوبت به‌روز شد",
  BARBER_CREATED: "پروندهٔ آرایشگر افزوده شد",
  BARBER_SCHEDULE_UPDATED: "شیفت آرایشگر به‌روز شد",
  CLASS_CREATED: "دورهٔ حضوری ثبت شد",
  CLASS_SESSION_ADDED: "جلسهٔ دوره اضافه شد",
  COMBINATION_RULE_SAVED: "قانون ترکیب خدمات ذخیره شد",
  COURSE_CREATED: "دورهٔ آنلاین ساخته شد",
  COURSE_ENROLLMENT_UPDATED: "وضعیت ثبت‌نام دوره تغییر کرد",
  COURSE_LESSON_ADDED: "درس دوره اضافه شد",
  COURSE_LESSON_DELETED: "درس دوره حذف شد",
  COURSE_REVIEW_MODERATED: "نظر دوره بررسی شد",
  COURSE_SECTION_ADDED: "سرفصل دوره اضافه شد",
  COURSE_STATUS: "وضعیت انتشار دوره تغییر کرد",
  COURSE_UPDATED: "دورهٔ آنلاین ویرایش شد",
  SALON_HOURS_UPDATED: "ساعت کاری سالن ذخیره شد",
  SCHEDULE_TEMPLATE_APPLIED: "قالب شیفت‌ها اعمال شد",
  SERVICE_CREATED: "سرویس تازه تعریف شد",
  SITE_CONTACT_UPDATED: "آدرس و تماس سایت به‌روز شد",
  SKILL_CLAIMED: "مهارت اعلام/تصمیم‌گیری شد",
  TIME_BLOCKED: "بازهٔ زمانی بلاک شد",
};

function fa(n: number): string {
  return n.toLocaleString("fa-IR");
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; barber?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user)) redirect("/barber");
  await sweepExpiredPending(db);
  const can = (permission: Permission) => user.permissions.has(permission);
  const canManageServices = can("services:manage");
  const canApproveSkills = can("skills:approve");
  const canManageRoles = can("roles:manage");
  const canManageAcademy = can("academy:manage");
  const sections = SECTIONS.filter((section) => {
    if (section.id === "skills") return canApproveSkills;
    if (section.id === "combos" || section.id === "services") return canManageServices;
    if (section.id === "roles" || section.id === "audit") return can("audit:view") || canManageRoles;
    if (section.id === "courses") return canManageAcademy;
    if (section.id === "contact") return can("settings:manage");
    return true;
  });

  const sp = await searchParams;
  const date = sp.date && isValidISODate(sp.date) ? sp.date : todayISO();
  const barberFilter = Number(sp.barber) > 0 ? Number(sp.barber) : null;

  const [dayRows, barberRows, serviceRows, hours, classRows, registrations, logs, clientRows, booking,
      holdsToday, sessionsToday, blocksToday, pendingSkills, ruleRows, roster] =
    await Promise.all([
      db
        .select({ a: appointments, barberName: barbers.name, serviceName: services.name })
        .from(appointments)
        .innerJoin(barbers, eq(barbers.id, appointments.barberId))
        .innerJoin(services, eq(services.id, appointments.serviceId))
        .where(
          barberFilter
            ? and(eq(appointments.date, date), eq(appointments.barberId, barberFilter))
            : eq(appointments.date, date),
        ),
      db.select().from(barbers),
      db.select().from(services),
      db.select().from(salonSchedule),
      db.select().from(classes),
      db
        .select({ r: classRegistrations, title: classes.title })
        .from(classRegistrations)
        .innerJoin(classes, eq(classes.id, classRegistrations.classId))
        .orderBy(desc(classRegistrations.createdAt))
        .limit(10),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(12),
      db
        .select({
          phone: appointments.clientPhone,
          name: sql<string>`max(${appointments.clientName})`,
          visits: sql<number>`count(*)::int`,
          noShows: sql<number>`count(*) filter (where ${appointments.status} = 'NO_SHOW')::int`,
          last: sql<string>`max(${appointments.date})`,
        })
        .from(appointments)
        .groupBy(appointments.clientPhone)
        .orderBy(desc(sql`max(${appointments.date})`))
        .limit(8),
      loadBookingData(),
      db
        .select({
          id: bookingHolds.id,
          barberId: bookingHolds.barberId,
          date: bookingHolds.date,
          startMin: bookingHolds.startMin,
          durationMin: bookingHolds.durationMin,
          planId: bookingHolds.planId,
          clientPhone: bookingHolds.clientPhone,
          expiresAt: bookingHolds.expiresAt,
        })
        .from(bookingHolds)
        .where(and(eq(bookingHolds.date, date), gt(bookingHolds.expiresAt, new Date()))),
      db
        .select({ s: classSessions, instructorBarberId: classes.instructorBarberId, title: classes.title })
        .from(classSessions)
        .innerJoin(classes, eq(classes.id, classSessions.classId))
        .where(eq(classSessions.date, date)),
      db.select().from(blockedTimes).where(eq(blockedTimes.date, date)),
      db
        .select({
          id: barberSkills.id,
          barberId: barberSkills.barberId,
          barberName: barbers.name,
          skillName: skills.name,
          status: barberSkills.status,
        })
        .from(barberSkills)
        .innerJoin(barbers, eq(barbers.id, barberSkills.barberId))
        .innerJoin(skills, eq(skills.id, barberSkills.skillId))
        .where(eq(barberSkills.status, "PENDING")),
      db
        .select({
          id: serviceCombinationRules.id,
          a: serviceCombinationRules.serviceAId,
          b: serviceCombinationRules.serviceBId,
          canCombine: serviceCombinationRules.canCombine,
          sameBarberRequired: serviceCombinationRules.sameBarberRequired,
          note: serviceCombinationRules.note,
          nameA: services.name,
        })
        .from(serviceCombinationRules)
        .innerJoin(services, eq(services.id, serviceCombinationRules.serviceAId)),
      db
        .select({ id: users.id, name: users.name, phone: users.phone, role: userRoles.role })
        .from(users)
        .leftJoin(userRoles, and(eq(userRoles.userId, users.id)))
        .orderBy(users.id),
    ]);

  const sorted = dayRows.sort((x, y) => x.a.startMin - y.a.startMin);

  /* ---- Line model: one block per VISIT (group), one row per staff ---- */
  const TL_START = 9 * 60;
  const TL_END = 23 * 60;
  const nowMin = date === todayISO() ? salonMinuteOfDay() : null;
  const holdCutoffMs = currentEpochMs();
  const timelineRows: TimelineRow[] = barberRows
    .filter((b) => b.active)
    .map((b) => {
      const blocks: TimelineBlock[] = [];
      const my = sorted.filter((r) => r.a.barberId === b.id);
      const byGroup = new Map<string, typeof my>();
      const singles: typeof my = [];
      for (const r of my) {
        if (r.a.bookingGroupId) {
          const list = byGroup.get(r.a.bookingGroupId) ?? [];
          list.push(r);
          byGroup.set(r.a.bookingGroupId, list);
        } else singles.push(r);
      }
      for (const group of byGroup.values()) {
        const start = Math.min(...group.map((g) => g.a.startMin));
        const end = Math.max(...group.map((g) => g.a.endMin));
        const pending = group.some((g) => g.a.status === "PENDING" || g.a.status === "AWAITING_APPROVAL");
        blocks.push({
          kind: pending ? "PENDING" : "BOOKING",
          startMin: start,
          endMin: end,
          title: `${group[0].a.clientName} — ${group.map((g) => g.serviceName).join(" + ")}`,
          meta: `${minutesToLabel(start)}–${minutesToLabel(end)} · ${group.length} خدمت`,
          segments: group.map((g) => ({ title: g.serviceName, startMin: g.a.startMin, endMin: g.a.endMin })),
        });
      }
      for (const r of singles) {
        const pending = r.a.status === "PENDING" || r.a.status === "AWAITING_APPROVAL";
        blocks.push({
          kind: pending ? "PENDING" : "BOOKING",
          startMin: r.a.startMin,
          endMin: Math.max(r.a.endMin, r.a.barberEndMin),
          title: `${r.a.clientName} — ${r.serviceName}`,
          meta: `${minutesToLabel(r.a.startMin)}–${minutesToLabel(r.a.endMin)} · ${STATUS_FA[r.a.status] ?? r.a.status}`,
        });
      }
      const myHolds = holdsToday.filter((h) => h.barberId === b.id);
      const holdGroups = new Map<string, typeof myHolds>();
      for (const h of myHolds) {
        const key = h.planId ?? `single-${h.id}`;
        holdGroups.set(key, [...(holdGroups.get(key) ?? []), h]);
      }
      for (const hold of holdGroups.values()) {
        const start = Math.min(...hold.map((h) => h.startMin));
        const end = Math.max(...hold.map((h) => h.startMin + Math.max(h.durationMin, 30)));
        const minutesLeft = Math.max(0, Math.round((new Date(hold[0].expiresAt).getTime() - holdCutoffMs) / 60_000));
        blocks.push({
          kind: "HOLD",
          startMin: start,
          endMin: end,
          title: "نگهداری موقت مشتری",
          meta: `${minutesToLabel(start)} تا ${minutesToLabel(end)} · ${fa(minutesLeft)} دقیقه مانده`,
        });
      }
      for (const session of sessionsToday.filter((x) => x.instructorBarberId === b.id)) {
        blocks.push({ kind: "CLASS", startMin: session.s.startMin, endMin: session.s.endMin + session.s.bufferMin, title: `کلاس: ${session.title}`, meta: "ظرفیت آموزشی — نوبت سالن مسدود است" });
      }
      for (const block of blocksToday.filter((x) => x.barberId === b.id)) {
        blocks.push({ kind: block.fullDay ? "BLOCK" : "BREAK", startMin: block.startMin, endMin: block.endMin, title: block.reason, meta: block.fullDay ? "روز تعطیل/مرخصی" : undefined });
      }
      return { id: b.id, name: b.name, role: b.title, blocks };
    });

  const activeBarbers = barberRows.filter((b) => b.active).length;
  const holdingPlans = new Set(holdsToday.map((h) => h.planId ?? `single-${h.id}`)).size;
  const awaitingRows = sorted.filter((r) => r.a.status === "AWAITING_APPROVAL" || r.a.status === "PENDING");
  const completedCount = sorted.filter((r) => r.a.status === "COMPLETED").length;
  const revenue = sorted
    .filter((r) => r.a.status === "COMPLETED")
    .reduce((sum, r) => sum + r.a.priceSnapshot, 0);

  /* Real capacity: today's opening window × active staff, minus their blocks —
     never a made-up constant. */
  const weekday = persianWeekday(date);
  const hoursToday = hours.find((h) => h.weekday === weekday);
  const openWindow = hoursToday && !hoursToday.closed ? Math.max(0, hoursToday.closeMin - hoursToday.openMin) : 0;
  const blockedMinutes = blocksToday
    .filter((x) => !x.fullDay)
    .reduce((sum, x) => sum + Math.max(0, x.endMin - x.startMin), 0);
  const capacityMinutes = Math.max(0, openWindow * activeBarbers - blockedMinutes);
  const bookedMinutes = timelineRows.reduce(
    (sum, row) => sum + row.blocks.filter((x) => x.kind === "BOOKING" || x.kind === "PENDING").reduce((s2, x) => s2 + (x.endMin - x.startMin), 0),
    0,
  );
  const capacityPct = capacityMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / capacityMinutes) * 100)) : 0;

  const rosterRows = (() => {
    const map = new Map<number, { name: string; phone: string; roles: string[] }>();
    for (const r of roster) {
      const current = map.get(r.id) ?? { name: r.name, phone: r.phone, roles: [] };
      if (r.role) current.roles.push(r.role);
      map.set(r.id, current);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v }));
  })();
  const allServiceOptions = serviceRows.filter((x) => x.active);

  const notifRows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.targetRole, user.role))
    .orderBy(desc(notifications.createdAt))
    .limit(12);
  const unreadCount = notifRows.filter((n) => !n.isRead).length;

  const notificationItems = notifRows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    isRead: n.isRead,
    createdAt: new Date(n.createdAt).toLocaleDateString("fa-IR", {
      month: "long",
      day: "numeric",
    }),
  }));

  const navSections = sections.map((s) => ({
    ...s,
    count:
      s.id === "calendar"
        ? awaitingRows.length
        : s.id === "skills"
          ? pendingSkills.length
          : s.id === "notifications"
            ? unreadCount
            : undefined,
  }));

  const barberOptions = barberRows.filter((b) => b.active);

  return (
    <DashboardShell
      title="پنل سالن"
      subtitle={`${user.name} · ${user.roles.map((r) => ROLE_LABEL_FA[r] ?? r).join(" + ")}`}
      sections={navSections}
    >
      {/* ---- today at a glance: one strip, one bar — not eight boxes ---- */}
      <section aria-label="خلاصهٔ امروز" className="ops-panel">
        <div className="ops-panel-head">
          <h2>
            {date === todayISO() ? "امروز در سالن" : `گزارش ${formatPersianDate(date)}`}
          </h2>
          <span className="ops-meta">{formatPersianDate(date)}</span>
        </div>
        <div className="ops-strip mt-3">
          <div>
            <span className="ops-cap">نوبت‌های این روز</span>
            <span className="ops-num">{fa(sorted.length)}</span>
            <span className="ops-meta">{fa(completedCount)} خدمت ارائه‌شده</span>
          </div>
          <div>
            <span className="ops-cap">در انتظار پرداخت یا تأیید</span>
            <span className={`ops-num ${awaitingRows.length ? "text-[var(--color-warning)]" : ""}`}>{fa(awaitingRows.length)}</span>
            <a href="#calendar" className="ops-meta ops-link">
              بررسی در تقویم
            </a>
          </div>
          <div>
            <span className="ops-cap">نگهداری زندهٔ مشتری</span>
            <span className="ops-num">{fa(holdingPlans)}</span>
            <span className="ops-meta">زمان‌ها تا ۱۰ دقیقه قفل می‌مانند</span>
          </div>
          <div>
            <span className="ops-cap">درآمد تسویه‌شده</span>
            <span className="ops-num">{formatPrice(revenue)}</span>
            <span className="ops-meta">فقط نوبت‌های تکمیل‌شده</span>
          </div>
          <div>
            <span className="ops-cap">تیم فعال</span>
            <span className="ops-num">{fa(activeBarbers)}</span>
            <a href="#team" className="ops-meta ops-link">
              مدیریت تیم
            </a>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="ops-bar min-w-[220px] flex-1">
            <span style={{ width: `${capacityPct}%` }} />
          </div>
          <p className="ops-meta whitespace-nowrap">
            {hoursToday && !hoursToday.closed
              ? `اشغال امروز ${fa(capacityPct)}٪ — پنجرهٔ کاری ${minutesToLabel(hoursToday.openMin)} تا ${minutesToLabel(hoursToday.closeMin)}`
              : "امروز سالن تعطیل است"}
          </p>
        </div>
      </section>

      <Panel
        id="live"
        title="خط روز سالن"
        description="هر میله یک نوبت کامل است، حتی اگر چند خدمت و چند پرسنل داشته باشد. خط‌چین سبز یعنی برنامهٔ مشتری هنوز در حال بررسی است و قفل مانده."
      >
        <LiveSalonTimeline rows={timelineRows} gridStartMin={TL_START} gridEndMin={TL_END} slotMin={30} nowMin={nowMin} />
      </Panel>

      <Panel
        id="calendar"
        title="تقویم روز"
        count={awaitingRows.length}
        description={formatPersianDate(date)}
        actions={
          <form className="flex items-center gap-2" method="get">
            <label htmlFor="adm-date" className="ops-meta">تاریخ</label>
            <input id="adm-date" name="date" type="date" dir="ltr" defaultValue={date} className="ops-field !w-auto !py-1.5" />
            <label htmlFor="adm-barber" className="ops-meta">آرایشگر</label>
            <select id="adm-barber" name="barber" defaultValue={barberFilter ?? ""} className="ops-field !w-auto !py-1.5">
              <option value="">همه</option>
              {barberRows.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button type="submit" className="ops-btn">اعمال</button>
          </form>
        }
      >
        {sorted.length === 0 ? (
          <p className="ops-empty">
            برای این تاریخ نوبتی ثبت نشده.
            <a href="#walkin" className="ops-link">همین حالا از پذیرش حضوری اضافه کنید</a>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ops-table min-w-[640px]">
              <thead>
                <tr>
                  <th>ساعت</th>
                  <th>مشتری</th>
                  <th>آرایشگر</th>
                  <th>خدمت</th>
                  <th>وضعیت</th>
                  <th>تغییر وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ a, barberName, serviceName }) => (
                  <tr key={a.id}>
                    <td className="ops-ltr text-[13px] font-bold text-[#7ed0ae]">{minutesToLabel(a.startMin)}</td>
                    <td>
                      <span className="font-bold">{a.clientName}</span>
                      <span className="ops-ltr ops-meta block">{a.clientPhone}</span>
                    </td>
                    <td>{barberName}</td>
                    <td className="text-[var(--color-text-secondary)]">{serviceName}</td>
                    <td>
                      <span className={CHIP_TONE[STATUS_TONE[a.status] ?? "mute"]}>{STATUS_FA[a.status] ?? a.status}</span>
                    </td>
                    <td>
                      <form action={updateAppointmentStatusAction} className="flex items-center gap-2">
                        <input type="hidden" name="appointmentId" value={a.id} />
                        <label className="sr-only" htmlFor={`adm-st-${a.id}`}>
                          وضعیت نوبت {a.clientName}
                        </label>
                        <select
                          id={`adm-st-${a.id}`}
                          name="status"
                          defaultValue={a.status}
                          className="ops-field !w-auto !py-1.5 !text-xs"
                        >
                          {Object.keys(STATUS_FA).map((s) => (
                            <option key={s} value={s}>{STATUS_FA[s]}</option>
                          ))}
                        </select>
                        <button type="submit" className="ops-btn !px-3 !py-1.5">اعمال</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {notificationItems.length === 0 || unreadCount === 0 ? (
        <p id="notifications" className="ops-panel !py-3.5 ops-meta">
          {notificationItems.length === 0
            ? "اعلانی ثبت نشده؛ نوبت‌های لغوشده و تأییدمعطل همین‌جا صف می‌شوند."
            : <>همهٔ اعلان‌ها خوانده شده — {fa(notificationItems.length)} مورد اخیر · <a href="#live" className="ops-link">برگشت به خط روز</a></>}
        </p>
      ) : (
        <Panel id="notifications" title="اعلان‌ها" count={unreadCount}>
          <NotificationList items={notificationItems} />
        </Panel>
      )}

      <Panel
        id="walkin"
        title="پذیرش حضوری"
        description="مشتری همین‌جاست؛ نوبتش را ثبت کن. قیمت و موجودی دقیقاً مثل رزرو آنلاین، سمت سرور اعتبارسنجی می‌شود."
      >
        <BookingFlow servicesList={booking.servicesList} barbersList={booking.barbersList} staffMode />
      </Panel>

      <Panel id="team" title="تیم سالن">
        <ul className="ops-rows">
          {barberRows.map((b) => (
            <li key={b.id} className="ops-row">
              <span>
                <span className="font-bold">{b.name}</span>
                <span className="ops-meta block">{b.title}</span>
              </span>
              <Link href={`/barbers/${b.slug}`} className="ops-link">
                پروفایل عمومی
              </Link>
            </li>
          ))}
        </ul>
        {can("staff:manage") && (
          <div className="ops-form">
            <ActionForm action={createBarberAction} submitLabel="افزودن آرایشگر" className="mt-0">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="نام و نام خانوادگی" name="name" />
                <Field label="شناسه یکتا (انگلیسی slug)" name="slug" dir="ltr" />
                <Field label="عنوان شغلی" name="title" defaultValue="آرایشگر ارشد" />
                <Field label="شماره موبایل جهت ورود" name="phone" dir="ltr" />
                <Field label="رمز عبور اولیه" name="password" type="password" dir="ltr" />
                <Field label="معرفی کوتاه" name="bio" required={false} />
              </div>
            </ActionForm>
          </div>
        )}
      </Panel>

      {canApproveSkills && (
        <Panel
          id="skills"
          title="تأیید مهارت‌ها"
          count={pendingSkills.length}
          description="مهارت اعلامی آرایشگر تا تأیید تو در زمان‌بندی آنلاین استفاده نمی‌شود."
        >
          {pendingSkills.length === 0 ? (
            <p className="ops-empty">
              درخواستی برای بررسی نمانده.
              <span className="ops-meta">زمان‌بندی بر پایهٔ همان فهرست تأییدشده می‌چرخد.</span>
            </p>
          ) : (
            <ul className="ops-rows">
              {pendingSkills.map((row) => (
                <li key={row.id} className="ops-row">
                  <span>
                    <b>{row.barberName}</b>
                    <span className="text-[var(--color-warning)]"> ادعای مهارت «{row.skillName}»</span>
                  </span>
                  <span className="flex gap-2">
                    <ActionForm action={decideSkillAction} submitLabel="تأیید" className="contents">
                      <input type="hidden" name="membershipId" value={row.id} />
                      <input type="hidden" name="decision" value="APPROVE" />
                    </ActionForm>
                    <ActionForm action={decideSkillAction} submitLabel="رد" className="contents">
                      <input type="hidden" name="membershipId" value={row.id} />
                      <input type="hidden" name="decision" value="REJECT" />
                    </ActionForm>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Panel
        id="clients"
        title="مشتریان"
        description="بر پایهٔ شماره موبایل؛ آخرین حضورها و غیبت‌ها — برای شناخت مشتری، نه امتیازدهی."
      >
        {clientRows.length === 0 ? (
          <p className="ops-empty">
            هنوز مشتری‌ای در سامانه نیست.
            <a href="#walkin" className="ops-link">اولین پذیرش حضوری را ثبت کنید</a>
          </p>
        ) : (
          <ul className="ops-rows">
            {clientRows.map((c) => (
              <li key={c.phone} className="ops-row">
                <span className="min-w-0">
                  <span className="font-bold">{c.name}</span>
                  <span className="ops-ltr ops-meta block">{c.phone}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="ops-chip ops-chip-ok">{fa(c.visits)} مراجعه</span>
                  {Number(c.noShows ?? 0) > 0 && (
                    <span className="ops-chip ops-chip-bad">{fa(Number(c.noShows))} غیبت</span>
                  )}
                  <span className="ops-meta">آخرین حضور {formatPersianDate(c.last)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {canManageRoles && (
        <Panel
          id="roles"
          title="دسترسی‌ها و نقش‌ها"
          description="هر کاربر می‌تواند چند نقش داشته باشد؛ دسترسی‌ها از همین فهرست ساخته می‌شود، نه یک ستون تک‌مقدار."
        >
          <ul className="ops-rows">
            {rosterRows.map((person) => (
              <li key={person.id} className="ops-row">
                <span className="min-w-0">
                  <b>{person.name}</b>
                  <span className="ops-ltr ops-meta mr-2">{person.phone}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {person.roles.length ? (
                      person.roles.map((role) => (
                        <span key={role} className="ops-chip ops-chip-mute">{ROLE_LABEL_FA[role] ?? role}</span>
                      ))
                    ) : (
                      <span className="ops-meta">بدون عضویت — از نقش قدیمی استفاده می‌شود</span>
                    )}
                  </span>
                </span>
                <form className="flex items-center gap-2" action={setRoleMembershipAction as unknown as (formData: FormData) => Promise<void>}>
                  <label htmlFor={`role-${person.id}`} className="sr-only">نقش برای {person.name}</label>
                  <select id={`role-${person.id}`} name="role" className="ops-field !py-1.5 !text-xs">
                    {Object.entries(ROLE_LABEL_FA).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <input type="hidden" name="userId" value={person.id} />
                  <button type="submit" name="action" value="GRANT" className="ops-btn !px-3 !py-1.5">اعطا</button>
                  <button type="submit" name="action" value="REVOKE" className="ops-btn ops-btn-danger !px-3 !py-1.5">برداشتن</button>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {canManageServices && (
        <Panel id="services" title="سرویس‌ها و قیمت‌ها" description="همین اعداد در زمان‌بندی آنلاین خوانده می‌شوند: مدت کلِ مشتری، مدت درگیرسازی آرایشگر و بافر.">
          <div className="overflow-x-auto">
            <table className="ops-table min-w-[520px]">
              <thead>
                <tr>
                  <th>خدمت</th>
                  <th>مدت مشتری</th>
                  <th>مدت آرایشگر</th>
                  <th>قیمت پایه</th>
                </tr>
              </thead>
              <tbody>
                {serviceRows.map((s) => (
                  <tr key={s.id}>
                    <td className="font-bold">{s.name}{!s.active && <span className="ops-chip ops-chip-mute mr-2">غیرفعال</span>}</td>
                    <td className="ops-num">{fa(s.durationMin)} دقیقه</td>
                    <td className="ops-num text-[var(--color-text-secondary)]">{fa(s.barberDurationMin)} دقیقه · بافر {fa(s.bufferMin)}</td>
                    <td className="ops-num font-bold">{formatPrice(s.basePrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ops-form">
            <ActionForm action={createServiceAction} submitLabel="افزودن سرویس" className="mt-0">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="نام خدمت" name="name" />
                <Field label="شناسه انگلیسی" name="slug" dir="ltr" />
                <Field label="توضیحات کوتاه" name="description" required={false} />
                <Field label="مدت زمان (دقیقه)" name="durationMin" type="number" defaultValue={30} />
                <Field label="زمان کار آرایشگر (دقیقه)" name="barberDurationMin" type="number" defaultValue={30} />
                <Field label="بافر استراحت (دقیقه)" name="bufferMin" type="number" defaultValue={5} />
                <Field label="قیمت پایه (تومان)" name="basePrice" type="number" defaultValue={300000} />
              </div>
            </ActionForm>
          </div>
        </Panel>
      )}

      {canManageServices && (
        <Panel id="combos" title="قوانین ترکیب خدمات" description="مشتری می‌تواند چند خدمت را یک‌جا رزرو کند؛ هر قانون اینجا همان لحظه روی همان رزروها اعمال می‌شود. نبودِ قانون یعنی ترکیب آزاد.">
          <ul className="ops-rows">
            {ruleRows.length === 0 && (
              <li className="ops-empty">هنوز قانونی ثبت نشده؛ همهٔ جفت‌خدمت‌ها آزاد ترکیب می‌شوند.</li>
            )}
            {ruleRows.map((rule) => (
              <li key={rule.id} className="ops-row">
                <span className="font-bold">
                  {rule.nameA}
                  <span className="ops-meta mx-1.5">و</span>
                  {serviceRows.find((x) => x.id === rule.b)?.name ?? `سرویس ${rule.b}`}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className={rule.canCombine ? "ops-chip ops-chip-ok" : "ops-chip ops-chip-bad"}>
                    {rule.canCombine ? "یک‌جا رزرو می‌شود" : "قابل ترکیب نیست"}
                  </span>
                  {rule.sameBarberRequired && <span className="ops-chip ops-chip-wait">فقط یک آرایشگر</span>}
                  {rule.note && <span className="ops-meta max-w-[280px] truncate" title={rule.note}>{rule.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="ops-form">
            <ActionForm action={upsertCombinationRuleAction} submitLabel="ذخیرهٔ قانون" className="mt-0">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label htmlFor="combo-a" className="ops-label">خدمت اول</label>
                  <select id="combo-a" name="serviceAId" className="ops-field">
                    {allServiceOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="combo-b" className="ops-label">خدمت دوم</label>
                  <select id="combo-b" name="serviceBId" className="ops-field">
                    {allServiceOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-xs font-bold">
                  <input type="checkbox" name="canCombine" defaultChecked className="focus-ring h-4 w-4" />
                  قابل ترکیب
                </label>
                <label className="flex items-end gap-2 pb-2 text-xs font-bold">
                  <input type="checkbox" name="sameBarberRequired" className="focus-ring h-4 w-4" />
                  یک آرایشگر انجام دهد
                </label>
                <div className="sm:col-span-4">
                  <Field label="دلیلی که مشتری می‌بیند (وقتی ترکیب ممکن نیست)" name="note" required={false} />
                </div>
              </div>
            </ActionForm>
          </div>
        </Panel>
      )}

      <Panel id="hours" title="ساعت کاری سالن" description="دقایق را از نیمه‌شب حساب کنید (۶۰۰ = ۱۰:۰۰ صبح)؛ همین پنجره پایهٔ زمان‌بندی آنلاین و نوار اشغال است.">
        <ul className="ops-rows">
          {WEEKDAY_LABELS.map((label, weekday) => {
            const row = hours.find((h) => h.weekday === weekday);
            return (
              <li key={label} className="ops-row !justify-start">
                <span className="w-20 shrink-0 text-sm font-black">{label}</span>
                <ActionForm action={setSalonHoursAction} submitLabel={`ثبت ${label}`} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="weekday" value={weekday} />
                  <span className="flex items-center gap-1.5">
                    <span className="ops-meta">از</span>
                    <input
                      aria-label={`ساعت بازگشایی ${label} — دقیقه از نیمه‌شب`}
                      name="openMin"
                      type="number"
                      min={0}
                      max={1439}
                      defaultValue={row?.openMin ?? 600}
                      className="ops-ltr ops-field !w-24 text-center"
                    />
                    <span className="ops-meta">تا</span>
                    <input
                      aria-label={`ساعت پایان کار ${label} — دقیقه از نیمه‌شب`}
                      name="closeMin"
                      type="number"
                      min={0}
                      max={1439}
                      defaultValue={row?.closeMin ?? 1320}
                      className="ops-ltr ops-field !w-24 text-center"
                    />
                  </span>
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input type="checkbox" name="closed" defaultChecked={row?.closed} className="focus-ring h-4 w-4" />
                    تعطیل
                  </label>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel id="academy" title="کارگاه‌های حضوری" description="کلاس‌های فیزیکی آکادمی با ظرفیت صندلی؛ ثبت‌نام از صفحهٔ آکادمی سایت انجام می‌شود.">
        <ul className="ops-rows">
          {classRows.length === 0 && <li className="ops-empty">کلاسی تعریف نشده — از فرم پایین اولین دوره را بسازید.</li>}
          {classRows.map((c) => (
            <li key={c.id} className="ops-row">
              <span>
                <span className="font-bold">{c.title}</span>
                <span className="ops-meta block">{fa(c.seatsTaken)} از {fa(c.capacity)} صندلی گرفته شده</span>
              </span>
              <span className="ops-num font-bold">{formatPrice(c.price)}</span>
            </li>
          ))}
        </ul>
        {registrations.length > 0 && (
          <>
            <h3 className="mt-5 mb-2 text-[13px] font-bold">آخرین ثبت‌نام‌ها</h3>
            <ul className="ops-rows">
              {registrations.map(({ r, title }) => (
                <li key={r.id} className="ops-row !py-2">
                  <span>
                    <span className="font-semibold">{r.studentName}</span>
                    <span className="ops-meta"> — {title}</span>
                  </span>
                  <span className="ops-ltr ops-meta">{r.studentPhone}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {canManageAcademy && (
          <div className="ops-form">
            <ActionForm action={createClassAction} submitLabel="ثبت دورهٔ حضوری" className="mt-0">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="عنوان دوره" name="title" />
                <Field label="شناسه یکتا (slug)" name="slug" dir="ltr" />
                <Field label="سرفصل کوتاه" name="description" required={false} />
                <div>
                  <label htmlFor="cls-instructor" className="ops-label">مدرس دوره</label>
                  <select id="cls-instructor" name="instructorBarberId" className="ops-field">
                    {barberOptions.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cls-level" className="ops-label">سطح آموزشی</label>
                  <select id="cls-level" name="level" className="ops-field">
                    <option value="BEGINNER">مقدماتی</option>
                    <option value="INTERMEDIATE">میانی</option>
                    <option value="ADVANCED">پیشرفته</option>
                  </select>
                </div>
                <Field label="ظرفیت هنرجو" name="capacity" type="number" defaultValue={10} />
                <Field label="شهریه دوره (تومان)" name="price" type="number" defaultValue={5000000} />
                <Field label="تاریخ شروع" name="startsOn" type="date" dir="ltr" defaultValue={todayISO()} />
                <Field label="تعداد جلسات" name="sessions" type="number" defaultValue={2} />
              </div>
            </ActionForm>
          </div>
        )}
      </Panel>

      {canManageAcademy && (
        <Panel id="courses" title="دوره‌های آنلاین" description="سرفصل، ویدیو و تیزر، ظرفیت، نتایج آزمون و نظرات؛ انتشار را هم همین‌جا کنترل کنید.">
          <CourseAdminPanel />
        </Panel>
      )}

      {can("settings:manage") && (
        <Panel id="contact" title="آدرس و نقشه" description="آدرس را از نشان جست‌وجو کنید؛ همان مقدار در «آدرس و تماس» سایت، لینک مسیریابی و پیش‌نمایش نقشه استفاده می‌شود.">
          <ContactAdminWrapper />
        </Panel>
      )}

      <Panel id="audit" title="لاگ سیستم">
        <ul className="ops-rows">
          {logs.length === 0 && <li className="ops-empty">رویدادی ثبت نشده.</li>}
          {logs.map((l) => (
            <li key={l.id} className="ops-row !py-2 text-xs">
              <span>
                <span className="font-bold">{AUDIT_FA[l.action] ?? l.action}</span>
                {l.target && <span className="ops-meta"> — {l.target}</span>}
              </span>
              <span className="ops-ltr ops-meta">{l.actor} · {new Date(l.createdAt).toLocaleString("en-CA", { hour12: false }).slice(0, 17)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </DashboardShell>
  );
}
