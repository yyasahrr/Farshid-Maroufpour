import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");

  let query = db.select().from(products);
  if (category && category !== "ALL" && category !== "همه") {
    query = db.select().from(products).where(eq(products.category, category)) as typeof query;
  }

  const items = await query.orderBy(desc(products.id));
  return NextResponse.json({ items });
}
