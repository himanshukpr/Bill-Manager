/**
 * Parse a date string consistently as UTC.
 *
 * `new Date("2026-07-31")` in JS is UTC midnight — this is the intended
 * behaviour for this application so that the client (which stores dates as
 * local-midnight date-only strings) and the server agree on the same instant.
 *
 * For full datetime strings (containing 'T') we still delegate to the native
 * Date constructor.
 */
export function parseDateAsUTC(dateStr: string): Date {
  if (!dateStr) return new Date();
  if (dateStr.includes('T')) return new Date(dateStr);

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(dateStr);

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
}

/**
 * Create a UTC Date representing the start of a day (00:00:00.000Z).
 */
export function utcDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * Create a UTC Date representing the end of a day (23:59:59.999Z).
 */
export function utcDayEnd(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
}
