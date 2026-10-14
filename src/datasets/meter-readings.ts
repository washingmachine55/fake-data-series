import { z } from "@hono/zod-openapi";
import { dailyShape, intervals } from "../lib/london.js";
import { between, round } from "../lib/rng.js";
import { list, type Dataset } from "./types.js";

const METERS = ["MTR-0001", "MTR-0002", "MTR-0003"];

// Consumption per meter per interval with quantity, unit price and cost, so one record
// carries several measures and several meters share each time.
export const meterReadings: Dataset = {
  id: "meter-readings",
  title: "Meter readings (quantity, price, value)",
  description: "quantity (kWh), price (p/kWh) and value (£) per meter per interval; ?granularity= sets the interval.",
  basis: "interval",
  filters: {
    meterId: z.string().optional().openapi({ description: `Comma-separated meter ids. Default: ${METERS.join(",")}.`, example: "MTR-0001" }),
  },
  valueFields: ["quantity", "price", "value"],
  timeFields: ["readingTime"],
  seriesKey: "meterId",
  example: { meterId: "MTR-0001", readingTime: "2026-10-14T13:30:00Z", quantity: 12.84, unit: "kWh", price: 24.5, value: 3.15 },
  generate: (ctx) => {
    const meters = list(ctx.filters.meterId) ?? METERS;
    const hours = ctx.stepMs / 3_600_000;
    return intervals(ctx.from, ctx.to, ctx.stepMs).flatMap(({ start }) =>
      meters.map((meterId, i) => {
        const key = `${start.getTime()}|${meterId}|${ctx.revision}`;
        const quantity = round((5 + 20 * i) * hours * dailyShape(start) * between(0.7, 1.3, "kwh", key), 3);
        const price = round(between(18, 32, "p-per-kwh", key), 2);
        return {
          meterId,
          readingTime: ctx.time(start),
          quantity: ctx.value(quantity, `q|${key}`),
          unit: "kWh",
          price: ctx.value(price, `p|${key}`),
          value: ctx.value(round((quantity * price) / 100, 2), `v|${key}`),
        };
      }),
    );
  },
};
