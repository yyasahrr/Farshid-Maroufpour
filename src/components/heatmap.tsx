import type { Slot } from "@/lib/availability";
import { formatPersianDate, minutesToLabel } from "@/lib/time";

const STATE_STYLE: Record<Slot["state"], string> = {
  AVAILABLE: "bg-[#0f5a3b] text-white shadow-xs font-bold",
  BOOKED: "bg-[#c59b4b]/20 border border-[#c59b4b]/40 text-[#855e16]",
  CLOSED: "bg-white/60 border border-[#c59b4b]/15 text-bone/35",
};

const STATE_MARK: Record<Slot["state"], string> = {
  AVAILABLE: "✓",
  BOOKED: "×",
  CLOSED: "—",
};

export function AvailabilityHeatmap({
  days,
  showLegend = true,
}: {
  days: { date: string; slots: Slot[] }[];
  showLegend?: boolean;
}) {
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-[#c59b4b]/20 bg-white/70 p-3">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-[10px]">
          <caption className="sr-only">نقشه زمان‌های آزاد آرایشگر در هفت روز آینده</caption>
          <thead>
            <tr>
              <th scope="col" className="w-24 text-right text-bone/50 font-bold">
                روز
              </th>
              {days[0]?.slots.map((s) => (
                <th key={s.startMin} scope="col" className="font-mono text-bone/50 font-semibold">
                  {s.startMin % 60 === 0 ? minutesToLabel(s.startMin).slice(0, 2) : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <th scope="row" className="ps-2 text-start text-[11px] font-bold text-bone/70">
                  {formatPersianDate(d.date).split("،")[0]}
                </th>
                {d.slots.map((s) => (
                  <td key={s.startMin}>
                    <span
                      title={`${minutesToLabel(s.startMin)} — ${s.label}`}
                      className={`flex h-6 w-full items-center justify-center rounded-md ${STATE_STYLE[s.state]}`}
                    >
                      <span aria-hidden="true">{STATE_MARK[s.state]}</span>
                      <span className="sr-only">{`${minutesToLabel(s.startMin)} ${s.label}`}</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showLegend && (
        <ul className="mt-4 flex flex-wrap gap-5 text-xs text-bone/65">
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[#0f5a3b] text-white font-bold text-[10px]">
              ✓
            </span>
            آزاد برای رزرو
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-[#c59b4b]/40 bg-[#c59b4b]/20 text-[#855e16] font-bold text-[10px]">
              ×
            </span>
            رزرو شده
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-[#c59b4b]/15 bg-white/60 text-bone/35 text-[10px]">
              —
            </span>
            تعطیل / مسدود
          </li>
        </ul>
      )}
    </div>
  );
}
