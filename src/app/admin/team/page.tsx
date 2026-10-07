import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { barbers, userRoles, users } from "@/db/schema";
import { DashboardShell, Panel } from "@/components/dashboard-shell";
import { TeamCreateForm } from "@/components/admin/team-create-form";
import { TeamRoster, type TeamRosterMember } from "@/components/admin/team-roster";
import { getCurrentUser, isStaff } from "@/lib/session";
import { rolesFromLegacyRole, type Role } from "@/lib/rbac";
import { TEAM_ROLE_LABELS_FA } from "@/lib/team";

export const dynamic = "force-dynamic";
export const metadata = { title: "تیم و دسترسی‌ها | پنل سالن" };

const TEAM_ROLES: readonly Role[] = ["BARBER", "INSTRUCTOR", "RECEPTIONIST", "MANAGER", "FINANCE", "SUPER_ADMIN"];

export default async function AdminTeamPage({ searchParams }: { searchParams: Promise<{ offboarded?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  if (!user.permissions.has("staff:view") && !user.permissions.has("roles:manage")) redirect(isStaff(user) ? "/admin" : "/barber");

  const [accounts, memberships, profiles] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select({ userId: userRoles.userId, role: userRoles.role }).from(userRoles),
    db.select().from(barbers),
  ]);
  const roleMap = new Map<number, Role[]>();
  for (const membership of memberships) {
    const values = roleMap.get(membership.userId) ?? [];
    values.push(membership.role as Role);
    roleMap.set(membership.userId, values);
  }
  const profileMap = new Map(profiles.filter((profile) => profile.userId !== null).map((profile) => [profile.userId!, profile]));
  const members: TeamRosterMember[] = accounts.flatMap((account) => {
    const roles = roleMap.get(account.id)?.length ? [...new Set(roleMap.get(account.id))] : rolesFromLegacyRole(account.role);
    if (!roles.some((role) => TEAM_ROLES.includes(role))) return [];
    const profile = profileMap.get(account.id);
    return [{
      userId: account.id,
      name: account.name,
      phone: account.phone,
      roles,
      barber: profile ? { slug: profile.slug, name: profile.name, title: profile.title, imageUrl: profile.imageUrl, active: profile.active } : null,
    }];
  });
  const sections = [
    { id: "people", label: "اعضای تیم", group: "تیم" },
    ...(user.permissions.has("staff:manage") ? [{ id: "add-member", label: "افزودن عضو" }] : []),
    { id: "account", label: "حساب من", group: "محیط کاری" },
  ];
  const roleSummary = user.roles.map((role) => TEAM_ROLE_LABELS_FA[role] ?? role).join(" · ");

  return (
    <DashboardShell title="تیم و دسترسی‌ها" subtitle={`${user.name} · ${roleSummary}`} sections={sections}>
      <header className="ops-panel !bg-[#f7f7f2]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-[#0f5a3b]">مدیریت اعضا، نه داده‌های سامانه</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">تیم سالن</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-bone/65">نقش هر عضو دسترسی پنل او را مشخص می‌کند. پروفایل عمومی، خدمات، مهارت‌ها، برنامه و نمونه‌کارها در صفحهٔ همان عضو مدیریت می‌شوند.</p>
          </div>
          {user.permissions.has("settings:manage") && <Link href="/admin/site-content" className="ops-btn ops-btn-quiet min-h-11">ویرایش هدر صفحهٔ اصلی</Link>}
        </div>
      </header>

      {params.offboarded === "1" && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">دسترسی تیمی غیرفعال شد. حساب، نوبت‌ها و تاریخچه حفظ شده‌اند و عضو از فهرست تیم کنار گذاشته شد.</p>}

      <Panel id="people" title="اعضای تیم" description={`${members.length.toLocaleString("fa-IR")} عضو · نقش‌ها دسترسی کاری را تعیین می‌کنند؛ شناسه‌های داخلی نمایش داده نمی‌شوند.`}>
        <TeamRoster members={members} canManage={user.permissions.has("staff:manage")} />
      </Panel>

      {user.permissions.has("staff:manage") && (
        <Panel id="add-member" title="افزودن عضو" description="مرحله‌به‌مرحله: اطلاعات پایه، نقش‌ها و در صورت نیاز پروفایل حرفه‌ای. شمارهٔ موجود به همان حساب وصل می‌شود.">
          <details className="group rounded-2xl border border-[#c59b4b]/30 bg-white p-4">
            <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl font-bold text-[#0f5a3b]">
              <span>＋ افزودن عضو تیم</span><span className="text-xs font-medium text-bone/55">بدون ساخت حساب تکراری</span>
            </summary>
            <div className="mt-4 border-t border-[#c59b4b]/20 pt-4">
              <TeamCreateForm canAssignPrivilegedRoles={user.permissions.has("roles:manage")} />
            </div>
          </details>
        </Panel>
      )}

      <Panel id="account" title="حساب من" description="حساب کاربری و پروفایل حرفه‌ای دو بخش جدا هستند. نقش‌های فعلی شما در این حساب آمده‌اند.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <p className="text-xs text-bone/55">حساب کاربری</p>
            <p className="mt-1 font-bold">{user.name}</p>
            <p dir="ltr" className="mt-1 text-start text-sm tabular-nums text-bone/65">{user.phone}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <p className="text-xs text-bone/55">نقش‌ها و دسترسی پنل</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.roles.map((role) => <span key={role} className="ops-chip ops-chip-mute">{TEAM_ROLE_LABELS_FA[role] ?? role}</span>)}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {isStaff(user) && <a href="/admin" className="ops-btn ops-btn-quiet min-h-11">محیط مدیریت</a>}
          {user.barberId && <a href="/barber" className="ops-btn ops-btn-quiet min-h-11">محیط آرایشگری</a>}
          {user.roles.includes("INSTRUCTOR") && <a href="/academy" className="ops-btn ops-btn-quiet min-h-11">محیط آموزش / آکادمی</a>}
          <a href="/account" className="ops-link min-h-11 px-3 py-3">حساب کاربری و نوبت‌های من</a>
        </div>
      </Panel>
    </DashboardShell>
  );
}
