// One dataset request: window → records → shaping → envelope → scenario.
import type { Context } from "hono";
import { config } from "./config";
import type { Dataset } from "./datasets/types";
import { envelopes } from "./envelopes";
import { timeFormats } from "./formats/time";
import { dateStyles, periodStyles, valueStyles } from "./formats/values";
import { HOUR } from "./lib/london";
import { resolveWindow } from "./lib/window";
import { granularities, type DatasetQuery } from "./query";
import { scenarios } from "./scenarios";
import { shape } from "./shaping";

export function serveDataset(c: Context, ds: Dataset, q: DatasetQuery) {
  const window = resolveWindow(q);
  if (typeof window === "string") return c.json({ error: "invalid window", message: window }, 400);

  const outside = q.outsideHours * HOUR;
  const filters = Object.fromEntries(Object.keys(ds.filters ?? {}).map((k) => [k, q[k] as string | undefined]));
  const records = ds.generate({
    from: new Date(window.from.getTime() - outside),
    to: new Date(window.to.getTime() + outside),
    stepMs: granularities[q.granularity],
    revision: q.revision,
    time: timeFormats[q.timeFormat].render,
    value: valueStyles[q.valueStyle].render,
    date: dateStyles[q.dateStyle].render,
    period: periodStyles[q.periodStyle].render,
    filters,
  });
  if (records.length > config.maxRecords) {
    return c.json({ error: "too many records", message: `${records.length} > ${config.maxRecords}; narrow the window` }, 400);
  }

  const shaped = shape(records, ds.valueFields, { gapsEvery: q.gapsEvery, duplicates: q.duplicates, shuffle: q.shuffle === "true" });
  const body = () =>
    envelopes[q.envelope].wrap(shaped, { dataset: ds.id, page: q.page, pageSize: q.pageSize, url: new URL(c.req.url) });
  return scenarios[q.scenario].run(c, q, body);
}
