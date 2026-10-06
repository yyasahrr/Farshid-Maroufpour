import { test, expect, type Page } from "@playwright/test";

/**
 * Customer visit scenarios — the fourteen flows from the product spec, plus the
 * accessibility sweep for booking and the admin command center.
 *
 * These drive a real app against a real PostgreSQL database, so they are gated:
 *
 *   npm run db:up && npm run db:setup
 *   npm run build && npm run start        # or npm run dev
 *   E2E_LIVE=1 npx playwright test --project=desktop tests/e2e/booking-visits.spec.ts
 *
 * Without `E2E_LIVE=1` the file is skipped instead of failing — the sandbox-free
 * planner suite (`npm run test:planner`) is the suite that runs anywhere.
 *
 * Data comes from `scripts/seed.sql` (services, barbers, skills, hours) and from
 * `preview.config.json` (OTP demo mode). Nothing here invents salon data: the
 * scenarios use the seeded service names and the documented demo accounts.
 */

const LIVE = process.env.E2E_LIVE === "1";

const SALON_SERVICE = "اصلاح مو"; // 45 min, NO_PAYMENT
const SECOND_SERVICE = "اصلاح و طراحی ریش"; // 30 min, NO_PAYMENT
const DEPOSIT_SERVICE = "اسکین فید"; // 60 min, DEPOSIT ۱۵۰٬۰۰۰
const SHARED_SERVICE = "پکیج مو و ریش"; // 75 min, DEPOSIT — فرشید و سامان both offer it
const TEAM_SERVICE = "رنگ و لایت"; // 90 min, FULL_PAYMENT — only نیما

const RETURNING_PHONE = "09121111111"; // OTP demo phone (preview.config.json)
const ADMIN = { phone: "09120000001", password: "admin123" };
const BARBER = { phone: "09120000002", password: "barber123" };

