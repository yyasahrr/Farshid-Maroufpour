"use client";

import { useOptimistic, useTransition } from "react";
import { markAllNotificationsReadAction } from "@/lib/actions/salon";

export type NotificationItem = {
  id: number;
  kind: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

const KIND_FA: Record<string, string> = {
  NEW_BOOKING: "نوبت جدید",
  BOOKING_CANCELLED: "لغو نوبت",
  BOOKING_RESCHEDULED: "تغییر نوبت",
  PAYMENT_RECEIVED: "پرداخت",
  NEW_REVIEW: "نظر جدید",
  COURSE_PURCHASE: "خرید دوره",
  WORKSHOP_REGISTRATION: "ثبت‌نام ورکشاپ",
};

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const [optimistic, setOptimistic] = useOptimistic(items);
  const [pending, startTransition] = useTransition();
  const unread = optimistic.filter((n) => !n.isRead).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-bone/65">
          {unread > 0 ? (
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#c59b4b] opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0f5a3b]" />
              </span>
              <span className="text-[#0f5a3b] font-bold">{unread} اعلان خوانده‌نشده</span>
            </span>
          ) : (
            "تمام اعلان‌ها بررسی شده است"
          )}
        </p>
        {unread > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setOptimistic(optimistic.map((n) => ({ ...n, isRead: true })));
                await markAllNotificationsReadAction();
              })
            }
            className="focus-ring rounded-full border border-[#c59b4b]/40 bg-white px-3 py-1 text-[11px] font-bold text-[#855e16] hover:bg-[#c59b4b]/15 disabled:opacity-50"
          >
            {pending ? "…" : "خواندن همه"}
          </button>
        )}
      </div>

      {optimistic.length === 0 ? (
        <p className="mt-4 text-sm text-bone/45">اعلانی در سامانه ثبت نشده است.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[#c59b4b]/15 rounded-2xl border border-[#c59b4b]/20 bg-white/70 p-2">
          {optimistic.map((n) => (
            <li key={n.id} className="flex items-start gap-3 p-3 transition hover:bg-white/80 rounded-xl">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  n.isRead ? "bg-bone/20" : "bg-[#c59b4b]"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-bone">
                  {n.title}
                  <span className="rounded-full bg-[#0f5a3b]/10 border border-[#0f5a3b]/25 px-2 py-0.5 text-[10px] font-semibold text-[#0f5a3b]">
                    {KIND_FA[n.kind] ?? n.kind}
                  </span>
                </p>
                {n.body && <p className="mt-1 text-xs leading-5 text-bone/65">{n.body}</p>}
              </div>
              <span className="shrink-0 text-[10px] text-bone/45 font-mono">{n.createdAt}</span>
              <span className="sr-only">{n.isRead ? "خوانده شده" : "خوانده‌نشده"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
