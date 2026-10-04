import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sweepExpiredPending } from "@/lib/appointment-lifecycle";
import { appointments, barbers, services } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  await sweepExpiredPending(db);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "برای پیگیری، با شماره موبایل وارد شوید." }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "کد رهگیری یا شماره موبایل خود را وارد کنید." }, { status: 400 });
  if (!rateLimit(`track:${user.id}`, 30, 60_000)) return NextResponse.json({ error: "درخواست‌های مکرر؛ کمی صبر کنید." }, { status: 429 });
  const isPhone = /^09\d{9}$/.test(q);
  const code = !isPhone && /^\d{1,10}$/.test(q) ? Number(q) : NaN;
  const isId = Number.isSafeInteger(code) && code > 0 && code <= 2147483647;
  if (!isPhone && !isId) return NextResponse.json({ error: "شماره ۱۱رقمی یا کد رهگیری عددی وارد کنید." }, { status: 400 });
  const staff = isStaff(user);
  if (isPhone && q !== user.phone && !staff) return NextResponse.json({ error: "به این نوبت‌ها دسترسی ندارید." }, { status: 403 });
  try {
    const own = staff ? undefined : eq(appointments.clientPhone, user.phone);
    const criteria = isId ? and(eq(appointments.id, code), own) : and(eq(appointments.clientPhone, q), own);
    const rows = await db.select({ id: appointments.id, clientName: appointments.clientName, date: appointments.date, startMin: appointments.startMin, endMin: appointments.endMin, priceSnapshot: appointments.priceSnapshot, status: appointments.status, createdAt: appointments.createdAt, barberName: barbers.name, barberTitle: barbers.title, barberSlug: barbers.slug, serviceId: services.id, serviceName: services.name })
      .from(appointments).innerJoin(barbers, eq(barbers.id, appointments.barberId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(criteria).orderBy(desc(appointments.date), desc(appointments.startMin)).limit(15);
    return NextResponse.json({ items: rows.map((row) => ({ ...row, clientPhoneMasked: (staff && isPhone ? q : user.phone).replace(/^(\d{4})\d{4}(\d{3})$/, "$1****$2") })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "پیگیری انجام نشد؛ دوباره تلاش کنید." }, { status: 503 });
  }
}
