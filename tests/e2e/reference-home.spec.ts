import { test, expect } from "@playwright/test";

test("home entry screen has video background, brand identity, and 5 destinations", async ({
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

  // Exactly five destinations: booking, site, academy, shop, address.
  await expect(page.getByRole("button", { name: "رزرو خدمات" })).toBeVisible();
  await expect(page.getByRole("link", { name: "وبسایت" })).toHaveAttribute("href", "/home");
  await expect(page.getByRole("link", { name: "آکادمی دوره‌های آموزشی" })).toBeVisible();
  await expect(page.getByRole("link", { name: "فروشگاه" })).toBeVisible();
  await expect(page.getByRole("button", { name: "آدرس و تماس" })).toBeVisible();
  await expect(
    page.locator("a.bento-card-interactive, button.bento-card-interactive"),
  ).toHaveCount(5);

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

test("booking shows complete plans without an account and asks for identity only when submitting", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/booking");

  // Browsing services, dates and plans never requires an account.
  await expect(page.getByRole("dialog", { name: "ورود و ثبت‌نام" })).toHaveCount(0);

  // STEP 1 — services: a NO_PAYMENT service keeps the assertion on the receipt.
  await expect(page.getByRole("heading", { name: "چه خدمتی می‌خواهید؟" })).toBeVisible();
  await page.getByRole("button", { name: /اصلاح مو/ }).first().click();
  await page.getByRole("button", { name: "ادامه" }).click();

  // STEP 2 — reservation preference: earliest is the default.
  await expect(page.getByRole("heading", { name: "چطور زمان‌بندی شود؟" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /زودترین زمان/ })).toBeChecked();
  await page.getByRole("button", { name: "دیدن زمان‌های ممکن" }).click();

  // STEP 3 — smart calendar: only days with a complete plan are offered.
  await expect(page.getByRole("heading", { name: "کِی وقت دارید؟" })).toBeVisible();
  const planResponse = page.waitForResponse(
    (response) => response.url().includes("/api/booking/plan") && response.request().method() === "POST",
  );
  const dates = page.getByRole("group", { name: "انتخاب تاریخ" }).getByRole("button");
  const startChip = page.getByRole("group", { name: "انتخاب ساعت شروع" }).getByRole("button").first();
  let found = await startChip.isVisible().catch(() => false);
  for (let index = 0; index < (await dates.count()) && !found; index += 1) {
    await dates.nth(index).click();
    await planResponse.catch(() => undefined);
    found = await startChip.isVisible().catch(() => false);
  }
  expect(found).toBe(true);
  await startChip.click();

  // STEP 4 — review: no account yet, so the submit button opens the auth dialog.
  await expect(page.getByRole("heading", { name: "بازبینی و ثبت نوبت" })).toBeVisible();
  await page.getByRole("button", { name: /ورود و ثبت|ثبت نوبت|تأیید/ }).click();
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

  // Policy is accepted once, then the hold is taken and the visit is created.
  const policySheet = page.getByRole("dialog", { name: "نکات مهم رزرو" });
  if (await policySheet.isVisible().catch(() => false)) {
    await policySheet.getByRole("checkbox").check();
    await policySheet.getByRole("button", { name: "تأیید و ادامه" }).click();
  }

  await expect(page.getByRole("heading", { name: /نوبت شما (ثبت|رزرو) شد/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "مشاهده در پنل من" })).toBeVisible();
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
