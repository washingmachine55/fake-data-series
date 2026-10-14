// GET /random: a ready-to-copy request with a random dataset, auth mode and formats, plus
// where its records, times and values sit in the response. ?seed= repeats a suggestion.
import { authModes, type AuthModeName } from "./auth.js";
import { datasets } from "./datasets/index.js";
import type { Dataset } from "./datasets/types.js";
import { envelopes, type Envelope } from "./envelopes.js";
import { timeFormats } from "./formats/time.js";
import { dateStyles, periodStyles, valueStyles } from "./formats/values.js";
import { HALF_HOUR, HOUR, addDays, londonDate } from "./lib/london.js";
import { rand } from "./lib/rng.js";
import { granularities } from "./query.js";
import { scenarios } from "./scenarios.js";

export interface RandomOptions {
  seed: string;
  dataset?: string;
  auth?: AuthModeName;
  /** Also pick failure scenarios (errors, bad bodies, redirects…). */
  chaos: boolean;
}

const names = (o: object) => Object.keys(o);
const pick = <T>(seed: string, knob: string, options: readonly T[]): T => options[Math.floor(rand(seed, knob) * options.length)]!;

// Each knob keeps its default about half the time, so a suggestion usually has one or two
// oddities rather than all of them at once.
const maybe = (seed: string, knob: string, fallback: string, options: readonly string[]) =>
  rand(seed, knob, "keep") < 0.5 ? fallback : pick(seed, knob, options);

// Recent days plus both clock-change days, for settlement windows.
const settlementDays = (now: Date) => [...Array.from({ length: 7 }, (_, i) => addDays(londonDate(now), -i - 1)), "2026-03-29", "2026-10-25"];

export function suggest(origin: string, o: RandomOptions, now = new Date()) {
  const s = o.seed;
  const ds: Dataset = datasets.find((d) => d.id === o.dataset) ?? pick(s, "dataset", datasets);
  const auth = o.auth ?? pick(s, "auth", names(authModes) as AuthModeName[]);
  const q = new URLSearchParams();
  const set = (key: string, value: string, fallback: string) => value !== fallback && q.set(key, value);

  if (ds.basis === "settlement" && rand(s, "window") < 0.4) {
    q.set("settlementDate", pick(s, "day", settlementDays(now)));
  } else {
    const to = Math.floor(now.getTime() / HALF_HOUR) * HALF_HOUR;
    const hours = pick(s, "hours", [2, 6, 24, 48]);
    q.set("from", new Date(to - hours * HOUR).toISOString().replace(".000Z", "Z"));
    q.set("to", new Date(to).toISOString().replace(".000Z", "Z"));
  }
  set("timeFormat", maybe(s, "timeFormat", "iso_z", names(timeFormats)), "iso_z");
  set("valueStyle", maybe(s, "valueStyle", "number", names(valueStyles)), "number");
  set("envelope", maybe(s, "envelope", "data", names(envelopes)), "data");
  if (ds.basis === "settlement") {
    set("dateStyle", maybe(s, "dateStyle", "date", names(dateStyles)), "date");
    set("periodStyle", maybe(s, "periodStyle", "int", names(periodStyles)), "int");
  } else {
    set("granularity", maybe(s, "granularity", "30m", names(granularities)), "30m");
  }
  if (rand(s, "duplicates") < 0.15) q.set("duplicates", pick(s, "duplicates-how", ["zero", "changed"]));
  if (rand(s, "shuffle") < 0.15) q.set("shuffle", "true");
  if (rand(s, "gaps") < 0.15) q.set("gapsEvery", "4");
  if (o.chaos) set("scenario", pick(s, "scenario", names(scenarios)), "ok");

  const path = `/${auth}/v1/${ds.id}?${q}`;
  const headers = authModes[auth].headers();
  const envelope: Envelope = envelopes[(q.get("envelope") ?? "data") as keyof typeof envelopes];
  const root = envelope.recordsPath === "$" ? "$" : `$.${envelope.recordsPath}`;
  const each = envelope.single ? root : `${root}[*]`;
  const fields = (list: string[]) =>
    list.map((field) => ({
      field,
      path: envelope.recordsPath === "$" ? field : `${envelope.recordsPath}.${field}`,
      jsonPath: `${each}.${field}`,
    }));

  return {
    seed: s,
    again: `${origin}/random?seed=${encodeURIComponent(s)}`,
    url: origin + path,
    path,
    method: "GET",
    headers,
    curl: [`curl -s '${origin}${path}'`, ...Object.entries(headers).map(([k, v]) => `-H '${k}: ${v}'`)].join(" "),
    dataset: { id: ds.id, title: ds.title, basis: ds.basis },
    auth: { mode: auth, description: authModes[auth].description },
    settings: Object.fromEntries(q),
    response: {
      recordsPath: envelope.recordsPath,
      recordsShape: envelope.description,
      values: fields(ds.valueFields),
      times: fields(ds.timeFields),
      seriesKey: ds.seriesKey ? fields([ds.seriesKey])[0] : null,
    },
  };
}

export type Suggestion = ReturnType<typeof suggest>;
