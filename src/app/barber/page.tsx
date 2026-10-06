import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  barberSchedule,
  barberServices,
  barbers,
  blockedTimes,
  notifications,
  services,
} from "@/db/schema";
import { DashboardShell, Panel } from "@/components/dashboard-shell";
import { ActionForm, Field } from "@/components/action-form";
import { AvailabilityHeatmap } from "@/components/heatmap";
import { NotificationList } from "@/components/notifications";
import { buildVisitGroups, nextHandoff, segmentsFor } from "@/lib/visits";
import { heatmap } from "@/lib/availability";
import { getCurrentUser } from "@/lib/session";
import {
  applyScheduleTemplateAction,
  blockTimeAction,
  removeBlockAction,
  setBarberDayAction,
  toggleBarberServiceAction,
  updateAppointmentStatusAction,
  updateBarberProfileAction,
} from "@/lib/actions/salon";
import {
  WEEKDAY_LABELS,
  formatPersianDate,
  formatPrice,
  minutesToLabel,
  salonMinuteOfDay,
  todayISO,
} from "@/lib/time";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "today", label: "امروز" },
  { id: "notifications", label: "اعلان‌ها" },
  { id: "schedule", label: "برنامه هفتگی" },
  { id: "slots", label: "اسلات‌ها و مرخصی" },
  { id: "profile", label: "پروفایل عمومی" },
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
  CANCELLED_BY_STAFF: "لغو سالن",
};

