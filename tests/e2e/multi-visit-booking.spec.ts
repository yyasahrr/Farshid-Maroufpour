import { expect, test, type Page } from "@playwright/test";

/**
 * Contract tests for the multi-service visit flow (§23-26, §62 of the brief):
 * one start time for the whole visit, continuous server-built segments,
 * a real barber step BEFORE the time, identity only at the LAST review step
 * (guest auto-account or code login — never a modal in between), holds keyed
 * by phone that survive login, and combination rules resolved by auto-swap.
 */

async function pickServices(page: Page, names: string[]) {
  for (const name of names) {
    await page.getByRole("switch", { name: `انتخاب ${name}` }).click();
  }
}

/** services → barber (default: any) → time → lands on the review step */
async function toReview(page: Page) {
  await page.getByRole("button", { name: "انتخاب آرایشگر" }).click();
  await page.getByRole("button", { name: "انتخاب زمان" }).click();
  const days = page.locator("button.bk-day");
  const count = await days.count();
  for (let day = 0; day < count; day += 1) {
    await days.nth(day).click();
    const time = page.locator("button.bk-time:not([disabled])").first();
    if (await time.isVisible().catch(() => false)) {
      await time.click();
      return;
    }
  }
  throw new Error("no selectable time found across visible week");
}

test("haircut + beard merge into one continuous visit on one barber (guest checkout)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/booking");
  await expect(page.getByRole("heading", { name: "چه خدمتی می‌خواهید؟" })).toBeVisible();
  await expect(
    page.getByText("نگران ساعت جداگانه نباشید — شما فقط یک ساعت شروع انتخاب می‌کنید"),
  ).toBeVisible();

  await pickServices(page, ["اصلاح مو", "اصلاح و طراحی ریش"]);
  await expect(page.getByText("۲ خدمت · ۷۵ دقیقه")).toBeVisible();

  // barber step comes BEFORE the time and every card states its coverage
  await page.getByRole("button", { name: "انتخاب آرایشگر" }).click();
  await expect(page.getByRole("heading", { name: "با چه آرایشگری؟" })).toBeVisible();
  await expect(page.getByRole("group", { name: "انتخاب آرایشگر" }).locator("[data-barber-card]").first()).toBeVisible();

  await page.getByRole("button", { name: "انتخاب زمان" }).click();
  const days = page.locator("button.bk-day");
  const count = await days.count();
  for (let day = 0; day < count; day += 1) {
    await days.nth(day).click();
    const time = page.locator("button.bk-time:not([disabled])").first();
    if (await time.isVisible().catch(() => false)) {
      await time.click();
      break;
    }
  }

  // step 3 — server plan on review: one visit, same barber for the cluster
  await expect(page.getByText("یک نوبت · ۷۵ دقیقه")).toBeVisible();
  const barberLinks = page.locator(".bk-seg a[data-segment-barber]");
  await expect(barberLinks).toHaveCount(2);
  const [first, second] = await Promise.all([
    barberLinks.nth(0).getAttribute("data-segment-barber"),
    barberLinks.nth(1).getAttribute("data-segment-barber"),
  ]);
  expect(first).toBe(second);

  // identity is asked for LAST, on this very page — as tabs, not a modal
  await expect(page.getByRole("tab", { name: "مشتری جدید" })).toHaveAttribute("aria-selected", "true");
  const uniquePhone = `0931${String(Date.now()).slice(-7)}`;
  await page.getByLabel("نام کامل").fill("کاربر رزرو");
  await page.getByLabel("شماره تلفن همراه").fill(uniquePhone);

  const pay = page.getByRole("button", { name: "تأیید و ثبت نوبت" }).or(page.getByRole("button", { name: "ثبت رزرو و پرداخت" }));
  await pay.first().click();

  // a brand-new guest account accepts the current policy once, in the sheet
  const policy = page.locator("dialog").filter({ hasText: "نکات مهم رزرو" });
  if (await policy.isVisible().catch(() => false)) {
    await policy.getByText("این موارد را مطالعه کردم و می‌پذیرم").click();
    await policy.getByRole("button", { name: "تأیید و ادامه" }).click();
  }

  await expect(page.getByRole("heading", { name: "رزرو شما ثبت شد" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("حساب کاربری تو با همین شمارهٔ موبایل ساخته/به‌روزرسانی شد")).toBeVisible();
});

test("forbidden pair auto-swaps with the salon's own reason (both directions)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/booking");
  await pickServices(page, ["اصلاح مو"]);

  const comboSwitch = page.getByRole("switch", { name: "انتخاب پکیج مو و ریش" });
  await expect(comboSwitch).toBeEnabled(); // no dead-end blocking anymore
  await comboSwitch.click();
  await expect(page.getByRole("switch", { name: "انتخاب اصلاح مو" })).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("[data-swap-note]")).toContainText("نیازی به رزرو جداگانه نیست");

  // and back: picking the haircut again auto-drops the package
  await page.getByRole("switch", { name: "انتخاب اصلاح مو" }).click();
  await expect(comboSwitch).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("[data-swap-note]")).toContainText("پکیج مو و ریش");
});

test("a registered phone is routed to code login instead of re-registering", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/booking");
  await pickServices(page, ["اصلاح مو"]);
  await toReview(page);

  await page.getByLabel("نام کامل").fill("مهمان تکراری");
  await page.getByLabel("شماره تلفن همراه").fill("09129998877");
  const pay = page.getByRole("button", { name: "تأیید و ثبت نوبت" }).or(page.getByRole("button", { name: "ثبت رزرو و پرداخت" }));
  await pay.first().click();

  // the wizard must hand this number to the OTP tab — never create a twin account
  await expect(page.getByRole("tab", { name: "قبلاً ثبت‌نام کرده‌ام" })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  await expect(page.locator("[data-tab-error]")).toContainText("قبلاً ثبت‌نام");
  await expect(page.getByRole("heading", { name: "چه خدمتی می‌خواهید؟" })).toHaveCount(0);
});
