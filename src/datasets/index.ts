// The dataset registry. Add a dataset: create a file next to this one, then list it here.
// Routes, docs and /meta are built from this array.
import { carbonIntensity } from "./carbon-intensity.js";
import { demand } from "./demand.js";
import { marketIndex } from "./market-index.js";
import { meterReadings } from "./meter-readings.js";
import { systemPrices } from "./system-prices.js";
import type { Dataset } from "./types.js";
import { unitGeneration } from "./unit-generation.js";

export const datasets: Dataset[] = [marketIndex, systemPrices, unitGeneration, demand, carbonIntensity, meterReadings];

export const datasetById = new Map(datasets.map((d) => [d.id, d]));
