import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { updateOwnAccountNameAction } from "@/lib/actions/team";
import { TEAM_ROLE_LABELS_FA } from "@/lib/team";
import { isStaff, type SessionUser } from "@/lib/session";

export function StaffAccountSection({ user, canViewTeam }: {
  user: Pick<SessionUser, "id" | "name" | "phone" | "roles" | "barberId">;
  canViewTeam: boolean;
}) {
  const staff = user.roles.some((role) => !["CLIENT", "TRAINEE"].includes(role));
  if (!staff) return null;

  return (
    <section aria-labelledby="staff-account-title" className="ui-panel mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-brand-700">حساب کاربری</p>
          <h2 id="staff-account-title" className="mt-1 text-xl font-black">حساب من</h2>
          <p className="mt-1 text-sm leading-7 text-bone-500">این نام برای ورود و نوبت‌هاست. عنوان، عکس و زندگی‌نامه در پروفایل عمومی آرایشگر جداگانه ویرایش می‌شوند.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isStaff(user) && <Link href="/admin" className="ui-button ui-button-quiet min-h-11 !text-xs">محیط مدیریت</Link>}
          {canViewTeam && <Link href="/admin/team" className="ui-button ui-button-quiet min-h-11 !text-xs">تیم و دسترسی‌ها</Link>}
          {user.barberId && <Link href="/barber" className="ui-button ui-button-quiet min-h-11 !text-xs">محیط آرایشگری</Link>}
          {user.roles.includes("INSTRUCTOR") && <Link href="/academy" className="ui-button ui-button-quiet min-h-11 !text-xs">محیط آموزش</Link>}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs font-semibold text-bone-500">اطلاعات حساب</p>
          <p dir="ltr" className="mt-2 text-start text-sm font-semibold tabular-nums">{user.phone}</p>
          <ActionForm action={updateOwnAccountNameAction} submitLabel="ذخیره نام حساب" className="mt-3">
            <label htmlFor="account-name" className="ui-label">نام نمایشی حساب</label>
            <input id="account-name" name="name" defaultValue={user.name} minLength={2} maxLength={80} required className="ui-input mt-1 w-full" />
          </ActionForm>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs font-semibold text-bone-500">نقش‌ها و دسترسی‌های همین حساب</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">{user.roles.map((role) => <li key={role} className="ui-pill">{TEAM_ROLE_LABELS_FA[role] ?? role}</li>)}</ul>
          {user.barberId && (
            <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--color-border)] pt-3 text-sm">
              <Link href={`/admin/team/${user.id}#profile`} className="ui-link">ویرایش پروفایل عمومی من</Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