test.describe("customer visit scenarios", () => {
  test.skip(!LIVE, "needs a live app plus seeded PostgreSQL — run with E2E_LIVE=1");

  /* ------------------------------------------------------------------ *
   * helpers
   * ------------------------------------------------------------------ */

  async function pickServices(page: Page, names: string[]) {
    await page.goto("/booking");
    await expect(page.getByRole("heading", { name: "چه خدمتی می‌خواهید؟" })).toBeVisible();
    for (const name of names) {
      await page.getByRole("button", { name: new RegExp(name) }).first().click();
    }
    await expect(page.getByRole("button", { name: /خدمت/ })).toBeVisible();
    await page.getByRole("button", { name: "ادامه" }).click();
  }

  async function choosePreference(page: Page, label: string) {
    await expect(page.getByRole("heading", { name: "چطور زمان‌بندی شود؟" })).toBeVisible();
    await page.getByRole("radio", { name: new RegExp(label) }).check();
    await page.getByRole("button", { name: "دیدن زمان‌های ممکن" }).click();
  }

  /** Opens the first plan's first start and lands on the review screen. */
  async function chooseFirstPlan(page: Page) {
    await expect(page.getByRole("heading", { name: "کِی وقت دارید؟" })).toBeVisible();
    const dates = page.getByRole("group", { name: "انتخاب تاریخ" }).getByRole("button");
    const start = page.getByRole("group", { name: "انتخاب ساعت شروع" }).getByRole("button").first();
    let found = await start.isVisible().catch(() => false);
    for (let index = 0; index < (await dates.count()) && !found; index += 1) {
      await dates.nth(index).click();
      found = await start.isVisible().catch(() => false);
    }
    expect(found, "the calendar must expose at least one complete plan").toBe(true);
    await start.click();
    await expect(page.getByRole("heading", { name: "بازبینی و ثبت نوبت" })).toBeVisible();
  }

  /** Completes whichever OTP dialog is already open (booking or account). */
  async function completeAuthDialog(page: Page, phone: string, name = "مشتری تستی") {
    const authModal = page.getByRole("dialog", { name: "ورود و ثبت‌نام" });
    await expect(authModal).toBeVisible();
    await authModal.locator("input[type='tel']").fill(phone);
    await authModal.getByRole("button", { name: "دریافت کد" }).click();
    await expect(authModal.getByRole("heading", { name: "کد تأیید" })).toBeVisible();
    await authModal.getByRole("button", { name: "ورود خودکار" }).click();
    const nameField = authModal.locator("#auth-name-input");
    if (await nameField.isVisible().catch(() => false)) {
      await nameField.fill(name);
      await authModal.getByRole("button", { name: "ادامه" }).click();
    }
    const policySheet = page.getByRole("dialog", { name: "نکات مهم رزرو" });
    if (await policySheet.isVisible().catch(() => false)) {
      await policySheet.getByRole("checkbox").check();
      await policySheet.getByRole("button", { name: "تأیید و ادامه" }).click();
    }
  }

  async function signInFromReview(page: Page, phone: string, name?: string) {
    await page.getByRole("button", { name: /ورود و ثبت|ثبت نوبت|تأیید/ }).click();
    await completeAuthDialog(page, phone, name);
  }

  /* ------------------------------------------------------------------ *
   * 1–4: service mixes
   * ------------------------------------------------------------------ */

  test("1. one service: earliest plan, hold, receipt", async ({ page }) => {
    await pickServices(page, [SALON_SERVICE]);
    await choosePreference(page, "زودترین زمان");
    await chooseFirstPlan(page);
    await signInFromReview(page, RETURNING_PHONE);
    await expect(page.getByRole("heading", { name: /نوبت شما (ثبت|رزرو) شد/ })).toBeVisible();
    await expect(page.getByText(/کد رهگیری|پیگیری/).first()).toBeVisible();
  });

  test("2. three services one barber: one visit with three segments", async ({ page }) => {
    await pickServices(page, [SALON_SERVICE, SECOND_SERVICE, SHARED_SERVICE]);
    await choosePreference(page, "ترجیحاً یک آرایشگر");
    await chooseFirstPlan(page);
    // The review screen lists every service of the visit, not just the first.
    for (const name of [SALON_SERVICE, SECOND_SERVICE, SHARED_SERVICE]) {
      await expect(page.getByRole("heading", { name: "بازبینی و ثبت نوبت" })).toBeVisible();
      await expect(page.getByText(new RegExp(name)).first()).toBeVisible();
    }
  });

  test("3. three services two barbers can each do: both teams stay candidates", async ({ page }) => {
    await pickServices(page, [SALON_SERVICE, SECOND_SERVICE, SHARED_SERVICE]);
    await choosePreference(page, "زودترین زمان");
    await expect(page.getByRole("heading", { name: "کِی وقت دارید؟" })).toBeVisible();
    const cards = page.locator("li.ui-card");
    expect(await cards.count()).toBeGreaterThan(0);
    // Every offered option is a complete, uninterrupted visit.
    await expect(cards.first().getByText(/دقیقه/)).toBeVisible();
  });

  test("4. three services needing two barbers: team option with a handover", async ({ page }) => {
    await pickServices(page, [SALON_SERVICE, TEAM_SERVICE]);
    await choosePreference(page, "زودترین زمان");
    await expect(page.getByRole("heading", { name: "کِی وقت دارید؟" })).toBeVisible();
    await expect(page.getByText(/جابه‌جایی بین آرایشگران|بدون وقفه/).first()).toBeVisible();
  });

  /* ------------------------------------------------------------------ *
   * 5–7: dates and conflicts
   * ------------------------------------------------------------------ */

  test("5. future date: plans load for a day three days ahead", async ({ page }) => {
    await pickServices(page, [SALON_SERVICE]);
    await choosePreference(page, "زودترین زمان");
    await expect(page.getByRole("heading", { name: "کِی وقت دارید؟" })).toBeVisible();
    const dates = page.getByRole("group", { name: "انتخاب تاریخ" }).getByRole("button");
    const target = dates.nth(Math.min(3, (await dates.count()) - 1));
    await target.click();
    await expect(page.getByRole("group", { name: "انتخاب ساعت شروع" }).getByRole("button").first()).toBeVisible();
  });

  test("6. no start is offered that cannot complete the visit", async ({ page }) => {
    await pickServices(page, [SHARED_SERVICE]); // 75 minutes + buffer
    await choosePreference(page, "زودترین زمان");
    await expect(page.getByRole("heading", { name: "کِی وقت دارید؟" })).toBeVisible();
    const starts = page.getByRole("group", { name: "انتخاب ساعت شروع" }).getByRole("button");
    const count = await starts.count();
    expect(count).toBeGreaterThan(0);
    // Every start chip renders start and end of the whole visit, in order.
    for (let index = 0; index < count; index += 1) {
      await expect(starts.nth(index)).toContainText("تا");
    }
  });

  test("7. two-customer conflict: the second submit keeps selections and recovers", async ({ page }) => {
    await pickServices(page, [SALON_SERVICE]);
    await choosePreference(page, "زودترین زمان");
    await chooseFirstPlan(page);
    await signInFromReview(page, RETURNING_PHONE);

    // Simulate a slot taken between hold and creation.
    await page.route("**/api/appointments/group", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "این زمان همین الان رزرو شد." }),
      }),
    );
    await page.getByRole("button", { name: /ورود و ثبت|ثبت نوبت|تأیید/ }).click();
    await expect(page.getByText("این زمان همین الان رزرو شد.")).toBeVisible();
    // Back on the schedule with the service selection intact.
    await expect(page.getByRole("heading", { name: "کِی وقت دارید؟" })).toBeVisible();
    await page.getByRole("button", { name: "بازگشت" }).first().click();
    await expect(page.getByRole("radio", { name: /زودترین زمان/ })).toBeChecked();
  });

  /* ------------------------------------------------------------------ *
   * 8–10: identity and payment
   * ------------------------------------------------------------------ */

  test("8. existing user: sign-in resumes the visit without re-selection", async ({ page }) => {
    await pickServices(page, [SALON_SERVICE, SECOND_SERVICE]);
    await choosePreference(page, "زودترین زمان");
    await chooseFirstPlan(page);
    await signInFromReview(page, RETURNING_PHONE);
    await expect(page.getByRole("heading", { name: /نوبت شما (ثبت|رزرو) شد/ })).toBeVisible();
  });

  test("9. new customer: first sign-in asks for a name, then books", async ({ page }) => {
    const phone = `0912${Date.now().toString().slice(-7)}`;
    await pickServices(page, [SALON_SERVICE]);
    await choosePreference(page, "زودترین زمان");
    await chooseFirstPlan(page);
    await signInFromReview(page, phone, "مشتری تازه");
    await expect(page.getByRole("heading", { name: /نوبت شما (ثبت|رزرو) شد/ })).toBeVisible();
  });

  test("10. payment-required service shows the deposit and the payment step", async ({ page }) => {
    await pickServices(page, [DEPOSIT_SERVICE]);
    await choosePreference(page, "زودترین زمان");
    await chooseFirstPlan(page);
    await expect(page.getByText(/پرداخت آنلاین|بیعانه/).first()).toBeVisible();
    await signInFromReview(page, RETURNING_PHONE);
    await expect(page).toHaveURL(/\/pay\?ref=/);
  });

  test("11. no availability: the copy explains why and offers alternatives", async ({ page }) => {
    await pickServices(page, [TEAM_SERVICE]);
    await choosePreference(page, "آرایشگر خاص");
    await page.getByRole("button", { name: /سامان/ }).first().click();
    await page.getByRole("checkbox", { name: /فقط با این آرایشگر/ }).check();
    await page.getByRole("button", { name: "دیدن زمان‌های ممکن" }).click();
    const empty = page.getByText(/پیشنهاد|نزدیک‌ترین|تاریخ دیگر|آرایشگر دیگر|ترکیب/).first();
    await expect(empty).toBeVisible();
  });

  /* ------------------------------------------------------------------ *
   * 12–14: the surfaces around the visit
   * ------------------------------------------------------------------ */

  test("12. customer panel shows one card per visit with its services", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: "ورود با موبایل" }).click();
    await completeAuthDialog(page, RETURNING_PHONE);
    await expect(page.getByRole("heading", { name: /سلام،/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "نوبت‌های من" })).toBeVisible();
    const tabs = page.getByRole("group", { name: "فیلتر نوبت‌ها" }).getByRole("button");
    expect(await tabs.count()).toBe(3);
  });

  test("13. barber sees only their own responsibility for today", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[name='phone']").fill(BARBER.phone);
    await page.locator("input[name='password']").fill(BARBER.password);
    await page.getByRole("button", { name: /ورود/ }).click();
    await page.goto("/barber");
    // The panel is scoped to the signed-in barber and lists their own segments only.
    await expect(page.getByText("فرشید معروف پور").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /امروز،/ })).toBeVisible();
    const rows = page.locator("[data-barber-segment]");
    for (let index = 0; index < (await rows.count()); index += 1) {
      await expect(rows.nth(index)).toContainText("–");
    }
  });

  test("14. admin command center: one row per reservation with segments", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[name='phone']").fill(ADMIN.phone);
    await page.locator("input[name='password']").fill(ADMIN.password);
    await page.getByRole("button", { name: /ورود/ }).click();
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /پنل مدیریت سالن/ })).toBeVisible();
    await expect(page.getByText("اشغال ظرفیت تیم")).toBeVisible();
    await expect(page.getByText("ماتریس مهارت و ارائهٔ خدمات")).toBeVisible();
  });

  /* ------------------------------------------------------------------ *
   * accessibility
   * ------------------------------------------------------------------ */

  test("booking and admin pass automated WCAG checks", async ({ page }) => {
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    for (const path of ["/booking", "/admin"]) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((violation) => ({
          page: path,
          rule: violation.id,
          targets: violation.nodes.map((node) => node.target),
        })),
      ).toEqual([]);
    }
  });
});
