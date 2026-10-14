// The requested window, from the query: from/to (any common timestamp shape) or a
// settlement date with optional period range.
import { DAY, HALF_HOUR, fromLondonWallClock, londonMidnight, periodsInDay } from "./london.js";

export interface Window {
  from: Date;
  to: Date;
}

export type NaiveAs = "utc" | "london";

const MAX_SPAN = 92 * DAY;
const ZONED = /(Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/;

/**
 * Reads epoch seconds (10 digits) or ms (13), ISO with a zone (Z, +01:00, +0100), or a
 * date / date-time without one, which is read as UTC or London wall clock per `naiveAs`.
 */
export function parseInstant(text: string, naiveAs: NaiveAs): Date | null {
  const s = text.trim();
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
  if (/^\d{13}$/.test(s)) return new Date(Number(s));
  if (ZONED.test(s)) {
    const t = Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    return Number.isNaN(t) ? null : new Date(t);
  }
  const m = NAIVE.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", sec = "0", ms = "0"] = m;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec), Number(ms.padEnd(3, "0")));
  return naiveAs === "london" ? fromLondonWallClock(wall) : new Date(wall);
}

export interface WindowQuery {
  from?: string;
  to?: string;
  naiveParamsAs: NaiveAs;
  settlementDate?: string;
  periodFrom?: number;
  periodTo?: number;
}

/** The window, or an error message. Default: the 24 h up to the last half-hour boundary. */
export function resolveWindow(q: WindowQuery, now = Date.now()): Window | string {
  if (q.settlementDate) {
    const count = periodsInDay(q.settlementDate);
    const first = q.periodFrom ?? 1;
    const last = q.periodTo ?? count;
    if (first > last || last > count) return `periods must be within 1..${count} on ${q.settlementDate}`;
    const midnight = londonMidnight(q.settlementDate).getTime();
    return { from: new Date(midnight + (first - 1) * HALF_HOUR), to: new Date(midnight + last * HALF_HOUR) };
  }
  const to = q.to ? parseInstant(q.to, q.naiveParamsAs) : new Date(Math.floor(now / HALF_HOUR) * HALF_HOUR);
  if (!to) return `cannot read to=${q.to}`;
  const from = q.from ? parseInstant(q.from, q.naiveParamsAs) : new Date(to.getTime() - DAY);
  if (!from) return `cannot read from=${q.from}`;
  if (from.getTime() >= to.getTime()) return "from must be before to";
  if (to.getTime() - from.getTime() > MAX_SPAN) return "window is longer than 92 days";
  return { from, to };
}
