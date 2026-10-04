import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="ui-section-head"><div>{eyebrow && <p className="mb-1 text-sm font-semibold text-brass-800">{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>;
}

export function StatCard({ label, value, hint, trend }: { label: string; value: string | number; hint?: string; trend?: string }) {
  return <dl className="ui-card min-w-0 p-4 sm:p-5"><dt className="text-sm font-semibold text-bone-500">{label}</dt><dd className="mt-2 break-words text-[clamp(21px,2vw,29px)] font-black tabular-nums text-bone-700">{value}</dd>{(hint || trend) && <dd className="mt-1 text-xs text-bone-500">{trend && <span className="font-bold text-brand-400">{trend} </span>}{hint}</dd>}</dl>;
}

export function SkeletonCard({ lines = 3, media = true }: { lines?: number; media?: boolean }) {
  return <div className="ui-card p-4" aria-hidden="true">{media && <div className="skeleton mb-5 h-32 rounded-xl" />}<div className="skeleton h-5 w-2/3 rounded-md" />{Array.from({ length: lines }, (_, index) => <div key={index} className="skeleton mt-3 h-3 rounded-md" />)}</div>;
}
export function SkeletonGrid({ count = 3, media = true }: { count?: number; media?: boolean }) {
  return <div role="status" aria-label="در حال بارگذاری" className="grid gap-4 md:grid-cols-3">{Array.from({ length: count }, (_, index) => <SkeletonCard key={index} media={media} />)}</div>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div role="status" className="ui-panel text-center"><h3 className="text-lg font-bold">{title}</h3>{description && <p className="mt-2 text-sm leading-7 text-bone-500">{description}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warn" | "danger" | "brand" }) {
  const styles = { neutral: "bg-[#eef0ed] text-brass-800", success: "bg-[#e4ece3] text-brand-400", warn: "bg-brass-50 text-brass-700", danger: "bg-rose-50 text-rose-700", brand: "bg-[#e2efe8] text-brand-400" };
  return <span className={`ui-pill ${styles[tone]}`}>{children}</span>;
}
export function Stars({ rating }: { rating: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return <span aria-label={`امتیاز ${rating.toLocaleString("fa-IR")} از ۵`} className="text-brass-800">{"★".repeat(rounded)}<span className="text-[#ced0cc]">{"★".repeat(5 - rounded)}</span></span>;
}
