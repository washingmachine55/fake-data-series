// How timestamps are written in records (?timeFormat=). Add a format by adding an entry;
// the query enum, the docs table and /meta pick it up automatically.
import { londonFields, londonOffsetMinutes, pad } from "../lib/london";

export interface TimeFormat {
  description: string;
  /** The trap this format sets for a consumer, if any. */
  note?: string;
  render: (d: Date) => string | number;
}

const isoZ = (d: Date) => d.toISOString().replace(".000Z", "Z");
const utcWall = (d: Date, sep = "T") => d.toISOString().slice(0, 19).replace("T", sep);

function londonWall(d: Date, sep = "T") {
  const f = londonFields(d);
  return `${f.year}-${pad(f.month)}-${pad(f.day)}${sep}${pad(f.hour)}:${pad(f.minute)}:${pad(f.second)}`;
}

function londonOffset(d: Date, colon = true) {
  const m = londonOffsetMinutes(d);
  return `${m < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(m) / 60))}${colon ? ":" : ""}${pad(Math.abs(m) % 60)}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function rfc1123London(d: Date) {
  const f = londonFields(d);
  const weekday = DAYS[new Date(Date.UTC(f.year, f.month - 1, f.day)).getUTCDay()];
  const zone = londonOffsetMinutes(d) === 60 ? "BST" : "GMT";
  return `${weekday}, ${pad(f.day)} ${MONTHS[f.month - 1]} ${f.year} ${pad(f.hour)}:${pad(f.minute)}:${pad(f.second)} ${zone}`;
}

export const timeFormats = {
  iso_z: { description: "ISO 8601 in UTC", render: isoZ },
  iso_ms_z: { description: "ISO 8601 in UTC with milliseconds", render: (d) => d.toISOString() },
  iso_minutes_z: { description: "ISO 8601 in UTC without seconds", render: (d) => isoZ(d).slice(0, 16) + "Z" },
  iso_offset: {
    description: "London local time with its offset",
    note: "offset changes from +01:00 to +00:00 across the October clock change",
    render: (d) => londonWall(d) + londonOffset(d),
  },
  iso_offset_compact: { description: "London local time, offset without a colon", render: (d) => londonWall(d) + londonOffset(d, false) },
  naive_utc: { description: "UTC wall clock, no zone", note: "correct only if the consumer assumes UTC", render: (d) => utcWall(d) },
  naive_utc_space: { description: "UTC wall clock, space separator, no zone", render: (d) => utcWall(d, " ") },
  naive_london: {
    description: "London wall clock, no zone",
    note: "an hour off in BST if read as UTC; 01:00–02:00 repeats on the October change day",
    render: (d) => londonWall(d),
  },
  naive_london_space: { description: "London wall clock, space separator, no zone", note: "as naive_london", render: (d) => londonWall(d, " ") },
  date_only: { description: "UTC date only", note: "every record of a day shares one timestamp", render: (d) => isoZ(d).slice(0, 10) },
  rfc1123_gmt: { description: "RFC 1123 in GMT", render: (d) => d.toUTCString() },
  rfc1123_london: {
    description: "RFC 1123 in London time with BST/GMT",
    note: "parsers that don't know BST read it as UTC, an hour off",
    render: rfc1123London,
  },
  epoch_s: { description: "Unix seconds, JSON number", render: (d) => Math.floor(d.getTime() / 1000) },
  epoch_ms: { description: "Unix milliseconds, JSON number", render: (d) => d.getTime() },
  epoch_s_string: { description: "Unix seconds as a string", render: (d) => String(Math.floor(d.getTime() / 1000)) },
  epoch_ms_string: { description: "Unix milliseconds as a string", render: (d) => String(d.getTime()) },
  epoch_s_float: { description: "Unix seconds with a fraction", render: (d) => d.getTime() / 1000 + 0.5 },
  epoch_us: { description: "Unix microseconds (16 digits) as a string", render: (d) => `${d.getTime()}000` },
  epoch_ns: { description: "Unix nanoseconds (19 digits) as a string", render: (d) => `${d.getTime()}000000` },
  uk_slash: { description: "dd/MM/yyyy HH:mm, London time", note: "day-first; ambiguous with US order up to the 12th", render: (d) => slash(d, "uk") },
  us_slash: { description: "MM/dd/yyyy HH:mm:ss, UTC", render: (d) => slash(d, "us") },
  compact: { description: "ISO basic format, yyyyMMddTHHmmssZ", render: (d) => isoZ(d).replace(/[-:]/g, "") },
  excel_serial: { description: "Excel serial day number (UTC)", render: (d) => d.getTime() / 86_400_000 + 25_569 },
} satisfies Record<string, TimeFormat>;

function slash(d: Date, order: "uk" | "us") {
  if (order === "uk") {
    const f = londonFields(d);
    return `${pad(f.day)}/${pad(f.month)}/${f.year} ${pad(f.hour)}:${pad(f.minute)}`;
  }
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ${utcWall(d).slice(11)}`;
}

export type TimeFormatName = keyof typeof timeFormats;
