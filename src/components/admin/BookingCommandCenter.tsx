import { ActionForm, Field } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui-cards";
import { reassignAppointmentAction } from "@/lib/actions/salon";
import { buildVisitGroups, visitStatus, type VisitSegmentRow } from "@/lib/visits";
import { formatPersianDate, formatPrice, minutesToLabel } from "@/lib/time";

/**
 * Booking command center — the operational view of one day.
 *
 * Each reservation is ONE row with its internal assignment segments, so a
 * multi-service visit with a handover reads as one booking that happens to use
 * two chairs. Capacity, free staff and payment exceptions sit above it; nothing
 * decorative.
 */

const STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار پرداخت",
  CONFIRMED: "تأیید شده",
  CHECKED_IN: "حاضر شد",
  IN_PROGRESS: "در حال انجام",
  COMPLETED: "تکمیل",
  NO_SHOW: "غیبت",
  CANCELLED_BY_CLIENT: "لغو مشتری",
  CANCELLED_BY_STAFF: "لغو سالن",
};

export type CommandCenterBarber = { id: number; name: string; serviceIds: number[] };

export type CommandCenterVisitRow = VisitSegmentRow & {
  serviceId: number;
  barberId: number;
  status: string;
};

export function BookingCommandCenter({
  date,
  rows,
  barbers,
  workingBarberIds,
  openMinutesPerBarber,
  nowMin,
  isToday,
}: {
  date: string;
  rows: CommandCenterVisitRow[];
  barbers: CommandCenterBarber[];
  /** Barbers whose schedule is open on this date. */
  workingBarberIds: number[];
  openMinutesPerBarber: number;
  nowMin: number;
  isToday: boolean;
}) {
  const visits = buildVisitGroups(rows).filter((visit) => visitStatus(visit) !== "CANCELLED_BY_STAFF");
  const activeVisits = visits.filter((visit) => !visitStatus(visit).startsWith("CANCELLED"));
  const segments = activeVisits.flatMap((visit) => visit.segments);
  const bookedMinutes = segments.reduce((sum, segment) => sum + (segment.endMin - segment.startMin), 0);
  const capacity = Math.max(workingBarberIds.length * openMinutesPerBarber, 1);
  const utilisation = Math.min(100, Math.round((bookedMinutes / capacity) * 100));
  const pendingPayment = activeVisits.filter((visit) => visitStatus(visit) === "PENDING");
  const multiBarber = activeVisits.filter((visit) => visit.barberNames.length > 1);

  const busyNow = new Set(
    segments
      .filter((segment) => segment.startMin <= nowMin && nowMin < segment.endMin)
      .map((segment) => segment.barberId),
  );
  const freeNow = barbers.filter((barber) => workingBarberIds.includes(barber.id) && !busyNow.has(barber.id));

  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#e5e0d4] bg-white p-4">
          <dt className="text-xs text-bone/60">رزروهای این روز</dt>
          <dd className="mt-1 text-xl font-black tabular-nums text-bone">{activeVisits.length.toLocaleString("fa-IR")}</dd>
          <p className="mt-1 text-[11px] text-bone/50">
            {segments.length.toLocaleString("fa-IR")} خدمت · {multiBarber.length.toLocaleString("fa-IR")} نوبت چندآرایشگری
          </p>
        </div>
        <div className="rounded-2xl border border-[#e5e0d4] bg-white p-4">
          <dt className="text-xs text-bone/60">اشغال ظرفیت تیم</dt>
          <dd className="mt-1 text-xl font-black tabular-nums text-bone">{utilisation.toLocaleString("fa-IR")}٪</dd>
          <p className="mt-1 text-[11px] text-bone/50">
            {Math.round(bookedMinutes / 60).toLocaleString("fa-IR")} ساعت از{" "}
            {Math.round(capacity / 60).toLocaleString("fa-IR")} ساعت ظرفیت
          </p>
        </div>
        <div className="rounded-2xl border border-[#e5e0d4] bg-white p-4">
          <dt className="text-xs text-bone/60">نیازمند پیگیری پرداخت</dt>
          <dd className="mt-1 text-xl font-black tabular-nums text-[#6b5213]">
            {pendingPayment.length.toLocaleString("fa-IR")}
          </dd>
          <p className="mt-1 text-[11px] text-bone/50">نوبت‌های در انتظار تأیید پرداخت</p>
        </div>
        <div className="rounded-2xl border border-[#e5e0d4] bg-white p-4">
          <dt className="text-xs text-bone/60">{isToday ? "آزاد در همین ساعت" : "آرایشگران شیفت"}</dt>
          <dd className="mt-1 text-xl font-black tabular-nums text-[#0f5a3b]">
            {(isToday ? freeNow.length : workingBarberIds.length).toLocaleString("fa-IR")}
          </dd>
          <p className="mt-1 truncate text-[11px] text-bone/50">
            {isToday
              ? freeNow.map((barber) => barber.name).join("، ") || "همه در حال کار"
              : barbers
                  .filter((barber) => workingBarberIds.includes(barber.id))
                  .map((barber) => barber.name)
                  .join("، ") || "کسی شیفت نیست"}
          </p>
        </div>
      </dl>

      {activeVisits.length === 0 ? (
        <p className="rounded-2xl border border-[#e5e0d4] bg-white p-4 text-sm text-bone/50">
          برای این تاریخ رزروی ثبت نشده است.
        </p>
      ) : (
        <ul className="space-y-3">
          {activeVisits.map((visit) => {
            const status = visitStatus(visit);
            return (
              <li key={visit.key} className="rounded-2xl border border-[#e5e0d4] bg-white p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-mono text-base font-black tabular-nums text-[#0f5a3b]">
                    {minutesToLabel(visit.startMin)}–{minutesToLabel(visit.endMin)}
                  </span>
                  <span className="font-bold text-bone">{visit.clientName}</span>
                  <span dir="ltr" className="font-mono text-xs text-bone/50">
                    {visit.clientPhone}
                  </span>
                  <Badge tone={status === "COMPLETED" ? "success" : status === "PENDING" ? "warn" : "brand"}>
                    {STATUS_FA[status] ?? status}
                  </Badge>
                  {visit.barberNames.length > 1 && <Badge tone="neutral">تیم {visit.barberNames.length} نفره</Badge>}
                  <span className="ms-auto text-sm font-bold tabular-nums text-bone/70">
                    {formatPrice(visit.price)}
                  </span>
                </div>

                <ol className="mt-3 space-y-1.5">
                  {visit.segments.map((segment) => (
                    <li key={segment.id} className="flex flex-wrap items-center gap-x-3 text-sm">
                      <span className="w-[104px] font-bold tabular-nums" dir="ltr">
                        {minutesToLabel(segment.startMin)}–{minutesToLabel(segment.endMin)}
                      </span>
                      <span className="font-semibold text-bone">{segment.serviceName}</span>
                      <span className="text-xs text-bone/60">{segment.barberName}</span>
                      {segment.status !== status && (
                        <span className="text-[11px] text-bone/45">{STATUS_FA[segment.status] ?? segment.status}</span>
                      )}
                    </li>
                  ))}
                </ol>

                <details className="mt-3">
                  <summary className="focus-ring min-h-11 cursor-pointer py-2 text-xs font-bold text-[#0f5a3b]">
                    جابه‌جایی آرایشگر / زمان
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {visit.segments
                      .filter((segment) => !segment.status.startsWith("CANCELLED"))
                      .map((segment) => (
                        <li key={`move-${segment.id}`} className="rounded-xl bg-[#f6f5f1] p-3">
                          <p className="mb-2 flex items-center gap-2 text-xs font-bold text-bone">
                            <Icon name="users" className="h-4 w-4 text-[#0f5a3b]" />
                            {segment.serviceName} — {segment.barberName}
                          </p>
                          <ActionForm action={reassignAppointmentAction} submitLabel="ثبت جابه‌جایی" className="!mt-0">
                            <input type="hidden" name="appointmentId" value={segment.id} />
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label htmlFor={`move-barber-${segment.id}`} className="text-[11px] font-semibold text-bone/65">
                                  آرایشگر واجد شرایط
                                </label>
                                <select
                                  id={`move-barber-${segment.id}`}
                                  name="barberId"
                                  defaultValue={segment.barberId}
                                  className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-semibold"
                                >
                                  {barbers
                                    .filter((barber) => barber.serviceIds.includes(segment.serviceId))
                                    .map((barber) => (
                                      <option key={barber.id} value={barber.id}>
                                        {barber.name}
                                      </option>
                                    ))}
                                </select>
                              </div>
                              <Field
                                label="ساعت جدید (اختیاری، مانند 14:30)"
                                name="time"
                                dir="ltr"
                                defaultValue={minutesToLabel(segment.startMin)}
                                required={false}
                              />
                            </div>
                          </ActionForm>
                        </li>
                      ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] leading-6 text-bone/45">
        هر جابه‌جایی پیش از ثبت با موتور زمان‌بندی بررسی می‌شود: مهارت آرایشگر، ساعت کاری، مرخصی، نوبت‌های دیگر و
        هم‌پوشانی خدمات همان مشتری. {formatPersianDate(date)}
      </p>
    </div>
  );
}
