import { minutesToLabel } from "@/lib/time";

/**
 * Live Salon — the operational timeline. Rows are staff, the horizontal axis
 * is time (right-to-left, like the rest of the product). A multi-service
 * visit is ONE bar; inside it, per-service sub-segments are visible but the
 * bar reads as a single booking (its outline, background and label carry one
 * identity — state is never communicated by color alone).
 */

export type TimelineBlock = {
  kind: "BOOKING" | "PENDING" | "HOLD" | "CLASS" | "BLOCK" | "BREAK";
  startMin: number;
  endMin: number;
  title: string;
  /** Sub-segments of one visit (service lines within a booking bar). */
  segments?: { title: string; startMin: number; endMin: number }[];
  meta?: string;
};

export type TimelineRow = {
  id: number;
  name: string;
  role: string;
  blocks: TimelineBlock[];
};

const KIND_LABEL: Record<TimelineBlock["kind"], string> = {
  BOOKING: "نوبت",
  PENDING: "در انتظار پرداخت/تأیید",
  HOLD: "نگهداری موقت",
  CLASS: "کلاس آکادمی",
  BLOCK: "بلاک/مرخصی",
  BREAK: "استراحت",
};

const KIND_STYLE: Record<TimelineBlock["kind"], string> = {
  BOOKING: "bk-tl-booking",
  PENDING: "bk-tl-pending",
  HOLD: "bk-tl-hold",
  CLASS: "bk-tl-class",
  BLOCK: "bk-tl-block",
  BREAK: "bk-tl-break",
};

export function LiveSalonTimeline({
  rows,
  gridStartMin,
  gridEndMin,
  slotMin,
  nowMin,
}: {
  rows: TimelineRow[];
  gridStartMin: number;
  gridEndMin: number;
  slotMin: number;
  /** Current minute-of-day for the now-line; null = off-hours (e.g. other day). */
  nowMin: number | null;
}) {
  const slots = Math.max(1, Math.round((gridEndMin - gridStartMin) / slotMin));
  const hourMarks: { minute: number; index: number }[] = [];
  for (let m = gridStartMin; m < gridEndMin; m += 60) {
    if (m % 60 === 0) hourMarks.push({ minute: m, index: (m - gridStartMin) / slotMin });
  }
  const pos = (minute: number) =>
    Math.max(0, Math.min(slots, (minute - gridStartMin) / slotMin));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-[10px] font-bold" role="list" aria-label="راهنمای رنگ‌ها">
        {(Object.keys(KIND_LABEL) as TimelineBlock["kind"][]).map((kind) => (
          <span key={kind} role="listitem" className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-3 w-5 rounded-[5px] ${KIND_STYLE[kind]}`} aria-hidden="true" />
            {KIND_LABEL[kind]}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          {/* hour ruler — LTR track inside the RTL page keeps time monotonic visually */}
          <div className="flex items-end gap-0 border-b border-[var(--color-border)] pb-1">
            <div className="w-32 shrink-0 text-[10px] font-bold text-[var(--color-text-muted)]">پرسنل</div>
            <div className="relative ms-2 grid flex-1" style={{ gridTemplateColumns: `repeat(${slots}, minmax(26px, 1fr))` }} dir="ltr">
              {hourMarks.map((mark) => (
                <div key={mark.minute} className="text-[10px] font-semibold text-[var(--color-text-muted)]" style={{ gridColumn: `${mark.index + 1} / span ${60 / slotMin}` }} dir="rtl">
                  {minutesToLabel(mark.minute)}
                </div>
              ))}
            </div>
          </div>

          {rows.length === 0 && (
            <p className="ui-panel mt-4 text-sm text-[var(--color-text-muted)]">برای این تاریخ کسی شیفت ندارد.</p>
          )}

          {rows.map((row) => (
            <div key={row.id} className="relative flex items-center border-b border-[var(--color-border)] py-1.5">
              <div className="w-32 shrink-0 pe-2">
                <p className="truncate text-xs font-black">{row.name}</p>
                <p className="truncate text-[10px] text-[var(--color-text-muted)]">{row.role}</p>
              </div>
              <div
                className="relative ms-2 grid h-12 flex-1 overflow-hidden rounded-[10px] bg-[var(--color-surface-sunken)]"
                style={{ gridTemplateColumns: `repeat(${slots}, minmax(26px, 1fr))` }}
                dir="ltr"
                role="grid"
                aria-label={`برنامه ${row.name}`}
              >
                {/* vertical hour guides */}
                {hourMarks.map((mark) => (
                  <div key={`g-${mark.minute}`} aria-hidden="true" className="pointer-events-none absolute inset-y-0 border-s border-[var(--color-border)]" style={{ insetInlineStart: `${((mark.index) / slots) * 100}%` }} />
                ))}
                {row.blocks.map((block, index) => {
                  const start = pos(block.startMin);
                  const end = Math.max(start + 0.5, pos(block.endMin));
                  return (
                    <div
                      key={`${block.kind}-${block.startMin}-${index}`}
                      className={`bk-tl-block ${KIND_STYLE[block.kind]}`}
                      style={{ gridColumn: `${Math.floor(start) + 1} / span ${Math.max(1, Math.round(end - start))}` }}
                      title={`${block.title} · ${minutesToLabel(block.startMin)}–${minutesToLabel(block.endMin)}`}
                    >
                      <p className="truncate text-[10px] font-black leading-tight">{block.title}</p>
                      {block.segments ? (
                        <div className="mt-0.5 flex min-w-0 gap-0.5" aria-hidden="true">
                          {block.segments.map((segment, si) => (
                            <span
                              key={si}
                              className="h-1.5 rounded-full bg-black/15 ring-1 ring-white/40"
                              style={{ flex: Math.max(1, segment.endMin - segment.startMin) }}
                              title={`${segment.title} ${minutesToLabel(segment.startMin)}–${minutesToLabel(segment.endMin)}`}
                            />
                          ))}
                        </div>
                      ) : null}
                      {block.meta && <p className="truncate text-[9px] leading-tight opacity-80">{block.meta}</p>}
                    </div>
                  );
                })}
                {nowMin !== null && nowMin >= gridStartMin && nowMin <= gridEndMin && (
                  <div
                    aria-label="هم‌اکنون"
                    className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-[var(--color-danger)]"
                    style={{ insetInlineStart: `${((nowMin - gridStartMin) / (gridEndMin - gridStartMin)) * 100}%` }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
