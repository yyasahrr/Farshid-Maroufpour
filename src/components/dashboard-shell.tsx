import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { ToastProvider } from "@/components/toast";
import { BrandMonogram } from "@/components/icons";

/**
 * Operations shell (admin / staff). v2 «اتاق فرمانِ امروز»:
 * the page leads with TODAY — nav groups sections by the job being done,
 * not by table inventory. Panels share one header rhythm; a count badge means
 * "items here need action", never decoration.
 */
export type OpsSection = { id: string; label: string; group?: string; count?: number };

export function DashboardShell({
  title,
  subtitle,
  sections,
  children,
}: {
  title: string;
  subtitle: string;
  sections: OpsSection[];
  children: ReactNode;
}) {
  const groups: { name: string | null; items: OpsSection[] }[] = [];
  for (const s of sections) {
    const name = s.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(s);
    else groups.push({ name, items: [s] });
  }

  return (
    <ToastProvider>
      <div className="theme-ops min-h-screen text-bone">
        <header className="ops-panel glass-floating sticky top-0 z-30 !rounded-none !border-x-0 !border-t-0 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1360px] items-center justify-between gap-4 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/home" className="focus-ring flex shrink-0 items-center gap-2 rounded text-sm font-extrabold text-[var(--color-text-primary)]">
                <BrandMonogram className="!h-7 !w-[21px]" />
                <span className="hidden sm:inline">Farshid</span>
              </Link>
              <span className="ops-meta truncate">
                {title} · <span className="text-[var(--color-text-secondary)]">{subtitle}</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/home" className="focus-ring ops-btn ops-btn-quiet !py-1.5">
                مشاهده وبسایت
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="focus-ring ops-btn ops-btn-danger !py-1.5">
                  خروج
                </button>
              </form>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-[1360px] gap-7 px-4 py-6">
          <nav aria-label="بخش‌های داشبورد" className="ops-nav hidden w-52 shrink-0 lg:block">
            <div className="sticky top-20">
              {groups.map((g) => (
                <div key={g.name ?? "_"}>
                  {g.name && <p className="ops-group-label">{g.name}</p>}
                  <ul>
                    {g.items.map((s) => (
                      <li key={s.id}>
                        <a href={`#${s.id}`}>
                          <span className="min-w-0 truncate">{s.label}</span>
                          {!!s.count && s.count > 0 && <span className="ops-count">{s.count.toLocaleString("fa-IR")}</span>}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <main className="min-w-0 flex-1 space-y-6 pb-24 lg:pb-8">{children}</main>
        </div>

        <nav
          aria-label="ناوبری موبایل"
          className="ops-panel glass-floating safe-bottom fixed inset-x-0 bottom-0 z-30 lg:hidden !rounded-none !border-x-0 !border-b-0"
        >
          <ul className="flex gap-1.5 overflow-x-auto px-3 py-2 text-[12px] font-bold [-webkit-overflow-scrolling:touch]">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0">
                <a href={`#${s.id}`} className="focus-ring block rounded-full border border-[var(--color-border)] px-3.5 py-1.5 whitespace-nowrap text-[var(--color-text-secondary)]">
                  {s.label}
                  {!!s.count && s.count > 0 ? ` (${s.count.toLocaleString("fa-IR")})` : ""}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </ToastProvider>
  );
}

export function Panel({
  id,
  title,
  description,
  count,
  actions,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  /** Number of items here that need action; renders a warn chip. */
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="ops-panel">
      <div className="ops-panel-head">
        <h2 className="flex items-center gap-2.5">
          {title}
          {!!count && count > 0 && (
            <span className="ops-chip ops-chip-wait">{`${count.toLocaleString("fa-IR")} در انتظار اقدام`}</span>
          )}
        </h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="ops-panel-desc">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
