// Generic edits to a dataset's records: gaps, conflicting duplicates, shuffled order.
import type { Rec } from "./datasets/types.js";
import { getPath, setPath } from "./lib/paths.js";
import { rand } from "./lib/rng.js";

export interface ShapeOptions {
  /** Drop every Nth record. */
  gapsEvery?: number;
  /** zero: a copy with every measure 0; changed: a copy with every measure +10%. */
  duplicates: "none" | "zero" | "changed";
  shuffle: boolean;
}

export function shape(records: Rec[], valueFields: string[], o: ShapeOptions): Rec[] {
  let out = records;
  if (o.gapsEvery) out = out.filter((_, i) => (i + 1) % o.gapsEvery! !== 0);
  const how = o.duplicates;
  if (how !== "none") out = out.flatMap((r) => [r, duplicate(r, valueFields, how)]);
  if (o.shuffle) {
    out = out
      .map((r, i) => ({ r, k: rand("shuffle", i) }))
      .sort((a, b) => a.k - b.k)
      .map(({ r }) => r);
  }
  return out;
}

function duplicate(r: Rec, valueFields: string[], how: "zero" | "changed"): Rec {
  const copy = structuredClone(r);
  for (const path of valueFields) {
    const v = getPath(copy, path);
    const n = typeof v === "number" ? v : Number(v);
    if (v === null || v === undefined || !Number.isFinite(n)) continue;
    setPath(copy, path, how === "zero" ? 0 : Math.round(n * 110) / 100);
  }
  return copy;
}
