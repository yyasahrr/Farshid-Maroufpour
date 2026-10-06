type ScheduledItem = {
  attendeeId: string;
  barberId: number;
  date: string;
  startMin: number;
  barberDurationMin: number;
  bufferMin: number;
  /**
   * Time the client spends on this segment (includes processing time). When
   * present the same attendee cannot be booked into two overlapping segments —
   * one person cannot sit in two chairs at once.
   */
  clientDurationMin?: number;
};

export function bookingGroupConflict(items: ScheduledItem[]): string | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    for (const other of items.slice(0, index)) {
      if (other.date !== item.date) continue;

      if (
        other.barberId === item.barberId &&
        item.startMin < other.startMin + other.barberDurationMin + other.bufferMin &&
        other.startMin < item.startMin + item.barberDurationMin + item.bufferMin
      )
        return "زمان‌های یک آرایشگر نباید هم‌پوشانی داشته باشند.";

      if (other.attendeeId !== item.attendeeId) continue;
      const otherClientDuration = other.clientDurationMin ?? other.barberDurationMin;
      const itemClientDuration = item.clientDurationMin ?? item.barberDurationMin;
      if (
        item.startMin < other.startMin + otherClientDuration &&
        other.startMin < item.startMin + itemClientDuration
      )
        return "برای یک نفر نمی‌توان دو خدمت هم‌زمان رزرو کرد؛ ترتیب خدمات را تغییر دهید.";
    }
  }
  return null;
}
