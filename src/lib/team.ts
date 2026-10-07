import type { Role } from "@/lib/rbac";

export const TEAM_ROLE_LABELS_FA: Record<Role, string> = {
  CLIENT: "مشتری",
  TRAINEE: "هنرجو",
  BARBER: "آرایشگر",
  INSTRUCTOR: "مدرس",
  RECEPTIONIST: "پذیرش",
  MANAGER: "مدیر",
  FINANCE: "مالی",
  SUPER_ADMIN: "مالک / مدیر ارشد",
};

/** Roles a salon manager may assign while staying inside their own authority. */
export const MANAGER_ASSIGNABLE_ROLES: readonly Role[] = [
  "CLIENT",
  "TRAINEE",
  "BARBER",
  "INSTRUCTOR",
  "RECEPTIONIST",
];

export const PRIVILEGED_TEAM_ROLES: readonly Role[] = [
  "MANAGER",
  "FINANCE",
  "SUPER_ADMIN",
];

export function teamRoleLabel(role: string): string {
  return TEAM_ROLE_LABELS_FA[role as Role] ?? role;
}

export function teamRoleTone(role: string): "ok" | "wait" | "mute" {
  if (role === "BARBER" || role === "INSTRUCTOR") return "ok";
  if (role === "MANAGER" || role === "SUPER_ADMIN") return "wait";
  return "mute";
}

/** Persian-aware, URL-safe default slug; callers still enforce uniqueness. */
export function safeProfileSlug(name: string): string {
  const letters: Record<string, string> = {
    آ: "a", ا: "a", ب: "b", پ: "p", ت: "t", ث: "s", ج: "j", چ: "ch",
    ح: "h", خ: "kh", د: "d", ذ: "z", ر: "r", ز: "z", ژ: "zh", س: "s",
    ش: "sh", ص: "s", ض: "z", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f",
    ق: "gh", ک: "k", گ: "g", ل: "l", م: "m", ن: "n", و: "v", ه: "h",
    ی: "y", ء: "", ئ: "y", ؤ: "v", ي: "y", ك: "k",
  };
  const latin = Array.from(name.normalize("NFKC").toLowerCase())
    .map((character) => letters[character] ?? character)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 36)
    .replace(/-+$/g, "");
  return latin.length >= 2 ? latin : "team-member";
}

export function timeInputValue(minutes: number): string {
  const safe = Math.max(0, Math.min(1439, Math.trunc(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
