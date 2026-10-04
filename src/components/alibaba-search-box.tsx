"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { addDaysISO, formatPersianDate, formatPrice, todayISO } from "@/lib/time";

export type SearchBoxService = {
  id: number;
  slug: string;
  name: string;
  durationMin: number;
  basePrice: number;
};

export type SearchBoxBarber = {
  id: number;
  slug: string;
  name: string;
  title: string;
};

const TABS = [
  { id: "haircut", label: "اصلاح و استایل مو", icon: "✂️", defaultSlug: "haircut" },
  { id: "beard", label: "طراحی و خط ریش", icon: "🪒", defaultSlug: "beard" },
  { id: "combo", label: "پکیج کامل VIP", icon: "⭐", defaultSlug: "combo" },
  { id: "academy", label: "دوره‌های آکادمی", icon: "🎓", href: "/academy" },
];

const WINDOWS = [
  { id: "ALL", label: "همه ساعات" },
  { id: "morning", label: "صبح (۱۰ تا ۱۲)" },
  { id: "noon", label: "ظهر (۱۲ تا ۱۵)" },
  { id: "evening", label: "عصر (۱۵ تا ۱۹)" },
  { id: "night", label: "شب (۱۹ تا ۲۲)" },
];

export function AlibabaSearchBox({
  services,
  barbers,
  initialServiceId,
  initialBarberId,
  initialDate,
}: {
  services: SearchBoxService[];
  barbers: SearchBoxBarber[];
  initialServiceId?: number;
  initialBarberId?: number;
  initialDate?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("haircut");
  const [selectedServiceId, setSelectedServiceId] = useState<number>(
    initialServiceId ?? services[0]?.id ?? 1,
  );
  const [selectedBarberId, setSelectedBarberId] = useState<number | "ANY">(
    initialBarberId ?? "ANY",
  );
  const [selectedDate, setSelectedDate] = useState<string>(initialDate ?? todayISO());
  const [selectedWindow, setSelectedWindow] = useState<string>("ALL");

  const dates = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i)),
    [],
  );

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const selectedBarber = barbers.find((b) => b.id === selectedBarberId);

  function handleTabClick(tab: (typeof TABS)[number]) {
    if (tab.href) {
      router.push(tab.href);
      return;
    }
    setActiveTab(tab.id);
    const target = services.find((s) => s.slug === tab.defaultSlug);
    if (target) {
      setSelectedServiceId(target.id);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (selectedServiceId) params.set("service", String(selectedServiceId));
    if (selectedBarberId !== "ANY") params.set("barber", String(selectedBarberId));
    if (selectedDate) params.set("date", selectedDate);
    if (selectedWindow !== "ALL") params.set("window", selectedWindow);
    router.push(`/booking?${params.toString()}`);
  }

  return (
    <div className="w-full">
      {/* Alibaba-style Tab bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 hide-scrollbar" role="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={`focus-ring shrink-0 flex items-center gap-2 rounded-t-2xl px-5 py-3 text-xs font-bold transition-colors duration-200 border-t-2 ${
                isActive
                  ? "bg-white text-brand-700 border-brand-700 shadow-[0_-4px_16px_rgba(15,90,59,0.08)] ring-1 ring-brass-400/20"
                  : "bg-white/60 text-bone/60 border-transparent hover:bg-white/90 hover:text-bone"
              }`}
            >
              <span className="text-sm">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Alibaba-style Segmented Search & Booking Box */}
      <form
        onSubmit={handleSearch}
        className="rounded-3xl rounded-tr-none bg-white p-4 shadow-[0_20px_50px_-15px_rgba(15,90,59,0.18)] border-2 border-brass-400/30"
      >
        <div className="grid grid-cols-1 divide-y divide-brass-400/15 sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:divide-x-reverse lg:grid-cols-12">
          {/* Section 1: Service */}
          <div className="lg:col-span-3 p-3 transition hover:bg-bone-50 rounded-2xl">
            <label htmlFor="search-service" className="block text-[11px] font-bold text-bone/50">
              خدمت مورد نظر
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-base text-brand-700">✂️</span>
              <select
                id="search-service"
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(Number(e.target.value))}
                className="w-full bg-transparent text-sm font-bold text-bone outline-none cursor-pointer"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMin} دقیقه - {formatPrice(s.basePrice)})
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[10px] text-brass-600 font-semibold truncate">
              {selectedService ? `${selectedService.durationMin} دقیقه مشاوره و اجرا` : "انتخاب خدمت"}
            </p>
          </div>

          {/* Section 2: Barber */}
          <div className="lg:col-span-3 p-3 transition hover:bg-bone-50 rounded-2xl">
            <label htmlFor="search-barber" className="block text-[11px] font-bold text-bone/50">
              مسترباربر
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-base text-brass-700">👤</span>
              <select
                id="search-barber"
                value={selectedBarberId}
                onChange={(e) =>
                  setSelectedBarberId(e.target.value === "ANY" ? "ANY" : Number(e.target.value))
                }
                className="w-full bg-transparent text-sm font-bold text-bone outline-none cursor-pointer"
              >
                <option value="ANY">⚡ هر آرایشگری (سریع‌ترین نوبت آزاد)</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.title}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[10px] text-brand-700 font-semibold truncate">
              {selectedBarber ? selectedBarber.title : "پیشنهاد خودکار اولین صندلی خالی"}
            </p>
          </div>

          {/* Section 3: Date */}
          <div className="lg:col-span-3 p-3 transition hover:bg-bone-50 rounded-2xl">
            <label htmlFor="search-date" className="block text-[11px] font-bold text-bone/50">
              تاریخ حضور
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-base text-brand-700">📅</span>
              <select
                id="search-date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-transparent text-sm font-bold text-bone outline-none cursor-pointer"
              >
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatPersianDate(d)}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[10px] text-bone/50">
              {selectedDate === todayISO() ? "امروز (نوبت فوری)" : "رزرو برنامه‌ریزی‌شده"}
            </p>
          </div>

          {/* Section 4: Time Window */}
          <div className="lg:col-span-3 p-3 flex flex-col justify-between transition hover:bg-bone-50 rounded-2xl">
            <div>
              <label htmlFor="search-window" className="block text-[11px] font-bold text-bone/50">
                بازه زمانی روز
              </label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-base text-brass-700">🕒</span>
                <select
                  id="search-window"
                  value={selectedWindow}
                  onChange={(e) => setSelectedWindow(e.target.value)}
                  className="w-full bg-transparent text-xs font-bold text-bone outline-none cursor-pointer"
                >
                  {WINDOWS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button Row */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-brass-400/15 pt-3">
          <div className="flex items-center gap-4 text-xs text-bone/60">
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              استرداد آنلاین بیعانه تا ۲۴ ساعت قبل
            </span>
            <span className="hidden sm:flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              تضمین نوبت سر ساعت بدون معطلی
            </span>
          </div>

          <button
            type="submit"
            className="focus-ring flex items-center justify-center gap-2 rounded-2xl bg-brand-700 px-8 py-3.5 text-sm font-black text-white shadow-md transition hover:bg-[#094028] hover:shadow-[0_10px_24px_rgba(197,155,75,0.5)] w-full sm:w-auto"
          >
            <span>جستجوی نوبت‌های آزاد</span>
            <span aria-hidden="true" className="text-base font-normal">🔍</span>
          </button>
        </div>
      </form>
    </div>
  );
}
