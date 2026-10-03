import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPayment, verifyPaymentSignature } from "@/lib/payments";

const Schema = z.object({
  reference: z.string().trim().min(4).max(80),
  providerStatus: z.enum(["OK", "FAILED"]),
});

/**
 * Gateway webhook. A redirect from the provider never marks a payment as paid;
 * only a correctly signed server-to-server request can change the state.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });

  const { reference, providerStatus } = parsed.data;
  const signature = request.headers.get("x-gateway-signature");
  if (!verifyPaymentSignature(reference, providerStatus, signature)) {
    return NextResponse.json({ error: "امضای نامعتبر" }, { status: 403 });
  }

  const result = await verifyPayment(reference, providerStatus);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json(result);
}
