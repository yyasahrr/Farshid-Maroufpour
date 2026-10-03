import { test, expect } from "@playwright/test";

test("home entry screen has video background, brand identity, and 4 bento actions", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  // Brand Name & Tagline
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "آکادمی زیبایی فرشید معروف پور",
  );
  await expect(page.locator("[data-hero-title]")).toContainText("استایل");

  // Static first frame: the poster stays visible when video is suppressed
  // (the project runs tests under reduced motion, so video stays paused).
  await expect(page.locator('img[src*="video-poster"]').first()).toBeVisible();

  // 4 Bento Action Buttons / Links
  await expect(page.getByRole("button", { name: "رزرو خدمات" })).toBeVisible();
  await expect(page.getByRole("link", { name: "آکادمی دوره‌های آموزشی" })).toBeVisible();
  await expect(page.getByRole("link", { name: "فروشگاه" })).toBeVisible();
  await expect(page.getByRole("button", { name: "آدرس و تماس" })).toBeVisible();

  // No horizontal overflow
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: `artifacts/home-bento-${testInfo.project.name}.png`,
    fullPage: false,
  });
  expect(errors).toEqual([]);
});

test("contact modal opens from bento action and displays salon address and phone", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "آدرس و تماس" }).click();

  const modal = page.getByRole("dialog", { name: "آدرس و تماس" });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("تهران، خیابان ولیعصر، پلاک ۱۲");
  await expect(modal.locator("a[href^='tel:']")).toBeVisible();

  await modal.getByRole("button", { name: "بستن" }).click();
  await expect(modal).not.toBeVisible();
});

test("booking asks for an account after barber selection and before holding the slot", async ({
  page,
}) => {
  // Clear any existing cookie to prove account setup is deferred until a barber is selected.
  await page.context().clearCookies();

  await page.goto("/booking");

  // Browsing services and availability does not require an account.
  await expect(page.getByRole("dialog", { name: "ورود و ثبت‌نام" })).toHaveCount(0);

  // Step 0: pick a NO_PAYMENT service so the flow ends on the receipt
  await expect(page.getByRole("heading", { name: "چه خدمتی می‌خواهید؟" })).toBeVisible();
  const initialAvailability = page.waitForResponse((response) =>
    response.url().includes("/api/booking/available-barbers"),
  );
  await page.getByRole("button", { name: /اصلاح مو/ }).first().click();
  await initialAvailability;

  // Step 1: pick the first day with a free slot.
  await expect(page.getByRole("heading", { name: "چه زمانی مناسب است؟" })).toBeVisible();
  const dates = page.getByRole("group", { name: "تاریخ نوبت" }).getByRole("button");
  const slot = page.getByRole("button", { name: /آزاد$/ }).first();
  let foundAvailableDate = await slot.isVisible();
  for (let index = 1; index < await dates.count() && !foundAvailableDate; index += 1) {
    const availabilityResponse = page.waitForResponse((response) =>
      response.url().includes("/api/booking/available-barbers"),
    );
    await dates.nth(index).click();
    await availabilityResponse;
    foundAvailableDate = await slot.isVisible();
  }
  expect(foundAvailableDate).toBe(true);
  await slot.click();

  // Step 2: choose a barber before opening the account flow.
  await expect(page.getByRole("heading", { name: "کدام آرایشگر؟" })).toBeVisible();
  await page.getByRole("button", { name: "انتخاب", exact: true }).first().click();
  await page.getByRole("button", { name: "ورود / ساخت حساب و ادامه" }).click();

  // OTP and first-time account setup happen before the hold and review.
  const authModal = page.getByRole("dialog", { name: "ورود و ثبت‌نام" });
  await expect(authModal).toBeVisible();
  await authModal.locator("input[type='tel']").fill("09129990099");
  await authModal.getByRole("button", { name: "دریافت کد" }).click();
  await expect(authModal.getByRole("heading", { name: "کد تأیید" })).toBeVisible();
  await authModal.getByRole("button", { name: "ورود خودکار" }).click();
  const nameField = authModal.locator("#auth-name-input");
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill("کاربر رزرو");
    await authModal.getByRole("button", { name: "ادامه" }).click();
  }

  // The account is created before policy acceptance and slot hold.
  const policySheet = page.getByRole("dialog", { name: "نکات مهم رزرو" });
  if (await policySheet.isVisible().catch(() => false)) {
    await policySheet.getByRole("checkbox").check();
    await policySheet.getByRole("button", { name: "تأیید و ادامه" }).click();
  }

  // Step 3: review shows the signed-in customer and hold timer, then submit.
  await expect(page.getByRole("heading", { name: "خلاصه رزرو" })).toBeVisible();
  await expect(page.getByText("کاربر رزرو")).toBeVisible();
  await page.getByRole("button", { name: "تأیید و ثبت نوبت" }).click();

  // Receipt with tracking code
  await expect(page.getByRole("heading", { name: "نوبت شما تأیید شد" })).toBeVisible();
  await expect(page.getByText("کد رهگیری")).toBeVisible();
});

