"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";

export type AuthUser = { id: number; name: string; phone: string; role: string };
type Step = "phone" | "otp" | "name";

function localMobile(value: string): string {
  let phone = value.trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\s\-()]/g, "");
  if (phone.startsWith("+98")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("0098")) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith("98")) phone = `0${phone.slice(2)}`;
  else if (phone.startsWith("9") && phone.length === 10) phone = `0${phone}`;
  return phone;
}

function latinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/\D/g, "");
}

export function BookingAuthModal({
  isOpen,
  onClose,
  onAuthenticated,
  demoPhoneHint,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
  demoPhoneHint?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const verifying = useRef(false);
  const verifiedCode = useRef("");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [previewCode, setPreviewCode] = useState("");

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (isOpen && !node.open) node.showModal();
    if (!isOpen && node.open) node.close();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || step !== "otp") return;
    const timer = window.setTimeout(() => inputs.current[0]?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [step, isOpen]);

  useEffect(() => {
    if (!isOpen || step !== "otp") return;
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isOpen, step]);

  const mobile = localMobile(phone);
  const valid = /^09\d{9}$/.test(mobile);
  const remaining = Math.max(0, Math.ceil((cooldownUntil - clock) / 1000));

  async function sendOtp(event?: FormEvent) {
    event?.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: mobile }),
      });
      const result: { error?: string; devCode?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "ارسال کد انجام نشد. دوباره تلاش کنید.");
      setPhone(mobile);
      setCode(Array(6).fill(""));
      setPreviewCode(result.devCode ?? "");
      // eslint-disable-next-line react-hooks/purity -- wall-clock timestamp used as OTP cooldown seed in an event handler
      setCooldownUntil(Date.now() + 60_000);
      // eslint-disable-next-line react-hooks/purity -- same wall-clock read for the visible countdown
      setClock(Date.now());
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال کد انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (verifying.current || value.length !== 6) return;
    verifying.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: mobile, code: value }),
      });
      const result: { error?: string; isFirstTime?: boolean; user?: AuthUser } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "کد واردشده صحیح نیست.");
      if (result.isFirstTime) {
        verifiedCode.current = value;
        setError("");
        setStep("name");
      } else if (result.user) {
        verifiedCode.current = "";
        setError("");
        onAuthenticated(result.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "بررسی کد انجام نشد.");
      setCode(Array(6).fill(""));
      inputs.current[0]?.focus();
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }

  function writeDigit(index: number, input: string) {
    const digit = latinDigits(input).slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError("");
    if (digit && index < 5) inputs.current[index + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  }

  function onOtpKey(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !code[index] && index > 0) inputs.current[index - 1]?.focus();
  }

  function onOtpPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = latinDigits(event.clipboardData.getData("text")).slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    const next = Array.from({ length: 6 }, (_, index) => pasted[index] ?? "");
    setCode(next);
    inputs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) void verify(pasted);
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const nameClean = name.trim();
    if (nameClean.length < 2 || busy) return;
    if (!verifiedCode.current) { setStep("otp"); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/complete-onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: mobile, code: verifiedCode.current, name: nameClean }),
      });
      const result: { error?: string; user?: AuthUser } = await response.json();
      if (!response.ok || !result.user) throw new Error(result.error ?? "ورود انجام نشد. دوباره تلاش کنید.");
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ورود انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label="ورود و ثبت‌نام"
      aria-hidden={!isOpen}
      className="auth-dialog w-[min(460px,calc(100vw-24px))] rounded-3xl border border-[#e2e5df] bg-white p-6 text-[#1f2e27] shadow-xl sm:p-8"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e2efe8] text-[#2f4a3a]">
          <Icon name={step === "phone" ? "phone" : step === "otp" ? "clock" : "user"} className="h-6 w-6" />
        </div>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="بستن پنجره ورود" className="focus-ring flex h-11 w-11 items-center justify-center rounded-xl bg-[#f6f5f1]">
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>

      {step === "phone" && (
        <form onSubmit={(event) => void sendOtp(event)} className="mt-6">
          <h2 className="text-2xl font-black">ورود / ثبت‌نام</h2>
          <p className="mt-1 text-sm leading-7 text-[#5f7168]">شماره موبایل خود را وارد کنید.</p>
          <label htmlFor="auth-phone-input" className="ui-label mt-6">شماره موبایل</label>
          <div dir="ltr" className="flex items-center gap-2 rounded-2xl border border-[#dfe3e0] bg-[#f6f5f1] px-3 focus-within:border-[#0f5a3b]">
            <span className="border-r border-[#dfe3e0] pr-2 text-sm font-bold text-[#8a6a1e]">+98</span>
            <input
              id="auth-phone-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              autoFocus
              value={phone}
              onChange={(event) => { setPhone(event.target.value); setError(""); }}
              placeholder="0912 345 6789"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "auth-error" : undefined}
              className="h-12 w-full bg-transparent px-2 text-base font-semibold outline-none"
            />
          </div>
          {error && <p id="auth-error" role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
          {demoPhoneHint && (
            <p className="mt-4 rounded-xl bg-[#f7f0d8] px-3 py-2 text-xs leading-6 text-[#6b5213]">
              این پیش‌نمایش پیامک واقعی ندارد؛ هر شماره معتبر وارد کنید و کد نمایشی{" "}
              <span dir="ltr" className="inline-block font-bold">123456</span> نمایش داده می‌شود.
            </p>
          )}
          <button type="submit" disabled={busy || !valid} className="ui-button mt-5 w-full">
            {busy ? "در حال ارسال…" : "دریافت کد"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <div className="mt-6">
          <h2 className="text-2xl font-black">کد تأیید</h2>
          <p className="mt-1 text-sm leading-7 text-[#5f7168]">
            کد ۶رقمی ارسال‌شده به <span dir="ltr" className="inline-block font-semibold text-[#2f4a3a]">{mobile}</span> را وارد کنید.
          </p>
          {previewCode && (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-[#f7f0d8] p-3 text-sm font-semibold text-[#6b5213] sm:flex-row sm:justify-between">
              <span>
                کد ورود این پیش‌نمایش: <span dir="ltr" className="font-mono font-bold tracking-widest">{previewCode}</span>
              </span>
              <button
                type="button"
                onClick={() => { setCode(previewCode.split("")); void verify(previewCode); }}
                className="focus-ring rounded-full bg-[#6b5213] px-4 py-1.5 text-xs font-bold text-white"
              >
                ورود خودکار
              </button>
            </div>
          )}
          <div dir="ltr" role="group" aria-label="شش رقم کد تأیید" className="mt-5 flex justify-center gap-2">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(node) => { inputs.current[index] = node; }}
                value={digit}
                onChange={(event) => writeDigit(index, event.target.value)}
                onPaste={onOtpPaste}
                onKeyDown={(event) => onOtpKey(index, event)}
                aria-label={`رقم ${index + 1} از ۶`}
                aria-invalid={Boolean(error)}
                inputMode="numeric"
                type="text"
                maxLength={1}
                autoComplete={index === 0 ? "one-time-code" : "off"}
                className="focus-ring h-12 w-[min(12vw,47px)] rounded-xl border border-[#dfe3e0] bg-[#f6f5f1] text-center text-xl font-bold focus:border-[#0f5a3b]"
              />
            ))}
          </div>
          {error && <p role="alert" className="mt-3 text-center text-sm text-rose-700">{error}</p>}
          <div className="mt-5 flex items-center justify-between gap-2 text-sm">
            <button type="button" onClick={() => { setStep("phone"); setCode(Array(6).fill("")); setError(""); }} className="focus-ring min-h-11 font-semibold text-[#2f4a3a]">
              ویرایش شماره
            </button>
            {remaining > 0 ? (
              <span className="text-[#5f7168]" dir="ltr">
                ارسال دوباره تا {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
              </span>
            ) : (
              <button type="button" disabled={busy} onClick={() => void sendOtp()} className="focus-ring min-h-11 font-semibold text-[#2f4a3a]">
                ارسال دوباره کد
              </button>
            )}
          </div>
          <button type="button" onClick={() => void verify(code.join(""))} disabled={busy || code.some((digit) => !digit)} className="ui-button mt-3 w-full">
            {busy ? "در حال بررسی…" : "تأیید و ادامه"}
          </button>
        </div>
      )}

      {step === "name" && (
        <form onSubmit={(event) => void saveName(event)} className="mt-6">
          <h2 className="text-2xl font-black">فقط نام شما</h2>
          <p className="mt-1 text-sm leading-7 text-[#5f7168]">برای نمایش روی رسید نوبت، نام و نام خانوادگی‌تان را بنویسید.</p>
          <label className="ui-label mt-6" htmlFor="auth-name-input">نام و نام خانوادگی</label>
          <input
            id="auth-name-input"
            autoFocus
            className="ui-input"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(event) => { setName(event.target.value); setError(""); }}
            placeholder="مثلاً سامان رضایی"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "auth-name-error" : undefined}
          />
          {error && <p id="auth-name-error" role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={busy || name.trim().length < 2} className="ui-button mt-5 w-full">
            {busy ? "در حال ذخیره…" : "ادامه"}
          </button>
        </form>
      )}
    </dialog>
  );
}
