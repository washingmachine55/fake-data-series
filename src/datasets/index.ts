// The dataset registry. Add a dataset: create a file next to this one, then list it here.
// Routes, docs and /meta are built from this array.
import { carbonIntensity } from "./carbon-intensity";
import { demand } from "./demand";
import { marketIndex } from "./market-index";
import { meterReadings } from "./meter-readings";
import { systemPrices } from "./system-prices";
import type { Dataset } from "./types";
import { unitGeneration } from "./unit-generation";

export const datasets: Dataset[] = [marketIndex, systemPrices, unitGeneration, demand, carbonIntensity, meterReadings];

export const datasetById = new Map(datasets.map((d) => [d.id, d]));
