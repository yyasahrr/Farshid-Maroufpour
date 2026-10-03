# ممیزی مخزن — آکادمی زیبایی فرشید معروف پور

## چارچوب و مرزبندی
- Next.js 16 App Router / React 19 / TypeScript strict / Tailwind 4؛ فونت محلی Vazirmatn.
- PostgreSQL با Drizzle در `src/db`; APIهای App Router زیر `src/app/api`; سرور اکشن‌ها در `src/lib/actions`.
- مسیرهای عمومی: `/`, `/booking`, `/services`, `/barbers`, `/barbers/[slug]`, `/academy`, `/classes/[slug]`, `/shop`, `/work`, `/track`, `/account`, `/pay`.
- مسیرهای عملیاتی: `/barber`, `/admin`; ورود کارکنان `/login` جدا از OTP مشتری.
- رزرو: `src/lib/availability.ts` (برنامه سالن + آرایشگر + زمان بسته + نوبت و hold)، `src/lib/booking.ts` (تراکنش با قفل advisory و قیمت محاسبه‌شده سرور)، `src/app/api/booking/available-barbers` (تطبیق مهارت/service + زمان). فرانت مشتری: `MobileBookingExperience`.
- OTP و نشست: `src/lib/auth-otp.ts`, `src/lib/session.ts`, `/api/auth/*`. پرداخت: `src/lib/payments.ts`, `/pay`, `/api/payments/verify`; شبیه‌ساز تنها با فلگ محیط.

## الگوهای قابل حفظ
- نشان FM تاج‌دار برداری، فونت فارسی self-host، تاریخ شمسی، داده‌های Drizzle، پردازش پرداخت سمت سرور، منطق اسلات، حالات خطای API، پنل‌های مدیریت موجود.

## مشکلات کشف‌شده و مرزها
1. صفحه ورودی جدید Soft Bento است اما catalogها، هدر و داشبوردها هنوز ترکیب سبز/طلایی و glass قدیمی دارند؛ CSS `atelier.css` فقط به نسل قبلی صفحات اختصاص دارد.
2. `MobileBookingExperience` بسیار بزرگ است؛ بازه‌های زمان باید از سرور بیایند، نه شبکهٔ ثابت؛ stale responses نباید انتخاب جدید را بپوشانند.
3. OTP نمونه قبلاً بدون درخواست معتبر امکان ورود داشت؛ سرور باید درخواست، انقضا، مصرف و محدودیت تلاش را اعمال کند.
4. نگهداری نوبت باید دارای مالک و expiry واقعی و با ایجاد نوبت در یک قفل سازگار باشد. فقط پرداخت verify شده وضعیت نوبت دارای پیش‌پرداخت را تأیید می‌کند.
5. `users.role` فعلاً تک‌مقداری است؛ تا ایجاد مدل مجزای multi-role، UI حق ادعای سوییچ نقش هم‌زمان ندارد. `barber_services` و `barber_skills` رابطهٔ ارائه/مهارت‌اند؛ فیلد وضعیت تایید مهارت موجود نیست.
6. دیتابیس فعلی مدلی برای جلسه آموزشی/تداخل مدرس، منابع چندنفره/پردازش خدمات پیشرفته و درگاه واقعی بانکی ندارد؛ UI وعدهٔ پوشش این قابلیت‌ها را نمی‌دهد. نیازمند تغییر دامنهٔ مستقل است.
7. موجودی محصولات فعلی پیش‌نمایش واردشده به DB است؛ پرداخت/ارسال آنلاین فروشگاه وجود ندارد. محصولات تنها برای مرور و تماس قابل نمایش‌اند، نه خرید ادعایی.
8. وبهوک پیامک تنها وقتی `OTP_SMS_WEBHOOK_URL` و توکن آن پیکربندی شود کار می‌کند؛ محیط پیش‌نمایش صرفاً تلفن‌های مجاز در `OTP_DEMO_PHONES` را می‌پذیرد.

## قراردادهایی که حفظ می‌شوند
- `/api/appointments` با Zod + Authorization، `/api/availability` و `/api/booking/available-barbers` برای نمایش پیشنهادها، `/api/booking/hold`, `/api/auth/*`, `/api/customer/bookings`, `/api/classes/register`, `/api/payments/verify`.
- درخواست زمان فقط پیشنهاد است؛ سرور در تراکنش آخرین وضعیت و قیمت را مجدداً بررسی می‌کند.
- هیچ دادهٔ داخلی مشتری در API زمان‌بندی عمومی قابل انتشار نیست.
