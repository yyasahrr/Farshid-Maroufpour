import previewConfig from "../../preview.config.json";

type PreviewConfig = {
  otpDemoMode: boolean;
  otpDemoPhones: string[];
  paymentDemoMode: boolean;
};

const config = previewConfig as PreviewConfig;

/**
 * Preview scaffolding only. A real deployment configures OTP delivery through
 * OTP_SMS_WEBHOOK_URL and payments through a real gateway, and these helpers
 * return false so every demo branch stays inert.
 */
export function isOtpDemoMode(): boolean {
  return process.env.OTP_DEMO_MODE === "true" || config.otpDemoMode === true;
}

export function isPaymentDemoMode(): boolean {
  return process.env.PAYMENT_DEMO_MODE === "true" || config.paymentDemoMode === true;
}

export function demoPhones(): string[] {
  const fromEnv = (process.env.OTP_DEMO_PHONES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : config.otpDemoPhones;
}

/** First number the login UI suggests so reviewers can complete the flow. */
export function demoPhoneHint(): string | undefined {
  return isOtpDemoMode() ? demoPhones()[0] : undefined;
}

/**
 * True while any preview-only scaffold (OTP or payment) is active.
 * Features that would otherwise leak demo-only information gate on this.
 */
export function isPreviewMode(): boolean {
  return isOtpDemoMode() || isPaymentDemoMode();
}

const STAFF_DEMO_CREDENTIALS = [
  { label: "مدیر سالن", value: "09120000001 / admin123" },
  { label: "آرایشگر", value: "09120000002 / barber123" },
];

/**
 * Staff portal logins, listed in the UI only while the preview flags above are on.
 * A production build receives no flags and therefore prints nothing.
 */
export function demoStaffCredentials(): { label: string; value: string }[] {
  return isPreviewMode() ? STAFF_DEMO_CREDENTIALS : [];
}
