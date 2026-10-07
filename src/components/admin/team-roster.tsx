"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TEAM_ROLE_LABELS_FA, teamRoleTone } from "@/lib/team";
import type { Role } from "@/lib/rbac";

export type TeamRosterMember = {
  userId: number;
  name: string;
  phone: string;
  roles: Role[];
  barber: null | { slug: string; name: string; title: string; imageUrl: string; active: boolean };
};

const FILTERS: { id: "ALL" | Role; label: string }[] = [
  { id: "ALL", label: "همه" },
  { id: "BARBER", label: "آرایشگران" },
  { id: "INSTRUCTOR", label: "مدرس‌ها" },
  { id: "MANAGER", label: "مدیریت" },
];

export function TeamRoster({ members, canManage }: { members: TeamRosterMember[]; canManage: boolean }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("ALL");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return members.filter((member) => {
      const matchesRole = filter === "ALL" || member.roles.includes(filter);
      const matchesQuery = !needle || `${member.name} ${member.phone}`.toLocaleLowerCase().includes(needle);
      return matchesRole && matchesQuery;
    });
  }, [filter, members, query]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <label htmlFor="team-search" className="ops-label">جست‌وجوی نام یا شماره موبایل</label>
          <input id="team-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً فرشید یا 0912…" className="ops-field mt-1 w-full" />
        </div>
        <div role="group" aria-label="فیلتر اعضای تیم" className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`focus-ring min-h-11 shrink-0 rounded-full border px-4 text-xs font-bold ${filter === item.id ? "border-[#0f5a3b] bg-[#e3f0e9] text-[#0f5a3b]" : "border-[#c59b4b]/30 bg-white text-bone/70"}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length ? (
        <ul className="mt-4 grid gap-3 xl:grid-cols-2">
          {visible.map((member) => (
            <li key={member.userId} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-4 sm:flex-row sm:items-center">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[#e2efe8]">
                {member.barber?.imageUrl ? (
                  <Image src={member.barber.imageUrl} alt="" fill sizes="64px" className="object-cover" unoptimized={!member.barber.imageUrl.startsWith("/")} />
                ) : (
                  <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-2xl font-black text-[#0f5a3b]">{member.name.slice(0, 1)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-black">{member.name}</h3>
                <p className="mt-0.5 text-sm text-bone/65">{member.barber?.title ?? "عضو تیم"}</p>
                <p dir="ltr" className="mt-1 text-start text-xs tabular-nums text-bone/55">{member.phone}</p>
                <ul aria-label={`نقش‌های ${member.name}`} className="mt-2 flex flex-wrap gap-1.5">
                  {member.roles.map((role) => {
                    const tone = teamRoleTone(role);
                    const classes = tone === "ok" ? "ops-chip ops-chip-ok" : tone === "wait" ? "ops-chip ops-chip-wait" : "ops-chip ops-chip-mute";
                    return <li key={role} className={classes}>{TEAM_ROLE_LABELS_FA[role] ?? role}</li>;
                  })}
                  {!member.roles.length && <li className="ops-chip ops-chip-mute">بدون نقش تیمی</li>}
                </ul>
                {member.barber && (
                  <p className="mt-2 text-xs font-semibold">
                    <span className={member.barber.active ? "ops-chip ops-chip-ok" : "ops-chip ops-chip-mute"}>
                      پروفایل عمومی: {member.barber.active ? "فعال" : "غیرفعال"}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 sm:max-w-[160px] sm:flex-col">
                {canManage && <Link href={`/admin/team/${member.userId}`} className="ops-btn min-h-11 justify-center">مدیریت عضو</Link>}
                {member.barber?.active && <Link href={`/barbers/${member.barber.slug}`} target="_blank" rel="noreferrer" className="ops-btn ops-btn-quiet min-h-11 justify-center">پروفایل عمومی ↗</Link>}
                {canManage && member.barber && <Link href={`/admin/team/${member.userId}#schedule`} className="ops-link min-h-11 px-2 text-center">برنامهٔ کاری</Link>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ops-empty mt-4">عضوی با این مشخصات پیدا نشد.<span className="ops-meta">فیلتر را پاک کنید یا نقش دیگری را ببینید.</span></p>
      )}
    </div>
  );
}
