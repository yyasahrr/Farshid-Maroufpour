"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/ui-cards";
import { isRemoteImage, safeImageUrl } from "@/lib/service-media";
import { CONTACT_PHONE_TEL } from "@/lib/site";
import { formatPrice } from "@/lib/time";

export type Product = { id: number; name: string; slug: string; category: string; price: number; description: string; imageUrl: string; inStock: boolean; rating: number };

export function ShopClient({ initialProducts }: { initialProducts: Product[] }) {
  const [category, setCategory] = useState("همه");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  // Stored URLs are sanitised once so every card and the detail dialog share the same value.
  const catalog = useMemo(() => initialProducts.map((p) => ({ ...p, imageUrl: safeImageUrl(p.imageUrl) })), [initialProducts]);
  const categories = useMemo(() => ["همه", ...new Set(catalog.map((p) => p.category))], [catalog]);
  const items = catalog.filter((p) => (category === "همه" || p.category === category) && `${p.name} ${p.description}`.includes(search.trim()));
  useEffect(() => {
    const node = dialog.current;
    if (selected && node && !node.open) node.showModal();
    return () => { if (node?.open) node.close(); };
  }, [selected]);
  return <div>
    <label htmlFor="shop-search" className="ui-label">جست‌وجوی محصول</label><div className="relative"><Icon name="search" className="pointer-events-none absolute start-4 top-3.5 h-5 w-5 text-bone-500" /><input id="shop-search" className="ui-input ps-11" placeholder="نام یا کاربرد محصول" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    <div role="group" aria-label="دسته‌بندی محصولات" className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto pb-2">{categories.map((name) => <button type="button" aria-pressed={category === name} key={name} onClick={() => setCategory(name)} className={`focus-ring ui-pill min-h-11 shrink-0 !px-4 ${category === name ? "bg-bone-700 text-white" : "border border-bone-150 bg-white text-brass-800"}`}>{name}</button>)}</div>
    {items.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((product) => <button key={product.id} type="button" aria-label={`جزئیات ${product.name}`} onClick={() => setSelected(product)} className="focus-ring ui-card bento-card-interactive overflow-hidden text-right"><span className="relative block aspect-[4/3] overflow-hidden bg-brass-50"><Image src={product.imageUrl} alt="" fill sizes="(max-width:640px) 95vw, (max-width:1024px) 48vw, 30vw" className="object-cover" unoptimized={isRemoteImage(product.imageUrl)} /></span><span className="block p-4"><span className="ui-pill ui-tag-shop">{product.category}</span><strong className="mt-3 block text-[16px] leading-7">{product.name}</strong><span className="mt-1 block line-clamp-2 min-h-[44px] text-sm leading-6 text-bone-500">{product.description}</span><span className="mt-3 flex justify-between text-sm font-bold"><span>{formatPrice(product.price)}</span><span className={product.inStock ? "text-brand-400" : "text-danger"}>{product.inStock ? "موجودی اعلام‌شده" : "ناموجود"}</span></span></span></button>)}</div> : <div className="mt-6"><EmptyState title="محصولی پیدا نشد" description="فیلتر دیگری امتحان کنید یا برای موجودی با پذیرش تماس بگیرید." /></div>}
    {selected && <dialog ref={dialog} aria-labelledby="shop-product-title" onClose={() => setSelected(null)} className="auth-dialog w-[min(520px,calc(100vw-24px))] overflow-y-auto rounded-2xl bg-white p-5 text-bone-700"><div className="flex items-start justify-between gap-3"><h2 id="shop-product-title" className="text-lg font-black">{selected.name}</h2><button aria-label="بستن جزئیات محصول" type="button" className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" onClick={() => dialog.current?.close()}><Icon name="close" className="h-5 w-5" /></button></div><div className="relative mt-3 aspect-[16/9] overflow-hidden rounded-xl bg-brass-50"><Image src={selected.imageUrl} alt={selected.name} fill sizes="500px" className="object-cover" unoptimized={isRemoteImage(selected.imageUrl)} /></div><p className="mt-4 text-sm leading-8 text-bone-500">{selected.description}</p><p className="mt-4 font-bold tabular-nums">{formatPrice(selected.price)}</p><p className="mt-2 text-xs leading-6 text-bone-500">این صفحه فروش آنلاین ندارد. برای تأیید قیمت و موجودی و هماهنگی دریافت با پذیرش تماس بگیرید.</p><a href={`tel:${CONTACT_PHONE_TEL}`} className="ui-button mt-5 w-full">تماس با پذیرش</a></dialog>}
  </div>;
}
