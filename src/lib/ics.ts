/** Salon timezone offset in minutes (Asia/Tehran, no DST). */
const SALON_OFFSET_MIN = 210;

function toUtcStamp(date: string, minutes: number): string {
  const utc =
    Date.parse(`${date}T00:00:00Z`) + (minutes - SALON_OFFSET_MIN) * 60_000;
  return `${new Date(utc).toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Builds an .ics calendar entry for an appointment so the customer can save it
 * to any calendar app. Times are converted from salon local time to UTC.
 */
export function buildAppointmentIcs({
  title,
  description,
  location,
  date,
  startMin,
  durationMin,
  referenceId,
}: {
  title: string;
  description: string;
  location: string;
  date: string;
  startMin: number;
  durationMin: number;
  referenceId: number | string;
}): string {
  const stamp = toUtcStamp(date, startMin);
  const end = toUtcStamp(date, startMin + durationMin);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FarshidMaroufpour//Booking//FA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:booking-${referenceId}-${startMin}@farshid`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${stamp}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(location)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** Triggers a browser download for the generated calendar entry. */
export function downloadIcs(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
