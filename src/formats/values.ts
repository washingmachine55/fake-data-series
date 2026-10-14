// How numeric measures are written in records (?valueStyle=). Add a style by adding an entry.
import { rand } from "../lib/rng.js";

export interface ValueStyle {
  description: string;
  /** key makes per-value choices (junk) deterministic. */
  render: (v: number, key: string) => unknown;
}

const JUNK: unknown[] = [null, "", "N/A", "12,5", true, {}, "-", "NaN"];

export const valueStyles = {
  number: { description: "JSON numbers", render: (v) => v },
  string: { description: 'numeric strings, "81.5"', render: (v) => String(v) },
  padded_string: { description: 'numeric strings with spaces, " 81.5 "', render: (v) => ` ${v} ` },
  scientific_string: { description: 'exponent strings, "8.15e+1"', render: (v) => v.toExponential() },
  comma_decimal: { description: 'comma decimal separator, "81,5"', render: (v) => String(v).replace(".", ",") },
  with_unit: { description: 'number with its unit, "81.5 MW"', render: (v) => `${v} MW` },
  junk: {
    description: `about a third of values replaced by one of ${JSON.stringify(JUNK)}`,
    render: (v, key) => (rand("junk", key) < 0.35 ? JUNK[Math.floor(rand("junk-pick", key) * JUNK.length)] : v),
  },
} satisfies Record<string, ValueStyle>;

export type ValueStyleName = keyof typeof valueStyles;

// How settlement dates and periods are written (?dateStyle=, ?periodStyle=).
export const dateStyles = {
  date: { description: '"2026-10-14"', render: (date: string) => date },
  iso_midnight: { description: '"2026-10-14T00:00:00Z"', render: (date: string) => `${date}T00:00:00Z` },
  slash: { description: '"14/10/2026"', render: (date: string) => date.split("-").reverse().join("/") },
  compact: { description: '"20261014"', render: (date: string) => date.replaceAll("-", "") },
};

export const periodStyles = {
  int: { description: "7", render: (p: number): string | number => p },
  string: { description: '"7"', render: (p: number): string | number => String(p) },
  padded: { description: '"07"', render: (p: number): string | number => String(p).padStart(2, "0") },
  zero_based: { description: "6 (period − 1: 0..49, off by one)", render: (p: number): string | number => p - 1 },
};
