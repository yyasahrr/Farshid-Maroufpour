import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { barbers } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { DashboardShell, Panel } from "@/components/dashboard-shell";
import { SiteContentEditor } from "@/components/admin/site-content-editor";
import { getCurrentUser } from "@/lib/session";
import { getHomeContentSnapshot } from "@/lib/home-content";
import { publishHomeContentAction, setFeaturedBarberAction } from "@/lib/actions/site-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "محتوای سایت | پنل سالن" };

export default async function SiteContentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("settings:manage")) notFound();

  const snapshot = await getHomeContentSnapshot();
  let activeBarbers: { id: number; name: string; title: string; featured: boolean }[] = [];
  try {
    activeBarbers = await db.select({ id: barbers.id, name: barbers.name, title: barbers.title, featured: barbers.featured })
      .from(barbers)
      .where(eq(barbers.active, true))
      .orderBy(asc(barbers.name));
  } catch {
    // The CMS page stays readable while the forward migration is pending.
  }
  const featuredBarber = activeBarbers.find((barber) => barber.featured);

  return (
    <DashboardShell
      title="محتوای سایت"
      subtitle={user.name}
      sections={[
        { id: "editor", label: "محتوای صفحهٔ اصلی" },
        { id: "publication", label: "پیش‌نمایش و انتشار" },
        { id: "featured", label: "آرایشگر ویژه" },
      ]}
    >
      <header className="ops-panel !bg-[#f7f7f2]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[#0f5a3b]">مدیریت محتوا و رسانه</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">محتوای وب‌سایت</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-bone/65">محتوا ابتدا به‌صورت پیش‌نویس ذخیره می‌شود. برای بازدیدکنندگان فقط نسخهٔ منتشرشده نمایش داده می‌شود؛ پیش‌نمایش پیش‌نویس نیازمند ورود و دسترسی مدیریت محتواست.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/site-content/media" className="ops-btn ops-btn-quiet min-h-11">کتابخانهٔ رسانه</Link>
            <Link href="/admin/site-content/preview" target="_blank" rel="noreferrer" className="ops-btn min-h-11">پیش‌نمایش خصوصی ↗</Link>
            <Link href="/admin/team" className="ops-btn ops-btn-quiet min-h-11">بازگشت به مدیریت تیم</Link>
          </div>
        </div>
      </header>

      <Panel
        id="editor"
        title="ویرایش صفحهٔ اصلی"
        description="محتوای عمومی با متن فارسی و رسانهٔ محلی امن ذخیره می‌شود؛ انتشار جداگانه است."
      >
        <SiteContentEditor content={snapshot.draft} />
      </Panel>

      <Panel id="publication" title="نسخه‌ها، پیش‌نمایش و انتشار">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <h3 className="text-sm font-black">پیش‌نویس</h3>
            <p className="mt-1 text-xs leading-6 text-bone/60">
              {snapshot.hasDraft ? `نسخهٔ پیش‌نویس ${snapshot.draftVersion.toLocaleString("fa-IR")} ذخیره شده است.` : "هنوز پیش‌نویسی در CMS ذخیره نشده است."}
            </p>
            {snapshot.updatedAt && <p className="mt-1 text-[11px] text-bone/55">آخرین ذخیره: {snapshot.updatedAt.toLocaleString("fa-IR")}</p>}
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <h3 className="text-sm font-black">نسخهٔ عمومی</h3>
            <p className="mt-1 text-xs leading-6 text-bone/60">
              {snapshot.publishedVersion ? `نسخهٔ ${snapshot.publishedVersion.toLocaleString("fa-IR")} منتشر شده است.` : "هنوز نسخه‌ای از CMS منتشر نشده؛ محتوای پیش‌فرض/قدیمی سایت تا انتشار حفظ می‌شود."}
            </p>
            {snapshot.publishedAt && <p className="mt-1 text-[11px] text-bone/55">زمان انتشار: {snapshot.publishedAt.toLocaleString("fa-IR")}</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ActionForm action={publishHomeContentAction} submitLabel="انتشار پیش‌نویس ذخیره‌شده"><input type="hidden" name="confirm" value="publish" /></ActionForm>
          <Link href="/admin/site-content/preview" target="_blank" rel="noreferrer" className="ops-btn ops-btn-quiet min-h-11">دیدن پیش‌نمایش خصوصی ↗</Link>
        </div>
      </Panel>

      <Panel id="featured" title="آرایشگر ویژهٔ صفحهٔ اصلی" description="پروفایل فعال منتخب در جایگاه معرفی اصلی تیم نمایش داده می‌شود. انتخاب به‌صورت اتمی انجام می‌شود و هم‌زمان فقط یک آرایشگر ویژه است.">
        {activeBarbers.length ? (
          <ActionForm action={setFeaturedBarberAction} submitLabel="ذخیرهٔ آرایشگر ویژه" className="max-w-2xl">
            <label htmlFor="featured-barber" className="ops-label">آرایشگر</label>
            <select id="featured-barber" name="barberId" defaultValue={featuredBarber ? String(featuredBarber.id) : "none"} className="ops-field mt-1 w-full">
              <option value="none">بدون آرایشگر ویژه</option>
              {activeBarbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name} · {barber.title}</option>)}
            </select>
          </ActionForm>
        ) : (
          <p className="ops-empty">فهرست آرایشگران یا ستون‌های نسخهٔ جدید در دسترس نیست.<span className="ops-meta">پس از بررسی وضعیت پایگاه‌داده و اجرای مهاجرت رو به جلو دوباره تلاش کنید.</span></p>
        )}
      </Panel>
    </DashboardShell>
  );
}
