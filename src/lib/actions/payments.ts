"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, classRegistrations, courseEnrollments, payments } from "@/db/schema";
import { verifyPayment } from "@/lib/payments";
import { getCurrentUser } from "@/lib/session";
import { isPaymentDemoMode } from "@/lib/preview";

export type PayResult = { ok: boolean; message: string };

/** Explicit preview-only payment adapter; a real gateway must call the signed webhook. */
export async function processPaymentAction(_prev: PayResult | null, formData: FormData): Promise<PayResult> {
  if (!isPaymentDemoMode()) return { ok: false, message: "درگاه پرداخت در این محیط پیکربندی نشده است." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "برای پرداخت ابتدا وارد حساب خود شوید." };
  const reference = String(formData.get("reference") ?? "").trim();
  const outcome = formData.get("outcome") === "OK" ? "OK" : "FAILED";
  if (!/^([A-Z]{2}-\d+-[a-zA-Z0-9-]{6,70})$/.test(reference))
    return { ok: false, message: "شناسه پرداخت نامعتبر است." };
  const [row] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
  if (!row) return { ok: false, message: "پرداخت یافت نشد." };
  if (row.kind === "APPOINTMENT" || row.kind === "APPOINTMENT_GROUP") {
    const [appt] = await db.select({ phone: appointments.clientPhone }).from(appointments)
      .where(eq(appointments.id, row.refId)).limit(1);
    if (!appt || appt.phone !== user.phone) return { ok: false, message: "دسترسی به این پرداخت ندارید." };
  } else if (row.kind === "CLASS") {
    const [registration] = await db.select({ phone: classRegistrations.studentPhone }).from(classRegistrations)
      .where(eq(classRegistrations.id, row.refId)).limit(1);
    if (!registration || registration.phone !== user.phone) return { ok: false, message: "دسترسی به این پرداخت ندارید." };
  } else if (row.kind === "COURSE") {
    const [enrollment] = await db.select({ userId: courseEnrollments.userId }).from(courseEnrollments)
      .where(eq(courseEnrollments.id, row.refId)).limit(1);
    if (!enrollment || enrollment.userId !== user.id) return { ok: false, message: "دسترسی به این پرداخت ندارید." };
  } else return { ok: false, message: "نوع پرداخت نامعتبر است." };

  if (row.status === "FAILED") await db.update(payments).set({ status: "PENDING" }).where(eq(payments.id, row.id));
  const result = await verifyPayment(reference, outcome);
  revalidatePath("/pay");
  revalidatePath("/account");
  if ("error" in result) return { ok: false, message: result.error };
  if (result.status === "PAID")
    return {
      ok: true,
      message:
        row.kind === "COURSE"
          ? "پرداخت آزمایشی تأیید شد. ثبت‌نام شما در دوره قطعی است."
          : "پرداخت آزمایشی تأیید شد. نوبت شما قطعی است.",
    };
  if (result.status === "FAILED") return { ok: false, message: "پرداخت ناموفق بود؛ در صورت باقی‌بودن مهلت، دوباره تلاش کنید." };
  return { ok: false, message: "این پرداخت دیگر قابل انجام نیست." };
}
