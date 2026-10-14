import type { z } from "@hono/zod-openapi";

export type Rec = Record<string, unknown>;

/** Everything a dataset needs to build its records; formatting choices come pre-applied. */
export interface GenContext {
  from: Date;
  to: Date;
  /** Interval length for interval datasets (?granularity=). */
  stepMs: number;
  /** Changes every value when bumped (?revision=), to simulate restated data. */
  revision: number;
  time: (d: Date) => string | number;
  value: (v: number, key: string) => unknown;
  date: (settlementDate: string) => string;
  period: (n: number) => string | number;
  /** The dataset's own query params (its `filters`). */
  filters: Record<string, string | undefined>;
}

export interface Dataset {
  id: string; // URL segment: /{auth}/v1/{id}
  title: string;
  description: string;
  /** settlement: half-hour GB periods; interval: fixed steps chosen by ?granularity=. */
  basis: "settlement" | "interval";
  /** Extra query params, documented in the spec and passed to generate as ctx.filters. */
  filters?: Record<string, z.ZodType>;
  /** Dotted paths of the measures, used by ?duplicates= to make conflicting copies. */
  valueFields: string[];
  /** Fields that carry the record's time: timestamps, or a settlement date and period. */
  timeFields: string[];
  /** Field that tells apart records sharing a time (provider, unit, meter), if any. */
  seriesKey?: string;
  /** One record, shown in the docs. */
  example: Rec;
  generate: (ctx: GenContext) => Rec[];
}

/** "a, b" → ["a", "b"]; undefined when the param is absent or blank. */
export function list(param?: string): string[] | undefined {
  const items = param?.split(",").map((s) => s.trim()).filter(Boolean);
  return items?.length ? items : undefined;
}
