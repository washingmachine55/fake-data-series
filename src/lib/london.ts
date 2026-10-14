// Europe/London time and GB settlement periods. A settlement day runs from London midnight
// to the next; period n starts (n − 1) × 30 min after midnight, so a day has 48 periods,
// 46 when the clocks go forward (last Sunday of March) and 50 when they go back (October).

export const MINUTE = 60_000;
export const HALF_HOUR = 30 * MINUTE;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const pad = (n: number, width = 2) => String(n).padStart(width, "0");

const londonFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The London wall-clock fields of an instant. */
export function londonFields(d: Date): WallClock {
  const f: Record<string, number> = {};
  for (const p of londonFormat.formatToParts(d)) if (p.type !== "literal") f[p.type] = Number(p.value);
  return f as unknown as WallClock;
}

/** London's offset from UTC at an instant, in minutes (0 in GMT, 60 in BST). */
export function londonOffsetMinutes(d: Date): number {
  const f = londonFields(d);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / MINUTE);
}

/** The instant a London wall-clock time (given as if it were UTC milliseconds) refers to. */
export function fromLondonWallClock(wallMs: number): Date {
  let t = wallMs - londonOffsetMinutes(new Date(wallMs)) * MINUTE;
  t = wallMs - londonOffsetMinutes(new Date(t)) * MINUTE;
  return new Date(t);
}

/** "YYYY-MM-DD" → the instant of London midnight that day. */
export const londonMidnight = (date: string) => fromLondonWallClock(Date.parse(`${date}T00:00:00Z`));

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** The London calendar date of an instant, "YYYY-MM-DD". */
export function londonDate(d: Date): string {
  const f = londonFields(d);
  return `${f.year}-${pad(f.month)}-${pad(f.day)}`;
}

/** 46, 48 or 50. */
export const periodsInDay = (date: string) =>
  (londonMidnight(addDays(date, 1)).getTime() - londonMidnight(date).getTime()) / HALF_HOUR;

export interface SettlementPeriod {
  date: string; // London settlement date
  period: number; // 1..50
  start: Date;
  end: Date;
}

/** Every settlement period that starts in [from, to). */
export function settlementPeriods(from: Date, to: Date): SettlementPeriod[] {
  const out: SettlementPeriod[] = [];
  for (let date = londonDate(from); londonMidnight(date).getTime() < to.getTime(); date = addDays(date, 1)) {
    const midnight = londonMidnight(date).getTime();
    const count = periodsInDay(date);
    for (let period = 1; period <= count; period++) {
      const start = midnight + (period - 1) * HALF_HOUR;
      if (start >= from.getTime() && start < to.getTime()) {
        out.push({ date, period, start: new Date(start), end: new Date(start + HALF_HOUR) });
      }
    }
  }
  return out;
}

/** Fixed-length intervals aligned to the epoch (so to UTC midnight) that start in [from, to). */
export function intervals(from: Date, to: Date, stepMs: number): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  for (let t = Math.ceil(from.getTime() / stepMs) * stepMs; t < to.getTime(); t += stepMs) {
    out.push({ start: new Date(t), end: new Date(t + stepMs) });
  }
  return out;
}

/** A 0..1 daily load shape in London time: morning bump, evening peak around 18:00. */
export function dailyShape(d: Date): number {
  const f = londonFields(d);
  const h = f.hour + f.minute / 60;
  return Math.min(1, 0.45 + 0.5 * Math.exp(-((h - 18) ** 2) / 8) + 0.2 * Math.exp(-((h - 8) ** 2) / 4));
}

/** 0..1 daylight curve for solar, zero between 19:00 and 06:00 London time. */
export function daylight(d: Date): number {
  const f = londonFields(d);
  const h = f.hour + f.minute / 60;
  return h < 6 || h > 19 ? 0 : Math.sin(((h - 6) / 13) * Math.PI);
}
