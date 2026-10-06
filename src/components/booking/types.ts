/**
 * Shared shapes for the booking surfaces. The customer flow, the staff walk-in
 * flow and the server page that loads them all speak in these terms, so a change
 * to a service or barber field happens once.
 */

export type BookingServiceItem = {
  id: number;
  slug?: string;
  name: string;
  category: string;
  durationMin: number;
  basePrice: number;
  description: string;
  paymentMode: "NO_PAYMENT" | "DEPOSIT" | "FULL_PAYMENT";
  depositAmount: number;
};

export type BookingBarberItem = {
  id: number;
  slug?: string;
  name: string;
  title: string;
  /**
   * Services this barber may perform. Derived from the same rule the server
   * enforces: an approved skill for the service plus an explicit
   * barber↔service link.
   */
  serviceIds: number[];
};

export type VisitPreference = "EARLIEST" | "ONE_BARBER" | "PREFERRED_BARBER";

export type BookingUser = { id: number; name: string; phone: string; role: string };
