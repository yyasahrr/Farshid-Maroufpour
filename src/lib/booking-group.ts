type ScheduledItem = {
  attendeeId: string;
  barberId: number;
  date: string;
  startMin: number;
  barberDurationMin: number;
  bufferMin: number;
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
    }
  }
  return null;
}
