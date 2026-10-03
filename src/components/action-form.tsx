"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/actions/salon";

export function ActionForm({
  action,
  submitLabel,
  children,
  className = "",
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-3.5 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="focus-ring rounded-full bg-[#0f5a3b] px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#094028] disabled:bg-bone/15 disabled:text-bone/40"
        >
          {pending ? "در حال ثبت…" : submitLabel}
        </button>
        {state && (
          <p
            role="status"
            className={`text-xs font-bold ${state.ok ? "text-[#0f5a3b]" : "text-rose-700"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required = true,
  dir,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  dir?: "ltr" | "rtl";
}) {
  const id = `f-${name}-${label.replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-semibold text-bone/65">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        dir={dir}
        required={required}
        defaultValue={defaultValue}
        className="focus-ring mt-1 w-full rounded-xl border border-[#c59b4b]/30 bg-white px-3 py-2 text-xs font-medium"
      />
    </div>
  );
}
