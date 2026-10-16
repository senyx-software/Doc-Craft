/**
 * time.ts — midnight-UTC helpers. Leaf module (no imports) so both
 * quota.service and quota-sync.service can use it without a circular import.
 */

/** The next midnight UTC as a Date. */
export function nextMidnightUTC(from: Date = new Date()): Date {
  return new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1, 0, 0, 0, 0,
  ));
}

/** Whole seconds from now until the next midnight UTC (>= 1). */
export function secondsUntilMidnightUTC(from: Date = new Date()): number {
  return Math.max(1, Math.ceil((nextMidnightUTC(from).getTime() - from.getTime()) / 1000));
}
