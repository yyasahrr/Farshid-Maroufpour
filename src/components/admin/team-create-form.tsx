"use client";

import { useActionState, useState } from "react";
import type { Role } from "@/lib/rbac";
import { MANAGER_ASSIGNABLE_ROLES } from "@/lib/team";
import { createTeamMemberAction, type TeamActionResult } from "@/lib/actions/team";

const ROLE_OPTIONS: { role: Role; label: string; detail: string }[] = [
  { role: "CLIENT", label: "مشتری", detail: "رزرو شخصی با همین حساب" },
  { role: "TRAINEE", label: "هنرجو", detail: "دسترسی به دوره‌های آکادمی" },
  { role: "BARBER", label: "آرایشگر", detail: "پروفایل و برنامهٔ رزرو" },
  { role: "INSTRUCTOR", label: "مدرس", detail: "اتصال به دوره‌های آکادمی" },
  { role: "RECEPTIONIST", label: "پذیرش", detail: "عملیات روزانه و مشتریان" },
  { role: "MANAGER", label: "مدیر", detail: "مدیریت تیم و عملیات" },
  { role: "FINANCE", label: "مالی", detail: "گزارش‌ها و پرداخت‌ها" },
  { role: "SUPER_ADMIN", label: "مالک / مدیر ارشد", detail: "دسترسی کامل سامانه" },
];

export function TeamCreateForm({ canAssignPrivilegedRoles }: { canAssignPrivilegedRoles: boolean }) {
  const [state, formAction, pending] = useActionState<TeamActionResult | null, FormData>(createTeamMemberAction, null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [publishProfile, setPublishProfile] = useState(false);
  const [error, setError] = useState("");


  const canCreate = name.trim().length >= 2 && /^09\d{9}$/.test(phone.trim());
  const roleOptions = ROLE_OPTIONS.filter((item) => canAssignPrivilegedRoles || MANAGER_ASSIGNABLE_ROLES.includes(item.role));
  const hasBarberProfile = selectedRoles.includes("BARBER");

  function toggleRole(role: Role) {
    setSelectedRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
    setError("");
  }

  function continueFromRoles() {
    if (!selectedRoles.length) {
      setError("حداقل یک نقش انتخاب کنید.");
      return;
    }
    setError("");
    setStep(hasBarberProfile ? 3 : 4);
  }

  return (
    <form action={formAction} className="space-y-5">
      <ol aria-label="مراحل افزودن عضو تیم" className="flex flex-wrap items-center gap-2 text-xs font-bold">
        {["اطلاعات پایه", "نقش‌ها", ...(hasBarberProfile ? ["پروفایل آرایشگر"] : [])].map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={`rounded-full border px-3 py-2 ${step === index + 1 ? "border-[#0f5a3b] bg-[#e3f0e9] text-[#0f5a3b]" : "border-[#c59b4b]/30 bg-white text-bone/60"}`}>
            <span className="me-1 tabular-nums">{(index + 1).toLocaleString("fa-IR")}</span>{label}
          </li>
        ))}
      </ol>

      <fieldset hidden={step !== 1} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="staff-name" className="ops-label">نام و نام خانوادگی</label>
          <input id="staff-name" name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" className="ops-field mt-1 w-full" />
        </div>
        <div>
          <label htmlFor="staff-phone" className="ops-label">شماره موبایل</label>
          <input id="staff-phone" name="phone" type="tel" inputMode="numeric" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} required pattern="09\d{9}" maxLength={11} autoComplete="tel" placeholder="09123456789" className="ops-field mt-1 w-full" />
        </div>
        <p className="text-xs leading-6 text-bone/60 sm:col-span-2">اگر این شماره از قبل حساب داشته باشد، همان حساب به تیم متصل می‌شود؛ حساب تکراری ساخته نمی‌شود. رمز عبور در این صفحه دریافت یا نمایش داده نمی‌شود.</p>
        <div className="sm:col-span-2">
          <button type="button" disabled={!canCreate} onClick={() => { setError(""); setStep(2); }} className="ops-btn disabled:opacity-50">ادامه به انتخاب نقش‌ها</button>
        </div>
      </fieldset>

      <fieldset hidden={step !== 2} className="space-y-3">
        <legend className="ops-label mb-2">نقش‌های کاری عضو</legend>
        <ul className="grid gap-2 sm:grid-cols-2">
          {roleOptions.map(({ role, label, detail }) => (
            <li key={role}>
              <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3 hover:border-[#0f5a3b]/50">
                <input type="checkbox" name="roles" value={role} checked={selectedRoles.includes(role)} onChange={() => toggleRole(role)} className="focus-ring mt-1 h-4 w-4 accent-[#0f5a3b]" />
                <span><strong className="block text-sm">{label}</strong><span className="text-xs text-bone/60">{detail}</span></span>
              </label>
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setStep(1)} className="ops-btn ops-btn-quiet">بازگشت</button>
          <button type="button" onClick={continueFromRoles} className="ops-btn">ادامه</button>
        </div>
      </fieldset>

      {hasBarberProfile && (
        <fieldset hidden={step !== 3} className="space-y-3 rounded-2xl border border-[#c59b4b]/25 bg-white/60 p-4">
          <legend className="px-1 text-sm font-black">پروفایل حرفه‌ای آرایشگر</legend>
          <p className="text-xs leading-6 text-bone/60">پروفایل به همین حساب متصل می‌شود. نام کاربری و نقش دیگری ساخته نمی‌شود. انتشار عمومی را می‌توانید بعد از تکمیل سایر بخش‌ها فعال کنید.</p>
          <div>
            <label htmlFor="staff-profile-title" className="ops-label">عنوان حرفه‌ای</label>
            <input id="staff-profile-title" name="profileTitle" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} placeholder="مثلاً آرایشگر ارشد" className="ops-field mt-1 w-full" />
          </div>
          <div>
            <label htmlFor="staff-profile-bio" className="ops-label">معرفی کوتاه <span className="font-normal">(اختیاری)</span></label>
            <textarea id="staff-profile-bio" name="profileBio" maxLength={600} rows={3} className="ops-field mt-1 w-full" placeholder="تخصص و سبک کاری را کوتاه معرفی کنید." />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input type="checkbox" name="publishProfile" checked={publishProfile} onChange={(event) => setPublishProfile(event.target.checked)} className="focus-ring h-4 w-4 accent-[#0f5a3b]" />
            پروفایل عمومی پس از ساخت در سایت نمایش داده شود
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep(2)} className="ops-btn ops-btn-quiet">بازگشت به نقش‌ها</button>
            <button type="submit" disabled={pending} className="ops-btn">{pending ? "در حال ساخت…" : "ساخت عضو و پروفایل"}</button>
          </div>
        </fieldset>
      )}

      <input type="hidden" name="publishProfile" value={publishProfile ? "on" : "off"} />
      {step === 4 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setStep(2)} className="ops-btn ops-btn-quiet">بازگشت به نقش‌ها</button>
          <button type="submit" disabled={pending} className="ops-btn">{pending ? "در حال ساخت…" : "ساخت عضو تیم"}</button>
        </div>
      )}
      {state && <p role={state.ok ? "status" : "alert"} className={`text-sm font-semibold ${state.ok ? "text-emerald-800" : "text-rose-700"}`}>{state.message}</p>}
    </form>
  );
}
