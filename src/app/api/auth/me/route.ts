import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { hasAcceptedPolicy, POLICY_CURRENT_VERSION } from "@/lib/auth-otp";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      policyAccepted: false,
      policyVersion: POLICY_CURRENT_VERSION,
    });
  }

  const policyAccepted = await hasAcceptedPolicy(user.id, POLICY_CURRENT_VERSION);

  return NextResponse.json({
    authenticated: true,
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role, roles: user.roles },
    policyAccepted,
    policyVersion: POLICY_CURRENT_VERSION,
  });
}
