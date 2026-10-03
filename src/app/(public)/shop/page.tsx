import { desc } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ShopClient } from "@/components/shop/ShopClient";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "فروشگاه", description: "محصولات مراقبت مو و ریش؛ دسته‌بندی و جزئیات را ببینید و برای سفارش با پذیرش هماهنگ کنید." };

export default async function ShopPage() {
  const catalog = await db.select().from(products).orderBy(desc(products.id));
  return <div className="ui-shell"><div className="ui-container ui-page max-w-[1050px]">
    <div className="ui-pagehead"><span className="ui-pill ui-tag-shop"><Icon name="diamond" className="h-4 w-4" />فروشگاه</span><h1 className="mt-3">برای ادامهٔ مراقبت در خانه</h1><p>محصولات موجود در کاتالوگ را ببینید. قیمت و موجودی پیش از سفارش تلفنی با پذیرش تأیید می‌شود؛ پرداخت آنلاین فروشگاه فعال نیست.</p></div>
    <ShopClient initialProducts={catalog} />
  </div></div>;
}
