// Pure model + helpers for US-004 (flight details auto-fill).
// The AviationStack API key lives ONLY on the server (BR-004-001, AC6); the
// client calls the backend proxy `/flights/lookup` and never holds a key.

export interface Airport {
  name: string;
  iata: string;
  time?: string; // scheduled ISO datetime
}

export interface FlightInfo {
  code: string;
  airline: string;
  departure: Airport;
  arrival: Airport;
}

/** Normalize to uppercase, no spaces (FR-004-001). */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

/** IATA flight code: 2 letters/digits + 1–4 digits (VR-004-001). */
export function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{2}\d{1,4}$/.test(code);
}

/** One-line summary for the itinerary flight field. */
export function flightSummary(info: FlightInfo): string {
  return `${info.airline} · ${info.departure.iata}→${info.arrival.iata}`;
}
