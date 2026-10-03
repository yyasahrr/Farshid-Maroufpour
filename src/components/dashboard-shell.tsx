import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { ToastProvider } from "@/components/toast";
import { BrandMonogram } from "@/components/icons";

export function DashboardShell({
  title,
  subtitle,
  sections,
  children,
}: {
  title: string;
  subtitle: string;
  sections: { id: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#fdfcf9] text-bone">
        <header className="glass-floating sticky top-0 z-30 border-b border-[#c59b4b]/20">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Link
                href="/home"
                className="focus-ring flex items-center gap-2 rounded text-sm font-black tracking-[0.3em] text-[#0f5a3b]"
              >
                <BrandMonogram className="!h-7 !w-[21px]" />
                FARSHID
              </Link>
              <span className="text-xs font-semibold text-[#855e16] bg-[#c59b4b]/15 px-2.5 py-0.5 rounded-full">
                {subtitle}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/home"
                className="focus-ring rounded-full border border-[#0f5a3b]/25 bg-white px-3.5 py-1 text-xs font-semibold text-[#0f5a3b] hover:border-[#c59b4b]"
              >
                مشاهده وبسایت
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="focus-ring rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  خروج
                </button>
              </form>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
          <nav
            aria-label="بخش‌های داشبورد"
            className="hidden w-44 shrink-0 lg:block"
          >
            <div className="flex items-center gap-1.5 mb-3">
              <span className="h-2 w-2 rounded-full bg-[#c59b4b]" />
              <p className="text-xs font-bold tracking-[0.2em] text-[#0f5a3b]">
                {title}
              </p>
            </div>
            <ul className="sticky top-24 space-y-1 text-xs font-semibold">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="focus-ring block rounded-xl px-3 py-2 text-bone/70 transition hover:bg-[#0f5a3b]/10 hover:text-[#0f5a3b]"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0 flex-1 space-y-10 pb-24 lg:pb-8">
            {children}
          </div>
        </div>

        <nav
          aria-label="ناوبری موبایل"
          className="glass-floating safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[#c59b4b]/20 lg:hidden"
        >
          <ul className="flex justify-around py-2 text-[11px] font-bold">
            {sections.slice(0, 4).map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="focus-ring block rounded px-3 py-2 text-bone/70 hover:text-[#0f5a3b]"
                >
                  {s.label}
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
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="glass-card scroll-mt-20 rounded-3xl p-5 md:p-7 border border-[#c59b4b]/25 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-4 rounded-full bg-[#c59b4b]" />
        <h2 className="text-lg font-black text-bone">{title}</h2>
      </div>
      {description && (
        <p className="mt-1 text-xs text-bone/55">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}
