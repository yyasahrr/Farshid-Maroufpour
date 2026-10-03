# نقشه حالت‌ها

- Auth: `phone → otp-sent → verifying → (name-required | authenticated)`؛ rate-limit، اشتباه و انقضا مستقل. کد تنها پس از درخواست، فقط یک‌بار مصرف.
- Availability: `idle → loading → slots | no-slots | error`؛ تغییر تاریخ/خدمت، نتایج درخواست قدیمی را نادیده می‌گیرد. زمان فقط وقتی در `slots` آمده قابل انتخاب است.
- Barber: `eligible-free | eligible-nearby | fully-booked`؛ UI هر دو آزاد و نزدیک را نشان می‌دهد، اما نزدیک فقط پس از انتخاب دوباره و تأیید سرور قابل رزرو است.
- Policy: `unaccepted(version) → accepting → accepted(version)`؛ نسخهٔ جدید نیاز به پذیرش مجدد دارد.
- Hold: `requesting → held(expiresAt) | conflict → expired`; شمارش معکوس بعد از دریافت `expiresAt`, هرگز به‌صورت ساختگی.
- Appointment: `PENDING` برای مبلغ آنلاین، `CONFIRMED` برای بدون پیش‌پرداخت، `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `NO_SHOW`, `CANCELLED_BY_*`.
- Payment: `PENDING → PAID | FAILED | CANCELLED`; فقط تأیید معتبر سمت سرور به `CONFIRMED` منجر می‌شود. مسیر `/pay` تا وقتی provider واقعی وجود ندارد فقط «پرداخت آزمایشی» مشخص است.
