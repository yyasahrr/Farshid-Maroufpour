/**
 * Visit grouping.
 *
 * One customer visit is one appointment-level concept even when it contains
 * several service segments, possibly performed by different barbers. Every
 * surface (customer panel, barber panel, admin command center) groups rows with
 * this helper instead of inventing its own notion of "a booking", so a visit is
 * never shown as unrelated appointments and cancellation/review/payment stay
 * attached to the whole visit.
 */

export type VisitSegmentRow = {
  id: number;
  bookingGroupId: string | null;
  date: string;
  startMin: number;
  endMin: number;
  serviceId: number;
  serviceName: string;
  barberId: number;
  barberName: string;
  priceSnapshot?: number;
  status?: string;
  clientName?: string;
  clientPhone?: string;
  notes?: string;
  source?: string;
};

export type VisitGroup<T extends VisitSegmentRow = VisitSegmentRow> = {
  /** Stable key: the booking group id, or `single:{id}` for one-segment visits. */
  key: string;
  bookingGroupId: string | null;
  date: string;
  startMin: number;
  endMin: number;
  segments: T[];
  barberIds: number[];
  barberNames: string[];
  serviceNames: string[];
  oneBarber: boolean;
  /** Number of times the visit moves to another barber. */
  handoffs: number;
  price: number;
  statuses: string[];
  /** Visits with a single segment behave exactly like a classic appointment. */
  single: boolean;
  clientName: string;
  clientPhone: string;
};

export function buildVisitGroups<T extends VisitSegmentRow>(rows: T[]): VisitGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.bookingGroupId ? `group:${row.bookingGroupId}` : `single:${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .map(([key, segments]) => {
      const sorted = [...segments].sort((a, b) => a.startMin - b.startMin || a.id - b.id);
      const barberIds: number[] = [];
      for (const segment of sorted) if (!barberIds.includes(segment.barberId)) barberIds.push(segment.barberId);
      let handoffs = 0;
      for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].barberId !== sorted[index - 1].barberId) handoffs += 1;
      }
      return {
        key,
        bookingGroupId: segments[0].bookingGroupId,
        date: sorted[0].date,
        startMin: Math.min(...sorted.map((segment) => segment.startMin)),
        endMin: Math.max(...sorted.map((segment) => segment.endMin)),
        segments: sorted,
        barberIds,
        barberNames: barberIds.map(
          (barberId) => sorted.find((segment) => segment.barberId === barberId)?.barberName ?? "",
        ),
        serviceNames: sorted.map((segment) => segment.serviceName),
        oneBarber: barberIds.length === 1,
        handoffs,
        price: sorted.reduce((sum, segment) => sum + (segment.priceSnapshot ?? 0), 0),
        statuses: [...new Set(sorted.map((segment) => segment.status ?? "CONFIRMED"))],
        single: sorted.length === 1,
        clientName: sorted[0].clientName ?? "",
        clientPhone: sorted[0].clientPhone ?? "",
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}

/** Segments of one visit that belong to a specific barber (their responsibility). */
export function segmentsFor<T extends VisitSegmentRow>(visit: VisitGroup<T>, barberId: number): T[] {
  return visit.segments.filter((segment) => segment.barberId === barberId);
}

/** What happens after this barber's responsibility ends, if anything. */
export function nextHandoff<T extends VisitSegmentRow>(visit: VisitGroup<T>, barberId: number): T | null {
  const lastOwned = segmentsFor(visit, barberId).at(-1);
  if (!lastOwned) return null;
  return visit.segments.find((segment) => segment.startMin >= lastOwned.endMin && segment.barberId !== barberId) ?? null;
}

/** True when the whole visit is on one status — used for customer-facing badges. */
export function visitStatus(visit: VisitGroup): string {
  const active = visit.statuses.find((status) => !status.startsWith("CANCELLED"));
  return active ?? visit.statuses[0] ?? "CONFIRMED";
}
