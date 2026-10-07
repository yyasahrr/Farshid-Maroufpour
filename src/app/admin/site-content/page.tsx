import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardShell, Panel } from "@/components/dashboard-shell";
import { HeroAdminPanel } from "@/components/admin/hero-admin-panel";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "محتوای سایت | پنل سالن" };

export default async function SiteContentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("settings:manage")) notFound();

  return (
    <DashboardShell
      title="محتوای سایت"
      subtitle={user.name}
      sections={[{ id: "hero", label: "هدر صفحهٔ اصلی" }]}
    >
      <Panel
        id="hero"
        title="هدر صفحهٔ اصلی"
        description="تیتر، متن، دکمه‌ها و رسانهٔ دسکتاپ و موبایل ذخیره می‌شوند؛ تغییر از اینجا مستقیماً در صفحهٔ خانه نمایش داده خواهد شد."
      >
        <HeroAdminPanel />
      </Panel>
      <p className="text-sm"><Link href="/admin/team" className="ui-link">بازگشت به مدیریت تیم</Link></p>
    </DashboardShell>
  );
}
