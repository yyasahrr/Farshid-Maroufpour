import { Gallery } from "@/components/gallery";
import { getGalleryItems } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "نمونه‌کارها", description: "گالری سبک‌های پیرایش و آثار ثبت‌شده در پروفایل آرایشگران." };
export default async function WorkPage() {
  const items = await getGalleryItems();
  return <div className="ui-shell"><div className="ui-container ui-page"><div className="ui-pagehead"><h1>گالری سبک‌ها</h1><p>سبک‌های ثبت‌شده توسط اعضای تیم را بر اساس دسته مرور کنید. برای دیدن آرایشگر هر سبک، پروفایل او را ببینید.</p></div><Gallery items={items} /></div></div>;
}
