import { z } from "@hono/zod-openapi";
import { dailyShape, daylight, settlementPeriods } from "../lib/london";
import { between, round } from "../lib/rng";
import { list, type Dataset } from "./types";

// Generation per unit per settlement period: several records share each time and differ
// by unit, so a consumer must split them into one series per unit.
const UNITS: Record<string, { fuel: string; mw: (start: Date, key: string) => number }> = {
  "T_BIOMASS-1": { fuel: "BIOMASS", mw: (_, key) => between(560, 645, "bio", key) },
  "T_CCGT-1": { fuel: "CCGT", mw: (start, key) => 200 + 600 * dailyShape(start) * between(0.9, 1.1, "ccgt", key) },
  "E_SOLAR-1": { fuel: "SOLAR", mw: (start, key) => 48 * daylight(start) * between(0.6, 1, "solar", key) },
  "T_WIND-1": { fuel: "WIND", mw: (_, key) => between(0, 420, "wind", key) },
  // Pumped storage pumps (negative) at night and generates at peak.
  "T_PUMPED-1": { fuel: "PS", mw: (start, key) => (dailyShape(start) > 0.7 ? between(200, 360, "ps", key) : -between(0, 300, "ps", key)) },
};

export const unitGeneration: Dataset = {
  id: "unit-generation",
  title: "Generation per unit",
  description: `Metered output (MW) per unit per settlement period. Units: ${Object.keys(UNITS).join(", ")}. Solar is 0 at night; pumped storage goes negative.`,
  basis: "settlement",
  filters: {
    unit: z.string().optional().openapi({ description: "Comma-separated unit ids. Default: all.", example: "T_WIND-1,E_SOLAR-1" }),
  },
  valueFields: ["quantity"],
  timeFields: ["timeFrom", "timeTo", "settlementDate", "settlementPeriod"],
  seriesKey: "unit",
  example: { settlementDate: "2026-10-14", settlementPeriod: 30, unit: "T_WIND-1", fuelType: "WIND", quantity: 211.4, timeFrom: "2026-10-14T13:30:00Z", timeTo: "2026-10-14T14:00:00Z" },
  generate: (ctx) => {
    const units = list(ctx.filters.unit) ?? Object.keys(UNITS);
    return settlementPeriods(ctx.from, ctx.to).flatMap((sp) =>
      units.flatMap((unit) => {
        const def = UNITS[unit];
        if (!def) return [];
        const key = `${sp.start.getTime()}|${unit}|${ctx.revision}`;
        return [{
          settlementDate: ctx.date(sp.date),
          settlementPeriod: ctx.period(sp.period),
          unit,
          fuelType: def.fuel,
          quantity: ctx.value(round(def.mw(sp.start, key), 1), `q|${key}`),
          timeFrom: ctx.time(sp.start),
          timeTo: ctx.time(sp.end),
        }];
      }),
    );
  },
};