export default async function BarberDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "BARBER" || !user.barberId) redirect("/admin");

  const barberId = user.barberId;
  const today = todayISO();
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId)).limit(1);
  const [todayAppts, week, allServices, myServices, blocks] = await Promise.all([
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
  ]);

  // A visit is one customer concept, so the barber sees the whole visit — their
  // own segments plus what happens before/after in another chair.
  const groupIds = [...new Set(todayAppts.map((row) => row.a.bookingGroupId).filter(Boolean))] as string[];
  const memberRows = groupIds.length
    ? await db
        .select({
          id: appointments.id,
          bookingGroupId: appointments.bookingGroupId,
          date: appointments.date,
          startMin: appointments.startMin,
          endMin: appointments.endMin,
          serviceId: services.id,
          serviceName: services.name,
          barberId: barbers.id,
          barberName: barbers.name,
          status: appointments.status,
          clientName: appointments.clientName,
          clientPhone: appointments.clientPhone,
          priceSnapshot: appointments.priceSnapshot,
        })
        .from(appointments)
        .innerJoin(services, eq(services.id, appointments.serviceId))
        .innerJoin(barbers, eq(barbers.id, appointments.barberId))
        .where(and(eq(appointments.date, today), inArray(appointments.bookingGroupId, groupIds)))
    : [];
  const memberIds = new Set(memberRows.map((row) => row.id));
  const visitRows = [
    ...memberRows,
    ...todayAppts
      .filter((row) => !memberIds.has(row.a.id))
      .map((row) => ({
        id: row.a.id,
        bookingGroupId: row.a.bookingGroupId,
        date: row.a.date,
        startMin: row.a.startMin,
        endMin: row.a.endMin,
        serviceId: row.a.serviceId,
        serviceName: row.serviceName,
        barberId: row.a.barberId,
        barberName: barber?.name ?? "",
        status: row.a.status,
        clientName: row.a.clientName,
        clientPhone: row.a.clientPhone,
        priceSnapshot: row.a.priceSnapshot,
      })),
  ];
  const visits = buildVisitGroups(visitRows).filter((visit) =>
    visit.segments.some((segment) => segment.barberId === barberId),
  );
  const mySegments = visitRows.filter((row) => row.barberId === barberId);

  const active = todayAppts
    .filter((r) => !r.a.status.startsWith("CANCELLED"))
    .sort((x, y) => x.a.startMin - y.a.startMin);
  const nowMin = salonMinuteOfDay();
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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-[#c59b4b]/25 bg-white/70 px-4 py-3 text-sm">
        <span className="font-black text-bone">
          {visits.length.toLocaleString("fa-IR")} نوبت امروز
        </span>
        <span className="text-xs font-semibold text-bone/60">
          {mySegments.length.toLocaleString("fa-IR")} خدمت در سبد شما
        </span>
        <span className="text-xs font-semibold text-bone/60">
          {active.filter((r) => r.a.startMin >= nowMin).length.toLocaleString("fa-IR")} نوبت باقی‌مانده شیفت
        </span>
        <span className="text-xs font-semibold text-[#0f5a3b]">
          {formatPrice(dayRevenue)} ثبت‌شده تا این لحظه
        </span>
      </div>

      <Panel id="notifications" title="اعلان‌های پنل آرایشگر">
        <NotificationList items={notificationItems} />
      </Panel>

      <Panel id="today" title={`امروز، ${visits.length.toLocaleString("fa-IR")} نوبت`} description={formatPersianDate(today)}>
        {visits.length === 0 ? (
          <p className="text-sm text-bone/50">امروز نوبتی ندارید.</p>
        ) : (
          <ul className="space-y-3">
            {visits.map((visit) => {
              const mine = segmentsFor(visit, barberId);
              const handoff = nextHandoff(visit, barberId);
              const firstOwned = mine[0];
              return (
                <li
                  key={visit.key}
                  className={`rounded-2xl border bg-white/70 p-4 ${
                    firstOwned?.status === "CHECKED_IN" || firstOwned?.status === "IN_PROGRESS"
                      ? "border-[#0f5a3b]/40"
                      : "border-[#c59b4b]/20"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-lg font-black tabular-nums text-[#0f5a3b]">
                      {minutesToLabel(visit.startMin)}
                      <span className="mx-1.5 text-xs font-bold text-bone/50">تا</span>
                      {minutesToLabel(visit.endMin)}
                    </p>
                    <p className="text-sm font-bold text-bone">{visit.clientName}</p>
                    <a
                      href={`tel:${visit.clientPhone}`}
                      dir="ltr"
                      className="focus-ring rounded-lg bg-[#0f5a3b]/10 px-2.5 py-1 font-mono text-xs font-bold text-[#0f5a3b]"
                    >
                      {visit.clientPhone}
                    </a>
                  </div>

                  <div className="mt-3 rounded-xl bg-[#f7f6f1] p-3">
                    <p className="text-[11px] font-bold text-bone/60">
                      {visit.segments.length > 1
                        ? `کل نوبت ${visit.segments.length.toLocaleString("fa-IR")} خدمت · ${visit.barberNames.join(" + ")}`
                        : "خدمت شما"}
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {mine.map((segment) => (
                        <li
                          key={segment.id}
                          data-barber-segment={segment.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1"
                        >
                          <span className="w-[104px] font-bold tabular-nums" dir="ltr">
                            {minutesToLabel(segment.startMin)}–{minutesToLabel(segment.endMin)}
                          </span>
                          <span className="font-semibold text-bone">{segment.serviceName}</span>
                          <span className="text-[11px] text-bone/50">
                            {(segment.endMin - segment.startMin).toLocaleString("fa-IR")} دقیقه
                          </span>
                          <form action={updateAppointmentStatusAction} className="ms-auto flex items-center gap-2">
                            <input type="hidden" name="appointmentId" value={segment.id} />
                            <label className="sr-only" htmlFor={`st-${segment.id}`}>
                              وضعیت {segment.serviceName}
                            </label>
                            <select
                              id={`st-${segment.id}`}
                              name="status"
                              defaultValue={segment.status}
                              className="focus-ring rounded-lg border border-[#c59b4b]/30 bg-white px-2 py-1 text-[11px] font-semibold"
                            >
                              {Array.from(new Set([segment.status, ...NEXT_STATUS])).map((status) => (
                                <option key={status} value={status}>
                                  {STATUS_FA[status]}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="focus-ring rounded-lg bg-[#0f5a3b] px-2.5 py-1 text-[11px] font-bold text-white"
                            >
                              ثبت وضعیت
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {handoff && (
                    <p className="mt-2 text-xs font-semibold text-bone/60">
                      بعدی: {minutesToLabel(handoff.startMin)}–{minutesToLabel(handoff.endMin)} — {handoff.serviceName} با{" "}
                      {handoff.barberName}
                    </p>
                  )}
                </li>
              );
            })}
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
