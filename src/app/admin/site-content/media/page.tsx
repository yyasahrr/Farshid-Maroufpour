import Link from "next/link";
import { desc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { DashboardShell, Panel } from "@/components/dashboard-shell";
import { MediaLibraryClient, type MediaLibraryItem } from "@/components/admin/media-library-client";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "کتابخانهٔ رسانه | پنل سالن" };

export default async function SiteMediaLibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("settings:manage")) notFound();
  const rows = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(250);
  const assets: MediaLibraryItem[] = rows.map((asset) => ({
    id: asset.id,
    url: `/uploads/${asset.storageKey}`,
    originalName: asset.originalName,
    mediaType: asset.mediaType,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    createdAt: asset.createdAt.toISOString(),
  }));

  return (
    <DashboardShell title="کتابخانهٔ رسانه" subtitle={user.name} sections={[{ id: "library", label: "فایل‌های ذخیره‌شده" }]}>
      <header className="ops-panel !bg-[#f7f7f2]">
        <p className="text-xs font-bold text-[#0f5a3b]">ذخیره‌گاه امن و قابل‌استفادهٔ دوباره</p>
        <h1 className="mt-2 text-2xl font-black">کتابخانهٔ رسانه</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-bone/65">فایل‌ها با نام تصادفی در ذخیره‌گاه سرور نگه‌داری و از این فهرست دوباره انتخاب می‌شوند. حذف فایل فقط وقتی ممکن است که هیچ محتوای پیش‌نویس یا منتشرشده و هیچ پروفایل/نمونه‌کاری به آن ارجاع ندهد.</p>
        <Link href="/admin/site-content" className="ops-btn mt-4 min-h-11">بازگشت به محتوای سایت</Link>
      </header>
      <Panel id="library" title="فایل‌های ذخیره‌شده" description={`${assets.length.toLocaleString("fa-IR")} رسانهٔ تازهٔ ثبت‌شده در پایگاه‌داده.`}>
        <MediaLibraryClient assets={assets} />
      </Panel>
    </DashboardShell>
  );
}
