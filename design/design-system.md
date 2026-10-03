# سیستم طراحی — کد مرجع `src/app/globals.css`

## توکن‌ها
| کاربرد | مقدار |
|---|---|
| Background | `#F8F7F2` |
| Surface | `#FFFFFF` |
| Ink | `#232C33` |
| Text secondary | `#424874` |
| Booking accent | `#0FA3B1` / نسخه تیره متن `#0B808C` |
| Academy / Shop / Info | `#E8EAF6` / `#FBF5DB` / `#E4ECE3` |
| Border | `#E7E6DF` |
| Danger | rose 700 |

- Vazirmatn variable self-hosted در `/public/fonts`.
- Space ۴/۸/۱۲/۱۶/۲۰/۲۴/۳۲/۴۸/۶۴؛ radius ۱۲/۱۶/۲۰/۲۴/۲۸؛ کلید Tab فوکوس teal.
- Customer: `bento-card`, `Icon`, `BrandMonogram`, phone/OTP, service row, date strip, time grid, barber row, policy dialog, payment summary, customer card.
- Staff/owner: shell با rail/sidebar، stat و operational table متناسب با حجم داده؛ markup سرور حفظ شود.

## موجودی صفحه‌ها
درگاه `/` برای دسترسی سریع؛ خانهٔ اصلی `/home` با هیروی معرفی برند، هدر عمومی، CTA رزرو، نوار موبایل و بخش «درباره ما»؛ خدمات، آرایشگران، پروفایل، آکادمی، دوره، فروشگاه (بدون checkout)، نمونه‌کار، پیگیری، رزرو، پنل مشتری، صفحه پرداخت دمو، ورود کارکنان، پنل آرایشگر، پنل مدیر.

## سازگاری و تست
۳۲۰/۳۷۵/۳۹۰/۴۳۰/۷۶۸/۱۰۲۴/۱۴۴۰px، axe WCAG، reduced-motion، keyboard OTP/modal، status error/empty، تراکنش هم‌زمان. صفحهٔ رزرو با JS محدود؛ دریافت اسلات فقط از API.
