import type { ReactNode } from "react";

const shapes = {
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="m8.2 8.2 12 12M8.2 15.8 20.2 3.8M14 10l-2 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7" r="3.5" />
      <path d="M2 21v-2a7 7 0 0 1 14 0v2ZM16 3.6a3.5 3.5 0 0 1 0 6.8M18 14a6 6 0 0 1 4 5.7V21" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  diamond: (
    <>
      <path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M8 8l4 13 4-13M7 3l1 5 4-5 4 5 1-5" />
    </>
  ),
  star: (
    <path d="m12 2.5 2.9 5.9 6.5 1-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-1L12 2.5Z" />
  ),
  cap: (
    <>
      <path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v6c4 3 8 3 12 0v-6m4-2v7" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  chevron: <path d="m7 10 5 5 5-5" />,
  arrow: <path d="M20 12H4m6-7-7 7 7 7" />,
  play: <path d="m8 4 12 8-12 8V4Z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  home: (
    <>
      <path d="m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z" />
    </>
  ),
  phone: (
    <path d="M21 16.5v3a2 2 0 0 1-2.2 2A19 19 0 0 1 2.5 5.2 2 2 0 0 1 4.5 3h3l1.5 5-2.5 2a15 15 0 0 0 7 7l2-2.5 5 2Z" />
  ),
  location: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3" />
      <path d="M20.5 4.5V11h-6.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;


export type IconName = keyof typeof shapes;

/**
 * Stroke is set once, in CSS, so a single icon set carries one weight. Use
 * `weight="strong"` when the icon sits beside semibold or bold text; a hairline
 * next to bold text reads as an error.
 */
export function Icon({
  name,
  className = "",
  weight = "regular",
}: {
  name: IconName;
  className?: string;
  weight?: "regular" | "strong";
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`atelier-icon ${weight === "strong" ? "atelier-icon-strong" : ""} ${className}`}
    >
      {shapes[name]}
    </svg>
  );
}

/**
 * Crowned FM monogram, drawn as one evenodd path so the letter counters stay
 * transparent on any surface and the mark inherits the surrounding text color.
 */
const MONOGRAM_PATH =
  "M5 105L92 332H568L655 105L470 196L330 8L190 196Z" +
  "M92 352H322V884H220L92 706Z" +
  "M158 412H322V500H158Z" +
  "M158 556H322V620H220V884L158 798Z" +
  "M340 352H568V706L440 884H340Z" +
  "M400 412H420V884H400Z" +
  "M480 412H500V801L480 828Z";

export function BrandMonogram({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 660 890"
      className={`brand-monogram ${className}`}
    >
      <path fill="currentColor" fillRule="evenodd" d={MONOGRAM_PATH} />
    </svg>
  );
}

export function BrandMark() {
  return (
    <span className="brand-lockup" dir="ltr">
      <BrandMonogram />
      <span className="brand-wordmark">
        <span>
          FARSHID<sup>®</sup>
        </span>
        <small>MAROUFPOUR BEAUTY ACADEMY</small>
      </span>
    </span>
  );
}
