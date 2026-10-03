import type { ReactNode } from "react";

export type ProgressStep = {
  label: string;
  state: "done" | "active" | "upcoming" | "locked";
  hint?: string;
};

const DOT: Record<ProgressStep["state"], { style: string; mark: string; label: string }> = {
  done: { style: "border-gold bg-gold text-ink", mark: "✓", label: "تکمیل شده" },
  active: { style: "border-gold bg-gold/20 text-gold", mark: "●", label: "در حال انجام" },
  upcoming: { style: "border-white/20 text-bone/50", mark: "○", label: "پیش‌رو" },
  locked: { style: "border-white/10 text-bone/25", mark: "🔒", label: "قفل" },
};

/** Horizontal timeline of a student's path through a course. */
export function CourseProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    <div>
      <div className="hide-scrollbar overflow-x-auto pb-2">
        <ol className="flex min-w-max items-start gap-2">
          {steps.map((step, i) => {
            const dot = DOT[step.state];
            return (
              <li key={step.label} className="flex items-start gap-2">
                <div className="flex w-24 flex-col items-center text-center">
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold ${dot.style}`}
                  >
                    {dot.mark}
                  </span>
                  <p
                    className={`mt-2 text-[11px] font-bold ${
                      step.state === "active"
                        ? "text-gold"
                        : step.state === "locked"
                          ? "text-bone/30"
                          : "text-bone/70"
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.hint && <p className="text-[10px] text-bone/40">{step.hint}</p>}
                  <span className="sr-only">{dot.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`mt-4 h-px w-8 ${
                      step.state === "done" ? "bg-gold/60" : "bg-white/12"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: ReactNode }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-bone/55">{label}</span>
        <span className="font-bold text-gold">{clamped}٪</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === "string" ? label : "پیشرفت دوره"}
        className="mt-2 h-2 overflow-hidden rounded-full bg-white/8"
      >
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
