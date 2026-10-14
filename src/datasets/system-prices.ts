import { dailyShape, settlementPeriods } from "../lib/london.js";
import { between, rand, round } from "../lib/rng.js";
import type { Dataset } from "./types.js";

// Imbalance prices per settlement period. Prices go negative now and then (windy nights),
// and the imbalance volume is signed.
export const systemPrices: Dataset = {
  id: "system-prices",
  title: "System (imbalance) prices",
  description: "System sell/buy price (£/MWh) and net imbalance volume (MWh, signed) per settlement period.",
  basis: "settlement",
  valueFields: ["systemSellPrice", "systemBuyPrice", "netImbalanceVolume"],
  timeFields: ["startTime", "settlementDate", "settlementPeriod"],
  example: {
    settlementDate: "2026-10-14",
    settlementPeriod: 30,
    startTime: "2026-10-14T13:30:00Z",
    systemSellPrice: 88.4,
    systemBuyPrice: 88.4,
    netImbalanceVolume: -312.6,
    priceDerivationCode: "N",
  },
  generate: (ctx) =>
    settlementPeriods(ctx.from, ctx.to).map((sp) => {
      const key = `${sp.start.getTime()}|${ctx.revision}`;
      const negative = rand("sp-negative", key) < 0.05;
      const price = negative ? round(between(-60, -1, "sp-neg-price", key)) : round(30 + 170 * dailyShape(sp.start) + between(-15, 15, "sp-price", key));
      return {
        settlementDate: ctx.date(sp.date),
        settlementPeriod: ctx.period(sp.period),
        startTime: ctx.time(sp.start),
        systemSellPrice: ctx.value(price, `ssp|${key}`),
        systemBuyPrice: ctx.value(price, `sbp|${key}`),
        netImbalanceVolume: ctx.value(round(between(-800, 800, "niv", key), 1), `niv|${key}`),
        priceDerivationCode: negative ? "P" : "N",
      };
    }),
};
