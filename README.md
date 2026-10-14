# stubbur

A stub data API for testing anything that ingests time-series data from HTTP APIs.

Every dataset can be served in many shapes:
- **times:** two dozen timestamp formats;
- **values:** several value styles;
- **layout:** where the records sit in the response;
- **auth:** five auth styles;
- **behaviour:** failure scenarios such as timeouts, errors, bad bodies and redirects.

The data is generated, not stored. It follows GB settlement periods (Europe/London, including the 46- and 50-period clock-change days) or fixed intervals. It's deterministic: the same request always returns the same values.

- **Stack:** [Bun](https://bun.com) + [Hono](https://hono.dev) + [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) (Zod 4).
- **Docs come from the code.** Every route and parameter is declared with a Zod schema. The same schema validates requests and generates the OpenAPI spec, so `/docs` is never out of date.

---

## Quick start

```bash
bun install
cp .env.example .env      # optional: every value has a default
bun run dev               # http://localhost:4070, restarts on save
```

| URL | What |
|---|---|
| `/docs` | Swagger UI: try every route from the browser |
| `/openapi.json` | The OpenAPI 3.1 spec |
| `/random` | A random ready-to-copy request, with where its values sit and a preview |
| `/cases` | Named edge-case presets |
| `/meta` | Everything the server can do, as JSON |

```bash
# Elexon-style market index for the October clock-change day (50 periods), no auth
curl 'localhost:4070/open/v1/market-index?settlementDate=2026-10-25'

# Meter readings as epoch-ms strings, junk values mixed in, API key auth
curl 'localhost:4070/apikey/v1/meter-readings?timeFormat=epoch_ms_string&valueStyle=junk' -H 'X-API-Key: stub-api-key'

# A named edge case
curl 'localhost:4070/cases/duplicate-providers'
```

### Scripts

| Command | Does |
|---|---|
| `bun run dev` | Run with hot reload |
| `bun run start` | Run |
| `bun run spec` | Write the spec to `openapi.json` (to share or import into Postman and similar tools) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | `bun test` |
| `bun run format` | Prettier |

### Configuration (`.env`)

| Variable | Default | |
|---|---|---|
| `PORT` | `4070` | Bun only |
| `STUB_API_KEY` | `stub-api-key` | `apikey` mode |
| `STUB_BEARER_TOKEN` | `stub-bearer-token` | The static token for `bearer` mode |
| `STUB_CLIENT_ID` / `STUB_CLIENT_SECRET` | `stub-client` / `stub-secret` | `basic`, `client_headers` and `/oauth/token` |
| `STUB_MAX_RECORDS` | `100000` | A request that would generate more records gets a 400 |

`STUB_JWT_SECRET` isn't used yet. It's reserved for signed OAuth tokens; see [Known limits](#known-limits).

---

## How a request works

```
GET /{auth}/v1/{dataset}?from=…&to=…&timeFormat=…&valueStyle=…&envelope=…&scenario=…
```

```
window (from/to or settlementDate)
  → dataset.generate()     records, with times, values, dates and periods already formatted
  → shaping                gaps, conflicting duplicates, shuffle, records outside the window
  → envelope               where the records sit in the body
  → scenario               how the server answers (200, delay, 429, broken JSON, …)
```

Every option is a query parameter, so any combination is one URL.

### Auth modes (the first path segment)

| Mode | Send | Missing / wrong |
|---|---|---|
| `open` | nothing | — |
| `apikey` | `X-API-Key: <key>` (or the header named in `?keyHeader=`), or `?api_key=` | 401 / 403 |
| `bearer` | `Authorization: Bearer <token>`: the static token or one from `POST /oauth/token` | 401 (with `WWW-Authenticate`) |
| `basic` | `Authorization: Basic base64(client_id:client_secret)` | 401 / 403 |
| `client_headers` | `X-Client-Id` and `X-Client-Secret` | 401 / 403 |

**OAuth 2 client credentials:** get a token, then use it on the `bearer` routes. `expires_in` sets its lifetime in seconds, so you can test expiry.
```bash
curl -X POST localhost:4070/oauth/token -d grant_type=client_credentials \
  -d client_id=stub-client -d client_secret=stub-secret -d expires_in=60
```

### Datasets

| Id | Basis | Measures (`valueFields`) | Times | Series key |
|---|---|---|---|---|
| `market-index` | settlement | `price`, `volume` | `startTime`, `settlementDate` + `settlementPeriod` | `dataProvider` (APXMIDP real, N2EXMIDP always 0) |
| `system-prices` | settlement | `systemSellPrice`, `systemBuyPrice`, `netImbalanceVolume` (signed; prices sometimes negative) | `startTime`, date + period | — |
| `unit-generation` | settlement | `quantity` (solar is 0 at night; pumped storage goes negative) | `timeFrom`, `timeTo`, date + period | `unit` |
| `demand` | interval | `demand`, `forecast` | `startTime`, `endTime` | — |
| `carbon-intensity` | interval | `intensity.forecast`, `intensity.actual` (nested; `null` for future intervals) | `from`, `to` | — |
| `meter-readings` | interval | `quantity` (kWh), `price` (p/kWh), `value` (£) | `readingTime` | `meterId` |

- **Settlement datasets:** one record per GB settlement period (per provider or unit).
- **Interval datasets:** one record per `?granularity=` step (`5m`, `15m`, `30m`, `1h` or `1d`), aligned to UTC.
- **Filters:** `market-index` takes `?dataProviders=`, `unit-generation` takes `?unit=` and `meter-readings` takes `?meterId=`. Each is a comma-separated list.

### Query parameters

**Window**

| Param | Default | |
|---|---|---|
| `from`, `to` | the last 24 h up to the latest half-hour | ISO with or without a zone, a date, or epoch seconds or ms. `to` is exclusive. |
| `naiveParamsAs` | `utc` | How `from`/`to` without a zone are read: `utc` or `london` |
| `settlementDate` (+ `periodFrom`, `periodTo`) | — | One London settlement day instead of `from`/`to`. Use `2026-10-25` for 50 periods, `2026-03-29` for 46. |

The window can be at most 92 days.

**Formats**

| Param | Default | Options |
|---|---|---|
| `timeFormat` | `iso_z` | see the table below |
| `valueStyle` | `number` | `number`, `string`, `padded_string` (`" 81.5 "`), `scientific_string` (`"8.15e+1"`), `comma_decimal` (`"81,5"`), `with_unit` (`"81.5 MW"`), `junk` (about a third of values replaced by `null`, `""`, `"N/A"`, `"12,5"`, `true`, `{}`, `"-"` or `"NaN"`) |
| `dateStyle` | `date` | `date` (`2026-10-14`), `iso_midnight`, `slash` (`14/10/2026`), `compact` (`20261014`) |
| `periodStyle` | `int` | `int` (`7`), `string` (`"7"`), `padded` (`"07"`), `zero_based` (`6`, off by one) |
| `granularity` | `30m` | `5m`, `15m`, `30m`, `1h`, `1d` (interval datasets) |
| `revision` | `1` | Change it to restate every value for the same window, as when an API revises its data |

**Time formats.** The examples below are for 2026-07-14 13:30 UTC, which is 14:30 in London (BST).

| `timeFormat` | Example | Notes |
|---|---|---|
| `iso_z` | `"2026-07-14T13:30:00Z"` | ISO 8601 in UTC |
| `iso_ms_z` | `"2026-07-14T13:30:00.000Z"` | with milliseconds |
| `iso_minutes_z` | `"2026-07-14T13:30Z"` | without seconds |
| `iso_offset` | `"2026-07-14T14:30:00+01:00"` | London time with its offset. ⚠ The offset flips across clock changes. |
| `iso_offset_compact` | `"2026-07-14T14:30:00+0100"` | offset without a colon |
| `naive_utc` | `"2026-07-14T13:30:00"` | UTC, no zone. ⚠ Only correct if read as UTC. |
| `naive_utc_space` | `"2026-07-14 13:30:00"` | same, with a space separator |
| `naive_london` | `"2026-07-14T14:30:00"` | London time, no zone. ⚠ An hour off in BST if read as UTC; 01:00–02:00 repeats on the October change day. |
| `naive_london_space` | `"2026-07-14 14:30:00"` | same, with a space separator |
| `date_only` | `"2026-07-14"` | ⚠ Every record of a day shares one timestamp. |
| `rfc1123_gmt` | `"Tue, 14 Jul 2026 13:30:00 GMT"` | RFC 1123 in GMT |
| `rfc1123_london` | `"Tue, 14 Jul 2026 14:30:00 BST"` | ⚠ Parsers that don't know `BST` read it as UTC. |
| `epoch_s` / `epoch_ms` | `1784035800` / `1784035800000` | JSON numbers |
| `epoch_s_string` / `epoch_ms_string` | `"1784035800"` / `"1784035800000"` | strings |
| `epoch_s_float` | `1784035800.5` | seconds with a fraction |
| `epoch_us` / `epoch_ns` | `"1784035800000000"` / `"1784035800000000000"` | 16 and 19 digits |
| `uk_slash` | `"14/07/2026 14:30"` | London, day first. ⚠ Ambiguous with US order up to the 12th. |
| `us_slash` | `"07/14/2026 13:30:00"` | UTC, month first |
| `compact` | `"20260714T133000Z"` | ISO basic format |
| `excel_serial` | `46217.5625` | Excel day number |

**Response shape and data quirks**

| Param | Default | |
|---|---|---|
| `envelope` | `data` | `data` (`{"data": [...]}`), `root` (bare array), `nested` (`result.items`), `with_metadata`, `single` (one object, not an array), `wrong_key` (`results`), `paged` (with `page`, `pageSize`, `nextPage`) |
| `duplicates` | `none` | `zero`: a copy of each record with every measure 0. `changed`: a copy with +10%. Either way, two records share a time. |
| `gapsEvery` | — | Drop every Nth record |
| `shuffle` | `false` | Records in a random but repeatable order |
| `outsideHours` | `0` | Also return records this many hours either side of the window, like an API that ignores its filter |

**Scenarios** (`?scenario=`)

| Scenario | Params | Answer |
|---|---|---|
| `ok` | | 200 with the data |
| `delay` | `delayMs` (35000) | 200 after the delay, to test client timeouts |
| `status` | `status` (500), `retryAfter` (60) | That status with a JSON error. 429 and 503 add `Retry-After`. |
| `flaky` | `failTimes` (2), `flakyKey` | 500 for the first N calls per key, then 200. `POST /admin/reset` clears the counters. |
| `no_content` | | 204 |
| `html` | | 200 with an HTML maintenance page |
| `text_content_type` | | 200, JSON body, `Content-Type: text/plain` |
| `broken_json` / `truncated_json` | | 200 with invalid JSON, or half of the real body |
| `gzip` | | 200 with `Content-Encoding: gzip`, whatever the client asked for |
| `huge` | `sizeMb` (12) | 200, a valid streamed body of about that size |
| `redirect` | `hops` (1) | 302 chain back to the same URL, then 200 |
| `redirect_private` | | 302 to `http://169.254.169.254/latest/meta-data/` (to test redirect/SSRF protection) |

### Presets (`/cases/{name}`)

Named edge cases with no auth. Your own params override the preset's, so you can still set your own `from`/`to`. `GET /cases` lists them all, for example:

`duplicate-providers`, `clock-change-autumn`, `clock-change-spring`, `clock-change-naive-london`, `naive-london-bst`, `rfc1123-bst`, `epoch-microseconds`, `settlement-zero-based`, `junk-values`, `negative-and-zero`, `series-per-unit`, `nested-with-nulls`, `outside-window`, `conflicting-duplicates`, `gaps`, `single-object`, `wrong-records-key`, `paged`, `timeout`, `rate-limited`, `flaky`, `broken-json`, `empty-window`, `huge`, `gzip`, `redirect-chain`, `redirect-private`, and more.

### Tools

- **`GET /random`** suggests a random request. It returns:
  - the full `url`, the `headers` to send, and a `curl` command;
  - where the records, values, times and series key sit, as dotted paths and JSONPath;
  - a **preview**: the first record and its values, fetched from the server itself.

  Pin parts with `?dataset=` and `?auth=`. Add `?chaos=true` to include failure scenarios (no preview is fetched for those). `?seed=` repeats a suggestion, and every response includes an `again` link.
- **`/echo/{anything}`** (any method) returns the method, path, query and headers it received, with secrets masked. Use it to check what a client actually sends.
- **`GET /meta`** lists every dataset, format, envelope, scenario, auth mode and preset as JSON.

---

## Project layout

```
server.ts               Bun entry (local): port, idle timeout
src/index.ts            Entry for Vercel, Cloudflare Workers and other hosts: default-exports the app
src/app.ts              Builds every route from the registries below, plus the spec and Swagger UI
src/config.ts           Environment variables
src/query.ts            The shared query schema; its enums and docs are built from the registries
src/serve.ts            One dataset request: window → generate → shape → envelope → scenario
src/datasets/           One file per dataset + index.ts (the registry) + types.ts (the contract)
src/formats/time.ts     Timestamp formats
src/formats/values.ts   Value, date and period styles
src/envelopes.ts        Response shapes
src/shaping.ts          Gaps, duplicates, shuffle
src/scenarios.ts        Failure scenarios
src/auth.ts             Auth modes, OAuth token issuing, security schemes
src/cases.ts            Named presets
src/random.ts           /random suggestions
src/lib/                London time and settlement periods, window parsing, seeded random, dotted paths
scripts/spec.ts         Writes openapi.json
```

## Extending it

Each kind of thing lives in its own registry: an object or array keyed by name. Add an entry and it shows up in:
- the query enum, so it's validated;
- the OpenAPI spec and `/docs`;
- `/meta` and `/random`.

There's no route or doc wiring to touch.

### Add a dataset

1. Create `src/datasets/my-dataset.ts`:

   ```ts
   import { z } from "@hono/zod-openapi";
   import { dailyShape, intervals } from "../lib/london";      // or settlementPeriods for half-hour GB periods
   import { between, round } from "../lib/rng";
   import { list, type Dataset } from "./types";

   export const myDataset: Dataset = {
     id: "my-dataset",                       // URL: /{auth}/v1/my-dataset
     title: "My dataset",
     description: "What it is, units, quirks.",
     basis: "interval",                      // "settlement" ignores ?granularity=
     filters: {                              // optional extra query params (documented automatically)
       site: z.string().optional().openapi({ description: "Comma-separated site ids" }),
     },
     valueFields: ["reading.value"],         // measures (dotted); ?duplicates= edits these
     timeFields: ["ts"],                     // shown by /random
     seriesKey: "site",                      // optional: what separates records sharing a time
     example: { ts: "2026-10-14T13:30:00Z", site: "A", reading: { value: 12.5 } },
     generate: (ctx) => {
       const sites = list(ctx.filters.site) ?? ["A", "B"];
       return intervals(ctx.from, ctx.to, ctx.stepMs).flatMap(({ start }) =>
         sites.map((site) => {
           const key = `${start.getTime()}|${site}|${ctx.revision}`;   // seed: time + key + revision
           return {
             ts: ctx.time(start),                                                   // always format times via ctx.time
             site,
             reading: { value: ctx.value(round(10 * dailyShape(start) * between(0.9, 1.1, "x", key)), `v|${key}`) },
           };
         }),
       );
     },
   };
   ```

2. Add it to the array in `src/datasets/index.ts`.

Rules that keep every option working on your dataset:
- **Times:** write them through `ctx.time(date)`.
- **Measures:** write them through `ctx.value(number, uniqueKey)`.
- **Settlement dates and periods:** use `ctx.date(...)` and `ctx.period(...)`.
- **Randomness:** use `between`/`rand` with a seed that includes the time, the series key and `ctx.revision`. Never use `Math.random`, or responses stop being repeatable.

### Add a time format, value style, envelope or scenario

Add one entry to the matching object:

| Thing | File | Entry |
|---|---|---|
| Time format | `src/formats/time.ts` → `timeFormats` | `{ description, note?, render: (d: Date) => string \| number }` |
| Value style | `src/formats/values.ts` → `valueStyles` | `{ description, render: (v: number, key: string) => unknown }` |
| Date / period style | `src/formats/values.ts` → `dateStyles` / `periodStyles` | `{ description, render }` |
| Envelope | `src/envelopes.ts` → `envelopes` | `{ description, recordsPath, single?, wrap: (records, meta) => body }` |
| Scenario | `src/scenarios.ts` → `scenarios` | `{ description, run: (c, params, body) => Response }`. Call `body()` only if you need the normal body. A new scenario parameter goes in `ScenarioParams` and `commonQuery`. |
| Preset | `src/cases.ts` → `cases` | `{ dataset, query: { …params }, description }` |
| Auth mode | `src/auth.ts` → `authModes` | `{ description, security, headers, check }`. Its routes (`/{mode}/v1/…`) are created automatically. Add any new scheme to `securitySchemes`. |

### Add a query parameter for every dataset

Add it to `commonQuery` in `src/query.ts`, with `.openapi({ description })`, and use it in `src/serve.ts`. A parameter for only one dataset belongs in that dataset's `filters`.

### Upgrading dependencies

```bash
bun update            # or: bun add hono@latest @hono/zod-openapi@latest @hono/swagger-ui@latest zod@latest
bun run typecheck && bun run test && bun run spec
```

`@hono/zod-openapi` 1.x pairs with Zod 4. Import `z` from `@hono/zod-openapi`, not from `zod`, so `.openapi()` is available.

---

## Deploying

The app in `src/app.ts` uses only web-standard APIs, so it runs on Bun, Node, Vercel and Cloudflare Workers.

- **Local / any server:** `bun run start`, which uses `server.ts`.
- **Vercel:** import the repo; no `vercel.json` is needed. Vercel detects `src/index.ts`, which imports `hono` and default-exports the app.
  - Set the `STUB_*` variables in the project settings. Otherwise the defaults above work for anyone.
  - `scenario=delay` (35 s) needs a function `maxDuration` above that.
  - `scenario=huge` may hit Vercel's response-size limit, so use `sizeMb` of 4 or less there.
  - Consider a lower `STUB_MAX_RECORDS` to keep function CPU time low.
- **Cloudflare Workers:** `src/index.ts` works as the Worker entry. `process.env` needs the `nodejs_compat` flag. The free plan's 10 ms CPU limit is too low for large windows.

## Known limits

- **In-memory state.** Flaky counters and OAuth tokens are kept in memory per process. On serverless hosts (several instances, frequent restarts), `flaky` counts and issued tokens aren't shared between requests. Planned fix: signed tokens (`STUB_JWT_SECRET`) and an external store for the counters.
- **Interval alignment.** Intervals are aligned to UTC, and `1d` days start at UTC midnight. Settlement datasets follow London days.
- **No tests yet.** `bun test` is wired up but has nothing to run.
