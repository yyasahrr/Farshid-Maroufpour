import { toggleBarberServiceAction } from "@/lib/actions/salon";

/**
 * Capability matrix: which barber may perform which service.
 *
 * The matrix shows the same rule the planner enforces — an approved skill for
 * the service (when one is required) plus an explicit barber↔service link — so
 * a checkmark here means the planner will really offer that combination. A row
 * that is linked but missing the required skill is marked instead of silently
 * counted as capable.
 */

export type MatrixBarber = { id: number; name: string; approvedSkillIds: number[] };
export type MatrixService = { id: number; name: string; requiredSkillId: number | null };
export type MatrixLink = { barberId: number; serviceId: number };

export function SkillMatrix({
  barbers,
  services,
  links,
  canEdit,
}: {
  barbers: MatrixBarber[];
  services: MatrixService[];
  links: MatrixLink[];
  canEdit: boolean;
}) {
  if (barbers.length === 0 || services.length === 0)
    return <p className="text-sm text-bone/50">برای ساخت ماتریس، به آرایشگر و خدمت فعال نیاز است.</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#e5e0d4] bg-white p-2">
      <table className="w-full min-w-[520px] text-right text-sm">
        <caption className="sr-only">ماتریس مهارت آرایشگران و خدمات</caption>
        <thead className="text-xs text-bone/55">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-bold">
              خدمت
            </th>
            {barbers.map((barber) => (
              <th key={barber.id} scope="col" className="px-3 py-2.5 text-center font-bold">
                {barber.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5e0d4]">
          {services.map((service) => (
            <tr key={service.id}>
              <th scope="row" className="px-3 py-3 text-right font-semibold text-bone">
                {service.name}
              </th>
              {barbers.map((barber) => {
                const linked = links.some((link) => link.barberId === barber.id && link.serviceId === service.id);
                const skillOk = !service.requiredSkillId || barber.approvedSkillIds.includes(service.requiredSkillId);
                const capable = linked && skillOk;
                return (
                  <td key={barber.id} className="px-3 py-3 text-center">
                    {canEdit ? (
                      <form action={toggleBarberServiceAction} className="inline-flex">
                        <input type="hidden" name="barberId" value={barber.id} />
                        <input type="hidden" name="serviceId" value={service.id} />
                        <button
                          type="submit"
                          aria-label={`${capable ? "غیرفعال‌کردن" : "فعال‌کردن"} ${service.name} برای ${barber.name}`}
                          className={`focus-ring min-h-11 min-w-11 rounded-xl text-base font-black ${
                            capable
                              ? "bg-[#e3f0e9] text-[#14432f]"
                              : linked
                                ? "bg-[#f7f0d8] text-[#6b5213]"
                                : "border border-[#e5e0d4] text-bone/35"
                          }`}
                        >
                          {capable ? "✓" : linked ? "!" : "–"}
                        </button>
                      </form>
                    ) : (
                      <span aria-label={capable ? "واجد شرایط" : "واجد شرایط نیست"} className="text-base font-black">
                        {capable ? "✓" : linked ? "!" : "–"}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] leading-6 text-bone/50">
        ✓ ارائه‌دهنده با مهارت تأییدشده · ! خدمت اختصاص داده شده اما مهارت لازم تأیید نشده (در زمان‌بندی شرکت نمی‌کند) · –
        ارائه نمی‌دهد. تنها ردیف‌های ✓ در پیشنهادهای رزرو مشتری دیده می‌شوند.
      </p>
    </div>
  );
}
