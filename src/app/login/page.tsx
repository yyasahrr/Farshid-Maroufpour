import { redirect } from "next/navigation";
import { getCurrentUser, landingPathFor } from "@/lib/session";
import { demoStaffCredentials } from "@/lib/preview";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "ورود به پنل کارکنان" };

/**
 * Staff portal sign-in. Already-authenticated visitors are sent straight to the
 * panel for their role, and preview-only demo logins are listed only while the
 * preview flags are enabled.
 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(landingPathFor(user.role));

  return <LoginForm demoCredentials={demoStaffCredentials()} />;
}
