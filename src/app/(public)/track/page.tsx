import Link from "next/link";
import { TrackForm } from "@/components/track-form";
import { CustomerLoginPrompt } from "@/components/customer/CustomerLoginPrompt";
import { getCurrentUser } from "@/lib/session";
import { demoPhoneHint } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "پیگیری نوبت", description: "وضعیت نوبت‌های خود را با کد رهگیری در حساب کاربری بررسی کنید." };
export default async function TrackPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  const { q } = await searchParams;
  return <div className="ui-shell"><div className="ui-container ui-page max-w-[820px]"><div className="ui-pagehead"><h1>پیگیری نوبت</h1><p>کد رهگیری را وارد کنید یا همه نوبت‌های خود را در پنل من ببینید.</p></div>{user ? <TrackForm initialQuery={q ?? ""} /> : <CustomerLoginPrompt demoPhoneHint={demoPhoneHint()} />}<div className="mt-6"><Link href="/account" className="ui-link">رفتن به پنل من</Link></div></div></div>;
}
