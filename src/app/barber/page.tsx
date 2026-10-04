import { redirect } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { sweepExpiredPending } from "@/lib/appointment-lifecycle";
import {
  appointments,
  barberSchedule,
  barberServices,
  barberSkills,
  barbers,
  blockedTimes,
  notifications,
  services,
  skills,
} from "@/db/schema";
import { DashboardShell, Panel } from "@/components/dashboard-shell";
import { ActionForm, Field } from "@/components/action-form";
import { AvailabilityHeatmap } from "@/components/heatmap";
import { StatCard } from "@/components/ui-cards";
import { NotificationList } from "@/components/notifications";
import { heatmap } from "@/lib/availability";
import { getCurrentUser, isStaff } from "@/lib/session";
import {
  applyScheduleTemplateAction,
  blockTimeAction,
  removeBlockAction,
  setBarberDayAction,
  requestSkillAction,
  toggleBarberServiceAction,
  updateAppointmentStatusAction,
  updateBarberProfileAction,
} from "@/lib/actions/salon";
import { WEEKDAY_LABELS, formatPersianDate, formatPrice, minutesToLabel, salonMinuteOfDay, todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "notifications", label: "اعلان‌ها" },
  { id: "today", label: "نوبت‌های امروز" },
  { id: "schedule", label: "برنامه هفتگی" },
  { id: "slots", label: "اسلات‌ها و مرخصی" },
  { id: "profile", label: "پروفایل عمومی" },
  { id: "skills", label: "مهارت‌ها و تخصص‌ها" },
  { id: "svc", label: "خدمات فعال" },
];

const NEXT_STATUS = ["CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED_BY_STAFF"];
const STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار",
  CONFIRMED: "تأیید شده",
  CHECKED_IN: "حاضر شد",
  IN_PROGRESS: "در حال انجام",
  COMPLETED: "تکمیل",
  NO_SHOW: "غیبت",
  CANCELLED_BY_CLIENT: "لغو مشتری",
  CANCELLED_EXPIRED: "لغو خودکار (انقضای پرداخت)",
  CANCELLED_BY_STAFF: "لغو سالن",
};

