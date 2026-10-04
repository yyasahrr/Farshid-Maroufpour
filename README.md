# آرایشگاه فرشید معروف‌پور — پلتفرم نوبت‌دهی

نوبت‌دهی چندخدمتی با **یک ساعت شروع، یک نوبت پیوسته**؛ قوانین ترکیب خدمات، مهارت‌ها و
دسترسی‌ها همه دیتامحور و اعتبارسنجی‌شده در سرور.

## پیش‌نیازها

- Node.js ‪20.11+‬ (توصیه: ۲۲)
- Docker (برای PostgreSQL) — یا هر PostgreSQL 15+ روی پورت ۵۴۳۴

## راه‌اندازی سریع (لوکال)

```bash
git clone <این ریپو> && cd <ریپو>
git checkout arena/01a102f2-farshid-maroufpour   # یا بعد از ادغام PR، main

npm install

# دیتابیس (پورت 5434 تا با Postgres میزبان تداخل نکند)
npm run db:up          # = docker compose up -d
npm run db:setup       # مایگریشن + سید دمو

# محیط
cp .env.example .env.local   # در محیط لوکال می‌تونی همین‌جوری بذاری؛ همه مقادیر دموست

npm run dev            # → http://localhost:5000
```

اگر Docker نداری، هر Postgres دیگری را روی `127.0.0.1:5434` با کاربر/رمز
`postgres/postgres` و دیتابیس `app_db` بالا بیاور و فقط `npm run db:setup` را بزن.

## متغیرهای محیطی

| متغیر | نمونه | توضیح |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:***@127.0.0.1:5434/app_db` | رشته اتصال |
| `OTP_DEMO_MODE` | `true` | حالت پیش‌نمایش: کد ثابت `123456` برای همهٔ شماره‌ها |
| `OTP_DEMO_PHONES` | `09129998877,...` | شماره‌های دموی پنل |
| `PAYMENT_DEMO_MODE` | `true` | تأیید پرداخت صوری (فقط پیش‌نمایش) |
| `BOOKING_POLICY_VERSION` | `2.1` | نسخهٔ قوانین؛ پذیرش مشتری نسخه‌ای می‌شود |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:5000` | URL عمومی برای ICS/رسید |
| `SESSION_SECRET` | — | اختیاری؛ اگر نباشد کلید امضا یک‌بار در DB ساخته می‌شود |

## اسکرپت‌ها

```bash
npm run dev            # سرور توسعه روی :5000
npm run build && npm run start   # بیلد و اجرای پروداکشن
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run test:planner   # تست‌های واحد موتور زمان‌بندی (بدون DB)
node scripts/qa-booking-ui.mjs   # E2E هدلس ویزارد رزرو (نیازمند next start)
npm run db:migrate     # اعمال مایگریشن‌ها
npm run db:setup:reset # ساخت مجدد اسکیما + سید
npm run db:studio      # مرورگر دیتابیس
```

## ورود‌های دمو (OTP ثابت 123456)

| شماره | نقش |
|---|---|
| `09120000001` | کیان مرادی — مالک/مدیر ارشد (+MANAGER) |
| `09120000002` | فرشید معروف‌پور — آرایشگر (+مدرس +مدیر) |
| `09120000005` | مریم صدر — پذیرش (+مالی) |
| `09129998877` | سارا کاظمی — مشتری (+هنرجو) |

مسیرها: `/` (گیتوی)، `/booking` (ویزارد رزرو)، `/login` سپس `/admin` یا `/barber`،
`/track` (پیگیری نوبت).

## معماری (خلاصه)

- موتور زمان‌بندی: `src/lib/visit-planner.ts` (خالص، بدون DB) — زنجیرهٔ پیوستهٔ خدمات،
  صف‌بندی همزمان فقط با مجوز `allowParallel` دو سرویس، خوشه‌های «یک آرایشگر» از
  `service_combination_rules`.
- لایهٔ DB: Drizzle + Postgres (`src/db/schema.ts`)؛ قوانین ترکیب، مهارت‌ها
  (فقط `APPROVED` واجد زمان‌بندی)، جلسات کلاس (مسدودکنندهٔ slot مدرس)، Hold روی کل برنامه.
- API: `POST /api/booking/plan` → `/api/booking/hold` → `/api/appointments/group`
  (اعتبارسنجی سه‌مرحله‌ای؛ ورود فقط موقع ثبت؛ انقضای Hold → پیشنهاد نزدیک‌ترین زمان‌ها بدون ریست).
- تم‌ها: `theme-customer` (دارک پریمیوم سمت مشتری) و `theme-ops` (پنل عملیاتی) در `globals.css`
  — جزئیات در `.tastemaker/style-lock.md`.
