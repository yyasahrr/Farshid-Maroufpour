"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookingAuthModal } from "@/components/booking/BookingAuthModal";
import { BrandMonogram, Icon } from "@/components/icons";

export function CustomerLoginPrompt({ demoPhoneHint }: { demoPhoneHint?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return <><BookingAuthModal isOpen={open} onClose={() => setOpen(false)} onAuthenticated={() => { setOpen(false); router.refresh(); }} demoPhoneHint={demoPhoneHint} />
    <div className="ui-panel w-full max-w-[430px] text-center"><BrandMonogram className="mx-auto !h-14 !w-[42px] text-[#1f2e27]" /><h1 className="mt-5 text-2xl font-black">پنل من</h1><p className="mt-3 text-sm leading-8 text-[#5f7168]">برای مشاهده نوبت‌ها، دوره‌ها و اطلاعات حساب، با شماره موبایل وارد شوید.</p><button type="button" onClick={() => setOpen(true)} className="ui-button mt-6 w-full"><Icon name="phone" className="h-4 w-4" />ورود با موبایل</button><Link href="/home" className="mt-4 inline-block text-sm text-[#5f7168] hover:underline">بازگشت به خانه</Link></div>
  </>;
}
