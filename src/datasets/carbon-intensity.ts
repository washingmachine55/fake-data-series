import { dailyShape, intervals } from "../lib/london.js";
import { between } from "../lib/rng.js";
import type { Dataset } from "./types.js";

// Nested measures and nulls: `intensity.actual` is null for intervals that haven't
// happened yet, as live forecast feeds do.
export const carbonIntensity: Dataset = {
  id: "carbon-intensity",
  title: "Carbon intensity (nested, with nulls)",
  description: "intensity.forecast / intensity.actual (gCO2/kWh) and an index band per interval. actual is null for future intervals.",
  basis: "interval",
  valueFields: ["intensity.forecast", "intensity.actual"],
  timeFields: ["from", "to"],
  example: { from: "2026-10-14T13:30Z", to: "2026-10-14T14:00Z", intensity: { forecast: 182, actual: 176, index: "moderate" } },
  generate: (ctx) =>
    intervals(ctx.from, ctx.to, ctx.stepMs).map(({ start, end }) => {
      const key = `${start.getTime()}|${ctx.revision}`;
      const forecast = Math.round(90 + 160 * dailyShape(start) * between(0.8, 1.2, "ci", key));
      const actual = start.getTime() > Date.now() ? null : Math.round(forecast * between(0.9, 1.1, "ci-actual", key));
      return {
        from: ctx.time(start),
        to: ctx.time(end),
        intensity: {
          forecast: ctx.value(forecast, `f|${key}`),
          actual: actual === null ? null : ctx.value(actual, `a|${key}`),
          index: forecast < 120 ? "low" : forecast < 200 ? "moderate" : "high",
        },
      };
    }),
};
