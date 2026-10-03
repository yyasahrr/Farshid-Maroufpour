import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

const ProfileSchema = z.object({
  name: z.string().trim().min(2, "نام و نام خانوادگی باید حداقل ۲ حرف باشد.").max(80),
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "ابتدا باید وارد حساب شوید." }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "اطلاعات واردشده نامعتبر است." },
      { status: 400 },
    );
  }

  const name = parsed.data.name;
  await db.update(users).set({ name }).where(eq(users.id, currentUser.id));

  return NextResponse.json({
    ok: true,
    user: {
      ...currentUser,
      name,
    },
  });
}
