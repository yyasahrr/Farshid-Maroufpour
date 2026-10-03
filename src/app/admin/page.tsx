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
import { DashboardShell, Panel } from "@/components/dashboard-shell";
import { ActionForm, Field } from "@/components/action-form";
import { BookingFlow } from "@/components/booking-flow";
import { StatCard } from "@/components/ui-cards";
import { NotificationList } from "@/components/notifications";
import { loadBookingData } from "@/app/(public)/booking/page";
import { getCurrentUser, isStaff } from "@/lib/session";
import {
  createBarberAction,
  createClassAction,
  createServiceAction,
  decideSkillAction,
  deleteCombinationRuleAction,
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
  salonMinuteOfDay,
  todayISO,
} from "@/lib/time";
import type { Permission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "live", label: "Live Salon" },
  { id: "notifications", label: "اعلان‌ها" },
  { id: "calendar", label: "تقویم روز" },
  { id: "walkin", label: "پذیرش حضوری" },
  { id: "clients", label: "بانک مشتریان" },
  { id: "team", label: "مدیریت تیم" },
  { id: "skills", label: "تأیید مهارت‌ها" },
  { id: "combos", label: "قوانین ترکیب خدمات" },
  { id: "services", label: "سرویس‌ها" },
  { id: "hours", label: "ساعات سالن" },
  { id: "academy", label: "آکادمی" },
  { id: "roles", label: "دسترسی‌ها و نقش‌ها" },
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
  CANCELLED_BY_STAFF: "لغو سالن",
};

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; barber?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user)) redirect("/barber");
  const can = (permission: Permission) => user.permissions.has(permission);
  const isSuper = user.roles.includes("SUPER_ADMIN");
  const canManageServices = can("services:manage");
  const canApproveSkills = can("skills:approve");
  const canManageRoles = can("roles:manage");
  const canManageAcademy = can("academy:manage");
  const sections = SECTIONS.filter((section) => {
    if (section.id === "skills") return canApproveSkills;
    if (section.id === "combos" || section.id === "services") return canManageServices;
    if (section.id === "roles" || section.id === "audit") return can("audit:view") || canManageRoles;
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

  /* ---- Live Salon timeline model: one block per VISIT (group), one row per staff ---- */
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
        blocks.push({ kind: "HOLD", startMin: start, endMin: end, title: "نگهداری موقت مشتری", meta: `${minutesToLabel(start)} تا ${minutesToLabel(end)} · ${minutesLeft.toLocaleString("fa-IR")} دقیقه مانده` });
      }
      for (const session of sessionsToday.filter((x) => x.instructorBarberId === b.id)) {
        blocks.push({ kind: "CLASS", startMin: session.s.startMin, endMin: session.s.endMin + session.s.bufferMin, title: `کلاس: ${session.title}`, meta: "ظرفیت آموزشی — نوبت سالن مسدود است" });
      }
      for (const block of blocksToday.filter((x) => x.barberId === b.id)) {
        blocks.push({ kind: block.fullDay ? "BLOCK" : "BREAK", startMin: block.startMin, endMin: block.endMin, title: block.reason, meta: block.fullDay ? "روز تعطیل/مرخصی" : undefined });
      }
      return { id: b.id, name: b.name, role: b.title, blocks };
    });
  const holdingPlans = new Set(holdsToday.map((h) => h.planId ?? `single-${h.id}`)).size;
  const awaitingRows = sorted.filter((r) => r.a.status === "AWAITING_APPROVAL" || r.a.status === "PENDING");
  const workingMinutes = timelineRows.reduce((sum, row) => sum + 12 * 60, 0);
  const bookedMinutes = timelineRows.reduce(
    (sum, row) => sum + row.blocks.filter((x) => x.kind === "BOOKING" || x.kind === "PENDING").reduce((s2, x) => s2 + (x.endMin - x.startMin), 0),
    0,
  );
  const capacityPct = workingMinutes > 0 ? Math.round((bookedMinutes / workingMinutes) * 100) : 0;
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
  const revenue = sorted
    .filter((r) => r.a.status === "COMPLETED")
    .reduce((sum, r) => sum + r.a.priceSnapshot, 0);

  const notifRows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.targetRole, user.role))
    .orderBy(desc(notifications.createdAt))
    .limit(12);

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

  return (
    <DashboardShell title="پنل مدیریت سالن" subtitle={`${user.name} · ${user.roles.map((r) => ROLE_LABEL_FA[r] ?? r).join(" + ")}`} sections={sections}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="نوبت‌های تقویم امروز" value={sorted.length} hint={formatPersianDate(date)} />
        <StatCard
          label="تکمیل‌شده"
          value={sorted.filter((r) => r.a.status === "COMPLETED").length}
          hint="سرویس‌های ارائه‌شده"
        />
        <StatCard
          label="درآمد صندوق امروز"
          value={formatPrice(revenue)}
          hint="نوبت‌های تسویه‌شده"
        />
        <StatCard
          label="تیم آرایشگران فعال"
          value={barberRows.filter((b) => b.active).length}
          hint={`از مجموع ${barberRows.length} پرسنل`}
        />
        <StatCard label="ثبت‌نام‌های آکادمی" value={registrations.length} hint="آخرین ورودی‌ها" />
        <StatCard
          label="هنرجویان فعال"
          value={new Set(registrations.map((r) => r.r.studentPhone)).size}
          hint="شماره‌های یکتا"
        />
        <StatCard
          label="کل غیبت‌های ثبت‌شده"
          value={clientRows.reduce((sum, c) => sum + Number(c.noShows ?? 0), 0)}
          hint="شاخص No-Show"
        />
        <StatCard
          label="بانک مشتریان یکتا"
          value={clientRows.length}
          hint="بر اساس شماره موبایل"
        />
      </div>

      <Panel id="notifications" title="اعلان‌های مدیریتی و رزروها">
        <NotificationList items={notificationItems} />
      </Panel>

      <Panel id="live" title="Live Salon — خط زمان عملیاتی" description={`نمایش زندهٔ ${formatPersianDate(date)}؛ هر میله یک نوبت کامل است، حتی اگر چند خدمت و چند پرسنل داشته باشد.`}>
        <LiveSalonTimeline rows={timelineRows} gridStartMin={TL_START} gridEndMin={TL_END} slotMin={30} nowMin={nowMin} />
        <p className="mt-3 text-[11px] text-bone/50">
          میلهٔ خط‌چین زرد یا قرمز یعنی پرداخت/تأیید نهایی نشده؛ میلهٔ خط‌چین سبز، Hold فعال مشتری است (کل برنامه قفل شده، نه یک اسلات).
        </p>
      </Panel>

      <Panel id="calendar" title="تقویم متمرکز روزانه سالن" description={formatPersianDate(date)}>
        <form className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#c59b4b]/20 bg-white/70 p-4" method="get">
          <div>
            <label htmlFor="date" className="text-[11px] font-semibold text-bone/70">
              انتخاب تاریخ
            </label>
            <input
              id="date"
              name="date"
              type="date"
              dir="ltr"
              defaultValue={date}
              className="focus-ring mt-1 rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label htmlFor="barber" className="text-[11px] font-semibold text-bone/70">
              فیلتر آرایشگر
            </label>
            <select
              id="barber"
              name="barber"
              defaultValue={barberFilter ?? ""}
              className="focus-ring mt-1 rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs"
            >
              <option value="">همه آرایشگران سالن</option>
              {barberRows.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="focus-ring rounded-full bg-[#0f5a3b] px-5 py-2 text-xs font-bold text-white hover:bg-[#094028]"
          >
            اعمال فیلتر تقویم
          </button>
        </form>

        {sorted.length === 0 ? (
          <p className="text-sm text-bone/50">برای این تاریخ نوبتی ثبت نشده است.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#c59b4b]/20 bg-white/70 p-2">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="text-xs text-bone/55 border-b border-[#c59b4b]/20">
                <tr>
                  <th className="py-2.5 px-3 font-bold">ساعت</th>
                  <th className="py-2.5 px-3 font-bold">مشتری</th>
                  <th className="py-2.5 px-3 font-bold">آرایشگر</th>
                  <th className="py-2.5 px-3 font-bold">سرویس</th>
                  <th className="py-2.5 px-3 font-bold">وضعیت</th>
                  <th className="py-2.5 px-3 font-bold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c59b4b]/10">
                {sorted.map(({ a, barberName, serviceName }) => (
                  <tr key={a.id} className="hover:bg-white/90">
                    <td className="py-3 px-3 font-mono font-black text-[#0f5a3b]">{minutesToLabel(a.startMin)}</td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-bone">{a.clientName}</span>
                      <span className="block font-mono text-xs text-bone/45" dir="ltr">
                        {a.clientPhone}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-bone">{barberName}</td>
                    <td className="py-3 px-3 text-xs text-[#855e16] font-semibold">{serviceName}</td>
                    <td className="py-3 px-3 text-xs">
                      <span className="rounded-full bg-[#0f5a3b]/10 border border-[#0f5a3b]/25 px-2.5 py-0.5 text-[11px] font-bold text-[#0f5a3b]">
                        {STATUS_FA[a.status]}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <form action={updateAppointmentStatusAction} className="flex gap-2">
                        <input type="hidden" name="appointmentId" value={a.id} />
                        <label className="sr-only" htmlFor={`adm-st-${a.id}`}>
                          وضعیت
                        </label>
                        <select
                          id={`adm-st-${a.id}`}
                          name="status"
                          defaultValue={a.status}
                          className="focus-ring rounded-xl border border-[#c59b4b]/30 bg-white px-2 py-1 text-xs"
                        >
                          {Object.keys(STATUS_FA).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_FA[s]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="focus-ring rounded-full bg-[#0f5a3b] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#094028]"
                        >
                          ثبت
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel id="walkin" title="پذیرش سریع و ثبت نوبت حضوری (Walk-in)">
        <BookingFlow
          servicesList={booking.servicesList}
          barbersList={booking.barbersList}
          staffMode
        />
      </Panel>

      <Panel id="clients" title="بانک مشتریان و سابقه حضور (CRM)">
        {clientRows.length === 0 ? (
          <p className="text-sm text-bone/50">هنوز مشتری‌ای در سامانه ثبت نشده است.</p>
        ) : (
          <ul className="divide-y divide-[#c59b4b]/15 rounded-2xl border border-[#c59b4b]/20 bg-white/70 p-2 text-sm">
            {clientRows.map((c) => (
              <li key={c.phone} className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-white rounded-xl">
                <div>
                  <span className="font-bold text-bone">{c.name}</span>
                  <span dir="ltr" className="block font-mono text-xs text-bone/45">
                    {c.phone}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="text-[#0f5a3b]">{c.visits} مراجعه موفق</span>
                  <span className="text-rose-700">{c.noShows} غیبت</span>
                  <span className="text-bone/50">آخرین حضور: {formatPersianDate(c.last)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel id="team" title="تیم آرایشگران و افزودن پرسنل جدید">
        <ul className="mb-6 divide-y divide-[#c59b4b]/15 rounded-2xl border border-[#c59b4b]/20 bg-white/70 p-2 text-sm">
          {barberRows.map((b) => (
            <li key={b.id} className="flex items-center justify-between p-3 hover:bg-white rounded-xl">
              <div>
                <p className="font-bold text-bone">{b.name}</p>
                <p className="text-xs text-[#0f5a3b] font-semibold">{b.title}</p>
              </div>
              <Link href={`/barbers/${b.slug}`} className="focus-ring rounded-full border border-[#c59b4b] px-4 py-1 text-xs font-semibold text-[#855e16] hover:bg-[#c59b4b] hover:text-white">
                مشاهده پروفایل عمومی ←
              </Link>
            </li>
          ))}
        </ul>
        {can("staff:manage") && (
          <div className="rounded-2xl border border-[#c59b4b]/30 bg-white/80 p-5">
            <h3 className="text-sm font-bold text-[#0f5a3b]">افزودن آرایشگر جدید به سالن</h3>
            <ActionForm action={createBarberAction} submitLabel="ایجاد پرونده آرایشگر" className="mt-3">
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

      <Panel id="services" title="سرویس‌های سالن و قیمت‌گذاری">
        <ul className="mb-6 divide-y divide-[#c59b4b]/15 rounded-2xl border border-[#c59b4b]/20 bg-white/70 p-2 text-sm">
          {serviceRows.map((s) => (
            <li key={s.id} className="flex items-center justify-between p-3 hover:bg-white rounded-xl">
              <div>
                <span className="font-bold text-bone">{s.name}</span>
                <span className="mr-3 text-xs text-bone/50">{s.durationMin} دقیقه کل · {s.barberDurationMin} دقیقه کار آرایشگر</span>
              </div>
              <span className="font-black text-sm text-[#855e16]">{formatPrice(s.basePrice)}</span>
            </li>
          ))}
        </ul>
        {canManageServices && (
          <div className="rounded-2xl border border-[#c59b4b]/30 bg-white/80 p-5">
            <h3 className="text-sm font-bold text-[#0f5a3b]">تعریف سرویس جدید سالن</h3>
            <ActionForm action={createServiceAction} submitLabel="ایجاد سرویس جدید" className="mt-3">
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
        )}
      </Panel>

      <Panel id="hours" title="ساعات کاری رسمی سالن">
        <ul className="space-y-3">
          {WEEKDAY_LABELS.map((label, weekday) => {
            const row = hours.find((h) => h.weekday === weekday);
            return (
              <li key={label} className="rounded-2xl border border-[#c59b4b]/25 bg-white/70 p-4">
                <ActionForm action={setSalonHoursAction} submitLabel="ثبت ساعات سالن">
                  <input type="hidden" name="weekday" value={weekday} />
                  <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                    <p className="text-sm font-black text-bone">{label}</p>
                    <Field label="بازگشایی (دقیقه از ۰۰:۰۰)" name="openMin" type="number" defaultValue={row?.openMin ?? 600} />
                    <Field label="پایان کار (دقیقه از ۰۰:۰۰)" name="closeMin" type="number" defaultValue={row?.closeMin ?? 1320} />
                    <label className="flex items-center gap-2 pb-2 text-xs font-bold text-[#855e16]">
                      <input
                        type="checkbox"
                        name="closed"
                        defaultChecked={row?.closed}
                        className="focus-ring h-4 w-4 rounded text-[#0f5a3b]"
                      />
                      سالن در این روز تعطیل است
                    </label>
                  </div>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel id="academy" title="دوره‌های آموزشی و ثبت‌نام‌های آکادمی">
        <ul className="mb-6 divide-y divide-[#c59b4b]/15 rounded-2xl border border-[#c59b4b]/20 bg-white/70 p-2 text-sm">
          {classRows.map((c) => (
            <li key={c.id} className="flex items-center justify-between p-3 hover:bg-white rounded-xl">
              <div>
                <span className="font-bold text-bone">{c.title}</span>
                <span className="mr-3 text-xs text-[#0f5a3b] font-semibold">
                  {c.seatsTaken} از {c.capacity} صندلی تکمیل‌شده
                </span>
              </div>
              <span className="font-black text-sm text-[#855e16]">{formatPrice(c.price)}</span>
            </li>
          ))}
        </ul>
        <h3 className="text-sm font-bold text-bone">آخرین ثبت‌نام‌کنندگان دوره‌ها:</h3>
        <ul className="mt-3 space-y-2 text-xs">
          {registrations.map(({ r, title }) => (
            <li key={r.id} className="flex justify-between rounded-xl border border-[#c59b4b]/15 bg-white p-2.5">
              <span className="font-semibold text-bone">
                {r.studentName} — <span className="text-[#0f5a3b]">{title}</span>
              </span>
              <span dir="ltr" className="font-mono text-bone/60">{r.studentPhone}</span>
            </li>
          ))}
        </ul>
        {canManageAcademy && (
          <div className="mt-6 rounded-2xl border border-[#c59b4b]/30 bg-white/80 p-5">
            <h3 className="text-sm font-bold text-[#0f5a3b]">تعریف دوره جدید در آکادمی</h3>
            <ActionForm action={createClassAction} submitLabel="ثبت دوره جدید" className="mt-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="عنوان دوره" name="title" />
                <Field label="شناسه یکتا (slug)" name="slug" dir="ltr" />
                <Field label="توضیحات سرفصل" name="description" required={false} />
                <div>
                  <label htmlFor="cls-instructor" className="text-[11px] font-semibold text-bone/65">
                    مدرس دوره
                  </label>
                  <select
                    id="cls-instructor"
                    name="instructorBarberId"
                    className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-semibold"
                  >
                    {barberRows.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cls-level" className="text-[11px] font-semibold text-bone/65">
                    سطح آموزشی
                  </label>
                  <select
                    id="cls-level"
                    name="level"
                    className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-semibold"
                  >
                    <option value="BEGINNER">مقدماتی</option>
                    <option value="INTERMEDIATE">میانی</option>
                    <option value="ADVANCED">پیشرفته</option>
                  </select>
                </div>
                <Field label="ظرفیت هنرجو" name="capacity" type="number" defaultValue={10} />
                <Field label="شهریه دوره (تومان)" name="price" type="number" defaultValue={5000000} />
                <Field label="تاریخ شروع دوره" name="startsOn" type="date" dir="ltr" defaultValue={todayISO()} />
                <Field label="تعداد جلسات" name="sessions" type="number" defaultValue={2} />
              </div>
            </ActionForm>
          </div>
        )}
      </Panel>

      {canApproveSkills && (
        <Panel id="skills" title="صف تأیید مهارت‌ها" description="مهارت اعلامی آرایشگر تا تأیید مدیریت در زمان‌بندی استفاده نمی‌شود.">
          {pendingSkills.length === 0 ? (
            <p className="text-sm text-bone/55">درخواست در انتظار تأییدی وجود ندارد.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {pendingSkills.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c59b4b]/20 bg-white/70 p-3">
                  <span>
                    <b className="text-bone">{row.barberName}</b>
                    <span className="mr-2 text-[#855e16]">ادعای مهارت «{row.skillName}»</span>
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

      {canManageServices && (
        <Panel id="combos" title="قوانین ترکیب خدمات" description="دیتامحور: رزرو چندخدمتی روی همین ماتریس اعتبارسنجی می‌شود؛ UI فقط بازتاب آن است.">
          <ul className="mb-4 space-y-2 text-xs">
            {ruleRows.length === 0 && <li className="text-bone/50">هنوز قانونی ثبت نشده؛ جفت‌های بدون قانون = ترکیب آزاد.</li>}
            {ruleRows.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c59b4b]/20 bg-white/70 p-3 text-sm">
                <span className="font-semibold text-bone">
                  {rule.nameA}
                  <span className="mx-1 text-bone/50">↔</span>
                  {serviceRows.find((x) => x.id === rule.b)?.name ?? `سرویس ${rule.b}`}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 font-bold ${rule.canCombine ? "bg-[#e4ece3] text-[#2f4a3a]" : "bg-rose-50 text-rose-700"}`}>
                    {rule.canCombine ? "قابل ترکیب" : "غیرقابل ترکیب"}
                  </span>
                  {rule.sameBarberRequired && <span className="rounded-full bg-[#f7f0d8] px-2 py-0.5 font-bold text-[#6b5213]">یک آرایشگر</span>}
                  {rule.note && <span className="max-w-[220px] truncate text-[#855e16]" title={rule.note}>{rule.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-[#c59b4b]/30 bg-white/80 p-5">
            <h3 className="text-sm font-bold text-[#0f5a3b]">ثبت/ویرایش قانون برای یک جفت خدمت</h3>
            <ActionForm action={upsertCombinationRuleAction} submitLabel="ذخیره قانون" className="mt-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label htmlFor="combo-a" className="text-[11px] font-semibold text-bone/65">خدمت اول</label>
                  <select id="combo-a" name="serviceAId" className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-semibold">
                    {allServiceOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="combo-b" className="text-[11px] font-semibold text-bone/65">خدمت دوم</label>
                  <select id="combo-b" name="serviceBId" className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-semibold">
                    {allServiceOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-[#855e16]">
                  <input type="checkbox" name="canCombine" defaultChecked className="focus-ring h-4 w-4" />
                  قابل ترکیب
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-[#855e16]">
                  <input type="checkbox" name="sameBarberRequired" className="focus-ring h-4 w-4" />
                  باید یک آرایشگر انجام دهد
                </label>
                <div className="sm:col-span-4">
                  <Field label="دلیل نمایشی برای مشتری (در صورت عدم امکان ترکیب)" name="note" required={false} />
                </div>
              </div>
            </ActionForm>
          </div>
        </Panel>
      )}

      {canManageRoles && (
        <Panel id="roles" title="نقش‌ها و دسترسی‌ها" description="مدل چندنقشی: هر کاربر مجموعه‌ای از نقش‌ها دارد؛ دسترسی از همین جدول ساخته می‌شود، نه یک ستون یکتا.">
          <ul className="space-y-2 text-sm">
            {rosterRows.map((person) => (
              <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c59b4b]/20 bg-white/70 p-3">
                <span className="min-w-0">
                  <b className="text-bone">{person.name}</b>
                  <span dir="ltr" className="mr-2 font-mono text-xs text-bone/50">{person.phone}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {person.roles.length ? person.roles.map((role) => (
                      <span key={role} className="rounded-full bg-[#e2efe8] px-2 py-0.5 text-[10px] font-bold text-[#2f4a3a]">
                        {ROLE_LABEL_FA[role] ?? role}
                      </span>
                    )) : <span className="text-[10px] text-bone/45">بدون عضویت — از نقش قدیمی استفاده می‌شود</span>}
                  </span>
                </span>
                <form className="flex items-center gap-2 text-xs" action={setRoleMembershipAction as unknown as (formData: FormData) => Promise<void>}>
                  <label htmlFor={`role-${person.id}`} className="sr-only">نقش برای {person.name}</label>
                  <select id={`role-${person.id}`} name="role" className="focus-ring rounded-xl border border-[#c59b4b]/30 bg-white px-2 py-1.5 font-semibold">
                    {Object.entries(ROLE_LABEL_FA).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <input type="hidden" name="userId" value={person.id} />
                  <button type="submit" name="action" value="GRANT" className="focus-ring rounded-full bg-[#0f5a3b] px-3 py-1 font-bold text-white">اعطا</button>
                  <button type="submit" name="action" value="REVOKE" className="focus-ring rounded-full border border-rose-300 px-3 py-1 font-bold text-rose-700">برداشتن</button>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel id="audit" title="لاگ حسابرسی و رویدادهای سیستمی">
        <ul className="space-y-2 text-xs">
          {logs.map((l) => (
            <li key={l.id} className="flex justify-between rounded-xl border border-[#c59b4b]/15 bg-white/70 p-2.5">
              <span>
                <b className="text-[#0f5a3b]">{l.action}</b> — {l.target}
              </span>
              <span className="font-mono text-bone/45">{l.actor}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </DashboardShell>
  );
}
