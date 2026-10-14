// The query params every dataset route accepts. Enums and their docs come from the
// registries, so a new format, envelope or scenario shows up here without edits.
import { z } from "@hono/zod-openapi";
import type { Dataset } from "./datasets/types";
import { envelopes } from "./envelopes";
import { timeFormats, type TimeFormatName } from "./formats/time";
import { dateStyles, periodStyles, valueStyles } from "./formats/values";
import { HOUR, MINUTE, DAY, HALF_HOUR } from "./lib/london";
import { scenarios } from "./scenarios";

export const granularities = { "5m": 5 * MINUTE, "15m": 15 * MINUTE, "30m": HALF_HOUR, "1h": HOUR, "1d": DAY };

const keys = <T extends object>(o: T) => Object.keys(o) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]];

// Docs examples are rendered at a BST instant, where zone mistakes show.
const SAMPLE = new Date("2026-07-14T13:30:00Z");

function table(entries: Record<string, { description: string; note?: string }>, example?: (name: string) => unknown) {
  const rows = Object.entries(entries).map(([name, e]) => {
    const sample = example ? ` \`${JSON.stringify(example(name))}\`` : "";
    return `- \`${name}\`:${sample} ${e.description}${e.note ? `. ⚠ ${e.note}` : ""}`;
  });
  return rows.join("\n");
}

const flag = z.enum(["true", "false"]).optional();
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const commonQuery = z.object({
  from: z.string().optional().openapi({
    description: "Window start: ISO with or without zone, a date, or epoch s/ms. Default: `to` − 24 h.",
    example: "2026-10-14T00:00:00Z",
  }),
  to: z.string().optional().openapi({ description: "Window end (exclusive). Default: now, floored to the half-hour.", example: "2026-10-15T00:00:00Z" }),
  naiveParamsAs: z.enum(["utc", "london"]).default("utc").openapi({ description: "How from/to without a zone are read." }),
  settlementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .openapi({ description: "Instead of from/to: one London settlement day (46, 48 or 50 periods). Wins over from/to.", example: "2026-10-25" }),
  periodFrom: int(1, 50).optional().openapi({ description: "With settlementDate: first period." }),
  periodTo: int(1, 50).optional().openapi({ description: "With settlementDate: last period (inclusive)." }),
  timeFormat: z.enum(keys(timeFormats)).default("iso_z").openapi({
    description: `How timestamps in records are written (examples at 2026-07-14T13:30Z, in BST):\n${table(timeFormats, (name) => timeFormats[name as TimeFormatName].render(SAMPLE))}`,
  }),
  valueStyle: z.enum(keys(valueStyles)).default("number").openapi({ description: `How measures are written:\n${table(valueStyles)}` }),
  dateStyle: z.enum(keys(dateStyles)).default("date").openapi({ description: `Settlement date format:\n${table(dateStyles)}` }),
  periodStyle: z.enum(keys(periodStyles)).default("int").openapi({ description: `Settlement period format:\n${table(periodStyles)}` }),
  granularity: z.enum(keys(granularities)).default("30m").openapi({ description: "Interval length (interval datasets only)." }),
  revision: int(1, 1000).default(1).openapi({ description: "Bump to restate every value for the same window." }),
  envelope: z.enum(keys(envelopes)).default("data").openapi({ description: `Where the records sit:\n${table(envelopes)}` }),
  page: int(1, 100_000).default(1).openapi({ description: "With envelope=paged." }),
  pageSize: int(1, 10_000).default(100).openapi({ description: "With envelope=paged." }),
  gapsEvery: int(2, 1000).optional().openapi({ description: "Drop every Nth record." }),
  duplicates: z.enum(["none", "zero", "changed"]).default("none").openapi({
    description: "Add a copy of each record with the same time: `zero` sets every measure to 0, `changed` adds 10%.",
  }),
  shuffle: flag.openapi({ description: "Return records in a random (but repeatable) order." }),
  outsideHours: z.coerce.number().min(0).max(168).default(0).openapi({
    description: "Also return records this many hours before and after the window, like an API that ignores its filter.",
  }),
  scenario: z.enum(keys(scenarios)).default("ok").openapi({ description: `How the server answers:\n${table(scenarios)}` }),
  delayMs: int(0, 600_000).default(35_000).openapi({ description: "With scenario=delay." }),
  status: int(400, 599).default(500).openapi({ description: "With scenario=status." }),
  retryAfter: int(0, 86_400).default(60).openapi({ description: "Retry-After seconds, with status=429/503." }),
  failTimes: int(0, 100).default(2).openapi({ description: "With scenario=flaky." }),
  flakyKey: z.string().optional().openapi({ description: "With scenario=flaky: counter name. Default: the request path." }),
  sizeMb: z.coerce.number().min(0.1).max(500).default(12).openapi({ description: "With scenario=huge." }),
  hops: int(0, 20).default(1).openapi({ description: "With scenario=redirect." }),
  keyHeader: z.string().optional().openapi({ description: "Auth mode apikey: header to read the key from. Default: X-API-Key." }),
});

export type CommonQuery = z.infer<typeof commonQuery>;

/** A parsed dataset query: the common params plus the dataset's own filters. */
export type DatasetQuery = CommonQuery & Record<string, unknown>;

/** The common params plus the dataset's own filters. */
export const datasetQuery = (ds: Dataset) => commonQuery.extend(ds.filters ?? {});
