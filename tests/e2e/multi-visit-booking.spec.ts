import { expect, test, type Page } from "@playwright/test";

/**
 * Contract tests for the multi-service visit flow (§23-26, §62 of the brief):
 * one start time for the whole visit, continuous server-built segments,
 * login only at the commit point, hold over the whole plan, and
 * combination rules (forbidden / same-barber) surfaced from DB policy.
 */

async function pickServices(page: Page, names: string[]) {
  for (const name of names) {
    await page.getByRole("switch", { name: `انتخاب ${name}` }).click();
  }
}

async function pickFirstAvailableTime(page: Page) {
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

test("haircut + beard merge into one continuous visit on one barber", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/booking");
  await expect(page.getByRole("heading", { name: "چه خدمتی می‌خواهید؟" })).toBeVisible();
  await expect(
    page.getByText("نگران ساعت جداگانه نباشید — شما فقط یک ساعت شروع انتخاب می‌کنید"),
  ).toBeVisible();

  await pickServices(page, ["اصلاح مو", "اصلاح و طراحی ریش"]);
  await expect(page.getByText("۲ خدمت · ۷۵ دقیقه")).toBeVisible();

  await pickFirstAvailableTime(page);

  // step 2 — server plan: one visit, same barber for the cluster
  await expect(page.getByText("یک نوبت · ۷۵ دقیقه")).toBeVisible();
  const barberLinks = page.locator(".bk-seg a[data-segment-barber]");
  await expect(barberLinks).toHaveCount(2);
  const [first, second] = await Promise.all([barberLinks.nth(0).getAttribute("data-segment-barber"), barberLinks.nth(1).getAttribute("data-segment-barber")]);
  expect(first).toBe(second);

  // login at the commit point, with the plan already validated
  await page.getByRole("button", { name: "ورود / ساخت حساب و ادامه" }).click();
  const auth = page.locator("dialog");
  await auth.getByPlaceholder("0912 345 6789").fill("09129998877");
  await auth.getByRole("button", { name: "کد تأیید" }).click();
  await auth.getByLabel("شش رقم کد تأیید").fill("123456");
  await auth.getByRole("button", { name: "ورود / ثبت‌نام" }).click();

  // a returning account already has a recorded policy acceptance; a fresh one gets the sheet
  const policy = page.locator("dialog").filter({ hasText: "نکات مهم رزرو" });
  if (await policy.isVisible().catch(() => false)) {
    await policy.getByText("این موارد را مطالعه کردم و می‌پذیرم").click();
    await policy.getByRole("button", { name: "تأیید و ادامه" }).click();
  }

  // hold covers the whole plan, with a countdown — not a single slot
  await expect(page.getByRole("status").filter({ hasText: "این زمان موقتاً برای کل نوبت شما نگه داشته شده است" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("زمان نوبت").locator("xpath=following-sibling::*[1]")).toContainText("–");

  await page.getByRole("button", { name: "تأیید و ثبت نوبت" }).click();
  await expect(page.getByRole("heading", { name: "رزرو شما ثبت شد" })).toBeVisible({ timeout: 30_000 });
});

test("forbidden combination is blocked with the salon's own reason", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/booking");
  await pickServices(page, ["اصلاح مو"]);
  const comboSwitch = page.getByRole("switch", { name: "انتخاب پکیج مو و ریش" });
  await expect(comboSwitch).toBeDisabled();
  await expect(
    page.getByText("پکیج مو و ریش خودش شامل اصلاح مو و ریش است؛ نیازی به رزرو جداگانه نیست."),
  ).toBeVisible();
});
