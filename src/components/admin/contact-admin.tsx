"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm } from "@/components/action-form";
import type { ActionResult } from "@/lib/actions/courses";

type Place = { id: string; title: string; description: string; lat: number; lng: number };

/**
 * Address settings with Neshan (نشان) search: type a few words, pick the right
 * place and the address + coordinates land in the form; save writes to
 * site_settings and every contact surface (dialog, embed, directions link)
 * picks it up. When NESHAN_API_KEY is missing, search hides itself and the
 * fields stay editable by hand.
 */
export function ContactAdmin({
  initial,
  action,
  neshanEnabled,
}: {
  initial: { address: string; lat: number | null; lng: number | null };
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  neshanEnabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  // results are only shown while the query is long enough — no state reset
  // needed inside the effect (which would cascade renders)
  const visibleResults = query.trim().length >= 3 ? results : null;
  const [address, setAddress] = useState(initial.address);
  const [lat, setLat] = useState(initial.lat === null ? "" : String(initial.lat));
  const [lng, setLng] = useState(initial.lng === null ? "" : String(initial.lng));
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    if (!neshanEnabled) return;
    const q = query.trim();
    if (debounce.current) window.clearTimeout(debounce.current);
    if (q.length < 3) return;
    debounce.current = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/neshan/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data: { items?: Place[]; error?: string; enabled?: boolean } = await response.json();
        if (!response.ok) throw new Error(data.error ?? "جست‌وجو ناموفق بود.");
        setResults(data.items ?? []);
      } catch (err) {
        setResults(null);
        setSearchError(err instanceof Error ? err.message : "جست‌وجو ناموفق بود.");
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [query, neshanEnabled]);

  function pick(place: Place) {
    setAddress(`${place.description ? `${place.description}، ` : ""}${place.title}`.slice(0, 240));
    setLat(place.lat.toFixed(6));
    setLng(place.lng.toFixed(6));
    setResults(null);
    setQuery("");
  }

  return (
    <div data-contact-admin="">
      {neshanEnabled ? (
        <div className="mb-4">
          <label htmlFor="neshan-q" className="text-[11px] font-semibold text-bone/65">جست‌وجوی آدرس در نشان</label>
          <input
            id="neshan-q"
            dir="rtl"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="مثلاً: خیابان ولیعصر، تهران"
            className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-medium"
          />
          {searching && <p role="status" className="mt-1 text-[11px] text-bone/55">در حال جست‌وجو…</p>}
          {searchError && <p role="alert" className="mt-1 text-[11px] font-bold text-rose-700">{searchError}</p>}
          {visibleResults && visibleResults.length > 0 && (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[#c59b4b]/25 bg-white p-1.5" aria-label="نتیجه‌های نشان">
              {visibleResults.map((place) => (
                <li key={place.id}>
                  <button type="button" onClick={() => pick(place)} className="focus-ring w-full rounded-lg px-2.5 py-2 text-right text-xs hover:bg-[#e3f0e9]">
                    <b className="block font-bold text-bone">{place.title}</b>
                    <span className="block text-[11px] leading-5 text-bone/60">{place.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {visibleResults && visibleResults.length === 0 && !searching && <p className="mt-1 text-[11px] text-bone/50">نتیجه‌ای پیدا نشد؛ عبارت دیگری را امتحان کنید.</p>}
        </div>
      ) : (
        <p className="mb-4 rounded-xl bg-[#f7f0d8] p-3 text-[11px] leading-6 text-[#6b5213]" role="status" data-neshan-off="">
          کلید وب‌سرویس نشان تنظیم نشده است (متغیر محیطی <code dir="ltr">NESHAN_API_KEY</code>)؛ جست‌وجوی آدرس غیرفعال است اما می‌توانید آدرس و مختصات را دستی وارد کنید.
        </p>
      )}
      <ActionForm action={action} submitLabel="ذخیره آدرس">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]">
          <div>
            <label htmlFor="contact-address" className="text-[11px] font-semibold text-bone/65">آدرس کامل سالن</label>
            <input id="contact-address" name="address" required value={address} onChange={(e) => setAddress(e.target.value)} className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-medium" />
          </div>
          <div>
            <label htmlFor="contact-lat" className="text-[11px] font-semibold text-bone/65">عرض جغرافیایی (lat)</label>
            <input id="contact-lat" name="lat" dir="ltr" value={lat} onChange={(e) => setLat(e.target.value)} className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-mono" placeholder="35.711" />
          </div>
          <div>
            <label htmlFor="contact-lng" className="text-[11px] font-semibold text-bone/65">طول جغرافیایی (lng)</label>
            <input id="contact-lng" name="lng" dir="ltr" value={lng} onChange={(e) => setLng(e.target.value)} className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-mono" placeholder="51.405" />
          </div>
        </div>
      </ActionForm>
      {lat !== "" && lng !== "" && (
        <a
          href={`https://neshan.org/link/place?ll=${lat},${lng}&z=17`}
          target="_blank"
          rel="noreferrer"
          className="focus-ring mt-3 inline-block rounded-full border border-[#0f5a3b]/40 bg-white px-4 py-1.5 text-[11px] font-bold text-[#0f5a3b] hover:bg-[#e3f0e9]"
        >
          پیش‌نمایش موقعیت در نشان ↗
        </a>
      )}
    </div>
  );
}
