import { z } from "@hono/zod-openapi";
import { dailyShape, settlementPeriods } from "../lib/london.js";
import { between, round } from "../lib/rng.js";
import { list, type Dataset } from "./types.js";

const PROVIDERS = ["APXMIDP", "N2EXMIDP"];

// Shaped like a GB market index feed: one record per provider per settlement period, both
// with the same start time. N2EXMIDP always reports 0, so without a provider filter a
// consumer sees two different values for the same series and time.
export const marketIndex: Dataset = {
  id: "market-index",
  title: "Market index price and volume",
  description: "Price (£/MWh) and volume (MWh) per settlement period and provider. N2EXMIDP is always 0.",
  basis: "settlement",
  filters: {
    dataProviders: z.string().optional().openapi({ description: "Comma-separated providers. Default: APXMIDP,N2EXMIDP.", example: "APXMIDP" }),
  },
  valueFields: ["price", "volume"],
  timeFields: ["startTime", "settlementDate", "settlementPeriod"],
  seriesKey: "dataProvider",
  example: { startTime: "2026-10-14T13:30:00Z", dataProvider: "APXMIDP", settlementDate: "2026-10-14", settlementPeriod: 30, price: 94.12, volume: 1834.5 },
  generate: (ctx) => {
    const providers = list(ctx.filters.dataProviders) ?? PROVIDERS;
    return settlementPeriods(ctx.from, ctx.to).flatMap((sp) =>
      providers.map((provider) => {
        const key = `${sp.start.getTime()}|${provider}|${ctx.revision}`;
        const real = provider === "APXMIDP";
        const shape = dailyShape(sp.start);
        return {
          startTime: ctx.time(sp.start),
          dataProvider: provider,
          settlementDate: ctx.date(sp.date),
          settlementPeriod: ctx.period(sp.period),
          price: ctx.value(real ? round(40 + 140 * shape + between(-8, 8, "mid-price", key)) : 0, `price|${key}`),
          volume: ctx.value(real ? round(300 + 2700 * shape * between(0.8, 1.2, "mid-volume", key), 1) : 0, `volume|${key}`),
        };
      }),
    );
  },
};