export default async function BarberDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Any user holding a barber-facing role can enter; staff can too (they also own /admin).
  if (!user.permissions.has("booking:self") || !user.barberId) redirect(isStaff(user) ? "/admin" : "/login");

  const barberId = user.barberId;
  const today = todayISO();
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId)).limit(1);
  await sweepExpiredPending(db);
  const [todayAppts, week, allServices, myServices, blocks, mySkillRows, allSkillRows] = await Promise.all([
    db
      .select({
        a: appointments,
        serviceName: services.name,
      })
      .from(appointments)
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(and(eq(appointments.barberId, barberId), eq(appointments.date, today))),
    db.select().from(barberSchedule).where(eq(barberSchedule.barberId, barberId)),
    db.select().from(services).where(eq(services.active, true)),
    db.select().from(barberServices).where(eq(barberServices.barberId, barberId)),
    db
      .select()
      .from(blockedTimes)
      .where(and(eq(blockedTimes.barberId, barberId), gte(blockedTimes.date, today))),
    db
      .select({
        skillId: barberSkills.skillId,
        name: skills.name,
        status: barberSkills.status,
      })
      .from(barberSkills)
      .innerJoin(skills, eq(skills.id, barberSkills.skillId))
      .where(eq(barberSkills.barberId, barberId)),
    db.select().from(skills),
  ]);

  const active = todayAppts
    .filter((r) => !r.a.status.startsWith("CANCELLED"))
    .sort((x, y) => x.a.startMin - y.a.startMin);
  const nowMin = salonMinuteOfDay();
  const nextClient = active.find((r) => r.a.startMin >= nowMin) ?? null;
  const firstService = myServices[0]?.serviceId;
  const grid = firstService ? await heatmap(barberId, firstService, 7) : [];

  const notifRows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.targetRole, "BARBER"), eq(notifications.userId, user.id)))
    .orderBy(desc(notifications.createdAt))
    .limit(10);
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

  const dayRevenue = active
    .filter((r) => r.a.status === "COMPLETED")
    .reduce((sum, r) => sum + r.a.priceSnapshot, 0);

  return (
    <DashboardShell title="پنل آرایشگر" subtitle={barber?.name ?? ""} sections={SECTIONS}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-5 rounded-full bg-[#c59b4b]" />
            <p className="text-xs font-bold tracking-[0.3em] text-[#0f5a3b]">BARBER ATELIER WORKSPACE</p>
          </div>
          <h1 className="mt-2 text-2xl font-black text-bone md:text-3xl">
            سلام، {barber?.name.split(" ")[0] ?? "همکار گرامی"}.
          </h1>
        </div>
        <span className="rounded-full border border-[#c59b4b]/40 bg-white/80 px-4 py-1.5 text-xs font-bold text-[#855e16]">
          {formatPersianDate(today)}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="نوبت‌های امروز" value={active.length} hint={formatPersianDate(today)} />
        <StatCard label="درآمد ثبت‌شده امروز" value={formatPrice(dayRevenue)} hint="سرویس‌های تکمیل‌شده" />
        <StatCard
          label="تکمیل‌شده"
          value={active.filter((r) => r.a.status === "COMPLETED").length}
          hint="تا این لحظه"
        />
        <StatCard
          label="نوبت‌های پیش‌رو"
          value={active.filter((r) => r.a.startMin >= nowMin).length}
          hint="باقی‌مانده شیفت"
        />
      </div>

      <Panel id="notifications" title="اعلان‌های پنل آرایشگر">
        <NotificationList items={notificationItems} />
      </Panel>

      <Panel id="today" title={`امروز ${active.length} نوبت کاری دارید`} description={formatPersianDate(today)}>
        {nextClient ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#c59b4b]/35 bg-gradient-to-r from-white via-white to-[#fbf8f0] p-5 shadow-sm">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0f5a3b] animate-ping" />
                <p className="text-xs font-bold text-[#0f5a3b]">مشتری بعدی شما</p>
              </div>
              <p className="mt-1 text-2xl font-black text-[#855e16]">{minutesToLabel(nextClient.a.startMin)}</p>
              <p className="text-sm font-semibold text-bone">
                {nextClient.a.clientName} — {nextClient.serviceName}
              </p>
            </div>
            <p dir="ltr" className="font-mono text-sm font-bold text-[#0f5a3b] bg-[#0f5a3b]/10 px-3 py-1.5 rounded-xl border border-[#0f5a3b]/20">
              {nextClient.a.clientPhone}
            </p>
          </div>
        ) : (
          <p className="mb-6 text-sm text-bone/50">نوبت پیش‌روی دیگری برای امروز ثبت نشده است.</p>
        )}

        {active.length === 0 ? (
          <p className="text-sm text-bone/50">امروز نوبتی ندارید.</p>
        ) : (
          <ul className="divide-y divide-[#c59b4b]/15 rounded-2xl border border-[#c59b4b]/20 bg-white/70 p-2">
            {active.map(({ a, serviceName }) => (
              <li key={a.id} className="flex flex-wrap items-center gap-4 p-3 text-sm transition hover:bg-white/80 rounded-xl">
                <span className="w-16 font-mono font-black text-[#0f5a3b] text-base">{minutesToLabel(a.startMin)}</span>
                <span className="min-w-32 flex-1">
                  <span className="font-bold text-bone">{a.clientName}</span>
                  <span className="block font-mono text-xs text-bone/45" dir="ltr">
                    {a.clientPhone}
                  </span>
                </span>
                <span className="text-xs font-semibold text-[#855e16]">{serviceName}</span>
                <span className="rounded-full bg-[#0f5a3b]/10 border border-[#0f5a3b]/25 px-3 py-1 text-[11px] font-bold text-[#0f5a3b]">
                  {STATUS_FA[a.status]}
                </span>
                <form action={updateAppointmentStatusAction} className="flex items-center gap-2">
                  <input type="hidden" name="appointmentId" value={a.id} />
                  <label className="sr-only" htmlFor={`st-${a.id}`}>
                    تغییر وضعیت
                  </label>
                  <select
                    id={`st-${a.id}`}
                    name="status"
                    defaultValue={a.status}
                    className="focus-ring rounded-xl border border-[#c59b4b]/30 bg-white px-2.5 py-1.5 text-xs font-semibold"
                  >
                    {Array.from(new Set([a.status, ...NEXT_STATUS])).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_FA[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="focus-ring rounded-full bg-[#0f5a3b] px-3.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#094028]"
                  >
                    ثبت وضعیت
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="schedule"
        title="برنامه کاری هفتگی"
        description="ساعات شیفت حضور خود را مشخص فرمایید؛ ساعات سالن با یک کلیک قابل اعمال است."
      >
        <div className="flex flex-wrap gap-2.5">
          {[
            { key: "SALON", label: "⚡ اعمال ساعات پیش‌فرض سالن" },
            { key: "FULL", label: "شیفت کامل (۱۰ تا ۲۲)" },
            { key: "EVENING", label: "شیفت عصر (۱۵ تا ۲۲)" },
            { key: "WEEKEND", label: "قالب آخر هفته" },
          ].map((t) => (
            <ActionForm key={t.key} action={applyScheduleTemplateAction} submitLabel={t.label}>
              <input type="hidden" name="barberId" value={barberId} />
              <input type="hidden" name="template" value={t.key} />
            </ActionForm>
          ))}
        </div>

        <ul className="mt-7 space-y-3">
          {WEEKDAY_LABELS.map((label, weekday) => {
            const row = week.find((w) => w.weekday === weekday);
            return (
              <li key={label} className="rounded-2xl border border-[#c59b4b]/25 bg-white/70 p-4">
                <ActionForm action={setBarberDayAction} submitLabel="ذخیره ساعت">
                  <input type="hidden" name="barberId" value={barberId} />
                  <input type="hidden" name="weekday" value={weekday} />
                  <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                    <p className="text-sm font-black text-bone">{label}</p>
                    <Field
                      label="شروع (دقیقه از بامداد)"
                      name="startMin"
                      type="number"
                      defaultValue={row?.startMin ?? 600}
                    />
                    <Field
                      label="پایان"
                      name="endMin"
                      type="number"
                      defaultValue={row?.endMin ?? 1320}
                    />
                    <label className="flex items-center gap-2 pb-2 text-xs font-bold text-[#855e16]">
                      <input
                        type="checkbox"
                        name="dayOff"
                        defaultChecked={row?.dayOff}
                        className="focus-ring h-4 w-4 rounded text-[#0f5a3b]"
                      />
                      روز تعطیل من (Off)
                    </label>
                  </div>
                </ActionForm>
                <p className="mt-2 text-[11px] text-bone/50">
                  وضعیت فعلی: {row?.dayOff ? "تعطیل" : `${minutesToLabel(row?.startMin ?? 0)} تا ${minutesToLabel(row?.endMin ?? 0)}`}
                </p>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel id="slots" title="اسلات‌ها و ثبت مرخصی/مسدودی" description="نمای ۷ روز آینده براساس ساعت سالن و برنامه شما">
        {grid.length > 0 ? (
          <AvailabilityHeatmap days={grid} />
        ) : (
          <p className="text-sm text-bone/50">برای فعال شدن تقویم اسلات‌ها، حداقل یک سرویس را برای خود فعال فرمایید.</p>
        )}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-[#c59b4b]/25 bg-white/70 p-5">
            <h3 className="text-sm font-bold text-[#0f5a3b]">مسدود کردن بازه زمانی یا روز کامل</h3>
            <ActionForm action={blockTimeAction} submitLabel="ثبت مسدودی" className="mt-3">
              <input type="hidden" name="barberId" value={barberId} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="تاریخ" name="date" type="date" defaultValue={today} dir="ltr" />
                <Field label="علت مسدودی" name="reason" defaultValue="جلسه / کار شخصی" />
                <Field label="از ساعت (دقیقه)" name="startMin" type="number" defaultValue={900} />
                <Field label="تا ساعت (دقیقه)" name="endMin" type="number" defaultValue={990} />
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs font-bold text-[#855e16]">
                <input type="checkbox" name="fullDay" className="focus-ring h-4 w-4 rounded text-[#0f5a3b]" />
                کل روز (مرخصی روزانه)
              </label>
            </ActionForm>
          </div>
          <div className="rounded-2xl border border-[#c59b4b]/25 bg-white/70 p-5">
            <h3 className="text-sm font-bold text-bone">مرخصی‌ها و مسدودی‌های آینده</h3>
            {blocks.length === 0 ? (
              <p className="mt-3 text-xs text-bone/50">هیچ بازه مسدودی ثبت نشده است.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {blocks.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#c59b4b]/15 bg-white p-2.5">
                    <span>
                      {formatPersianDate(b.date)} —{" "}
                      {b.fullDay
                        ? "کل روز"
                        : `${minutesToLabel(b.startMin)} تا ${minutesToLabel(b.endMin)}`}{" "}
                      ({b.reason})
                    </span>
                    <form action={removeBlockAction}>
                      <input type="hidden" name="blockId" value={b.id} />
                      <button
                        type="submit"
                        className="focus-ring rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-rose-700 hover:bg-rose-100"
                      >
                        حذف
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>

      <Panel id="profile" title="ویرایش پروفایل عمومی و README" description="اطلاعات هویتی شما در صفحه عمومی آرایشگران نمایش داده می‌شود">
        <ActionForm action={updateBarberProfileAction} submitLabel="ذخیره تغییرات پروفایل">
          <input type="hidden" name="barberId" value={barberId} />
          <div className="space-y-4">
            <Field label="عنوان شغلی و تخصص" name="title" defaultValue={barber?.title ?? ""} />
            <div>
              <label htmlFor="bio" className="text-[11px] font-semibold text-bone/65">
                معرفی کوتاه (Bio)
              </label>
              <textarea
                id="bio"
                name="bio"
                rows={3}
                defaultValue={barber?.bio ?? ""}
                className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="readme" className="text-[11px] font-semibold text-bone/65">
                README اختصاصی (سبک کاری، قوانین حضور و رزومه)
              </label>
              <textarea
                id="readme"
                name="readme"
                rows={8}
                defaultValue={barber?.readme ?? ""}
                className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs leading-6"
              />
            </div>
          </div>
        </ActionForm>
      </Panel>

      <Panel id="skills" title="مهارت‌ها و تخصص‌ها" description="مهارت اعلامی شما تا تأیید مدیریت در زمان‌بندی نوبت‌ها فعال نمی‌شود.">
        <ul className="mb-4 flex flex-wrap gap-2 text-xs">
          {mySkillRows.length === 0 && <li className="text-bone/55">هنوز مهارتی ثبت نکرده‌اید.</li>}
          {mySkillRows.map((row) => (
            <li
              key={row.skillId}
              className={`rounded-full px-3 py-1.5 font-bold ${
                row.status === "APPROVED"
                  ? "bg-[#e4ece3] text-[#2f4a3a]"
                  : row.status === "PENDING"
                    ? "border border-dashed border-[#8a6a1e] text-[#8a6a1e]"
                    : "bg-rose-50 text-rose-700"
              }`}
            >
              {row.name}
              {row.status === "PENDING" && " · در انتظار تأیید"}
              {row.status === "REJECTED" && " · تأیید نشد"}
            </li>
          ))}
        </ul>
        <h3 className="text-sm font-bold text-bone">درخواست مهارت جدید</h3>
        <ActionForm action={requestSkillAction} submitLabel="ثبت درخواست (نیازمند تأیید مدیر)" className="mt-3">
          <input type="hidden" name="barberId" value={barberId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="skill-claim" className="text-[11px] font-semibold text-bone/65">مهارت</label>
              <select id="skill-claim" name="skillId" className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-semibold">
                {allSkillRows.map((sk) => (
                  <option key={sk.id} value={sk.id}>{sk.name}</option>
                ))}
              </select>
            </div>
          </div>
        </ActionForm>
      </Panel>

      <Panel id="svc" title="سرویس‌های قابل ارائه توسط شما" description="تنها سرویس‌های فعال‌شده توسط شما در صفحه رزرو مشتریان نمایش داده می‌شوند">
        <ul className="grid gap-3 sm:grid-cols-2">
          {allServices.map((s) => {
            const enabled = myServices.some((m) => m.serviceId === s.id);
            return (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-2xl border border-[#c59b4b]/25 bg-white/70 p-4 text-sm"
              >
                <div>
                  <p className="font-bold text-bone">{s.name}</p>
                  <p className="text-xs text-bone/55">
                    {s.durationMin} دقیقه · {formatPrice(s.basePrice)}
                  </p>
                </div>
                <form action={toggleBarberServiceAction}>
                  <input type="hidden" name="barberId" value={barberId} />
                  <input type="hidden" name="serviceId" value={s.id} />
                  <button
                    type="submit"
                    className={`focus-ring rounded-full px-4 py-1.5 text-xs font-bold transition ${
                      enabled
                        ? "bg-[#0f5a3b] text-white shadow-xs"
                        : "border border-[#c59b4b]/40 bg-white text-bone/70 hover:border-[#0f5a3b]"
                    }`}
                  >
                    {enabled ? "فعال است ✓" : "فعال‌سازی"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </Panel>
    </DashboardShell>
  );
}