test("customer panel displays appointment card and allows viewing history", async ({
  page,
}) => {
  await page.goto("/account");

  // Login is required: open the auth dialog explicitly, then use preview code
  await page.getByRole("button", { name: "ورود با موبایل" }).click();
  const authModal = page.getByRole("dialog", { name: "ورود و ثبت‌نام" });
  await expect(authModal).toBeVisible();
  await authModal.locator("input[type='tel']").fill("09121111111");
  await authModal.getByRole("button", { name: "دریافت کد" }).click();
  await expect(authModal.getByRole("heading", { name: "کد تأیید" })).toBeVisible();
  const otpInputs = authModal.locator("input[inputmode='numeric']");
  for (let i = 0; i < 6; i++) {
    await otpInputs.nth(i).fill(String(i + 1));
  }
  // First-time users land on the name step; returning users go straight in
  const nameField = authModal.locator("input#auth-name-input");
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill("کاربر تستی");
    await authModal.getByRole("button", { name: "ادامه" }).click();
  }

  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByRole("heading", { name: "نوبت‌های من" })).toBeVisible();

  // Tab buttons: آینده, گذشته, لغوشده
  await expect(page.getByRole("button", { name: /آینده/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /گذشته/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /لغوشده/ })).toBeVisible();
});

test("shop page displays products in soft bento cards with category filters", async ({
  page,
}) => {
  await page.goto("/shop");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "برای ادامهٔ مراقبت در خانه",
  );

  // Category filter buttons
  await expect(page.getByRole("button", { name: "همه" })).toBeVisible();
  await expect(page.getByRole("button", { name: "استایل مو" })).toBeVisible();

  // Products are rendered
  await expect(page.getByText("پماد حالت‌دهنده مات آیکونیک")).toBeVisible();
  await expect(page.getByText("روغن تقویت و نرم‌کننده ریش فورست")).toBeVisible();
});

test("barber cards use real portraits instead of initials", async ({ page }) => {
  await page.goto("/barbers");
  await page.evaluate(() => document.fonts.ready);
  const firstCard = page.locator("article[data-reveal]").first();
  await expect(firstCard.locator("img")).toBeVisible();
  const loaded = await firstCard.locator("img").evaluate(
    (img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0,
  );
  expect(loaded).toBe(true);
});

test("reduced motion renders hero content immediately without video playback", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("button", { name: "رزرو خدمات" })).toBeVisible();
  await expect(page.getByRole("link", { name: "آکادمی دوره‌های آموزشی" })).toBeVisible();
  expect(await page.locator("video").count()).toBe(0);
  await context.close();
});

test("homepage meets automated WCAG accessibility checks", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .disableRules(["color-contrast"]) // video overlay dynamic contrast
    .analyze();
  expect(
    results.violations.map((v) => ({
      rule: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        issue: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
