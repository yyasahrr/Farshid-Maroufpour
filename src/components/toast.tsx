"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error" | "warning" | "info";

type ToastItem = { id: number; title: string; tone: ToastTone };

const ToastContext = createContext<{ push: (title: string, tone?: ToastTone) => void } | null>(
  null,
);

const TONE_STYLE: Record<ToastTone, { border: string; icon: string; iconColor: string }> = {
  success: { border: "border-emerald-400/40", icon: "✓", iconColor: "text-emerald-300" },
  error: { border: "border-rose-400/40", icon: "!", iconColor: "text-rose-300" },
  warning: { border: "border-amber-400/40", icon: "▲", iconColor: "text-amber-300" },
  info: { border: "border-white/15", icon: "i", iconColor: "text-bone/70" },
};

const TONE_LABEL: Record<ToastTone, string> = {
  success: "موفق",
  error: "خطا",
  warning: "هشدار",
  info: "اطلاع",
};

/** Toast queue: max 3 visible, auto-dismiss, aria-live for screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((title: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, title, tone }].slice(-3));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-6 sm:items-start sm:px-0"
      >
        {items.map((t) => {
          const style = TONE_STYLE[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={`toast-item glass-floating pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border ${style.border} p-4`}
            >
              <span aria-hidden="true" className={`mt-0.5 text-sm font-bold ${style.iconColor}`}>
                {style.icon}
              </span>
              <div className="flex-1 text-sm">
                <p className="text-[10px] tracking-widest text-bone/40">{TONE_LABEL[t.tone]}</p>
                <p className="mt-0.5 leading-6">{t.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                aria-label="بستن اعلان"
                className="focus-ring rounded p-1 text-xs text-bone/40 hover:text-bone"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
