import { dailyShape, intervals } from "../lib/london";
import { between, round } from "../lib/rng";
import type { Dataset } from "./types";

// National demand on fixed intervals (?granularity=), each with a start and an end time.
export const demand: Dataset = {
  id: "demand",
  title: "National demand",
  description: "Demand and its day-ahead forecast (MW) per interval; ?granularity= sets the interval.",
  basis: "interval",
  valueFields: ["demand", "forecast"],
  timeFields: ["startTime", "endTime"],
  example: { startTime: "2026-10-14T13:30:00Z", endTime: "2026-10-14T14:00:00Z", demand: 31250, forecast: 30980, unit: "MW" },
  generate: (ctx) =>
    intervals(ctx.from, ctx.to, ctx.stepMs).map(({ start, end }) => {
      const key = `${start.getTime()}|${ctx.revision}`;
      const mw = 18_000 + 22_000 * dailyShape(start);
      return {
        startTime: ctx.time(start),
        endTime: ctx.time(end),
        demand: ctx.value(Math.round(mw * between(0.97, 1.03, "demand", key)), `demand|${key}`),
        forecast: ctx.value(Math.round(mw * between(0.95, 1.05, "forecast", key)), `forecast|${key}`),
        unit: "MW",
      };
    }),
};
