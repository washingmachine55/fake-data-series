// Builds the app from the registries: every dataset under every auth mode, the presets,
// OAuth token issuing, echo, and the generated OpenAPI spec + Swagger UI.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { authModes, basicCredentials, issueToken, securitySchemes, type AuthModeName } from "./auth.js";
import { cases } from "./cases.js";
import { config } from "./config.js";
import { datasetById, datasets } from "./datasets/index.js";
import type { Dataset } from "./datasets/types.js";
import { envelopes } from "./envelopes.js";
import { timeFormats } from "./formats/time.js";
import { valueStyles } from "./formats/values.js";
import { getPath } from "./lib/paths.js";
import { datasetQuery, type DatasetQuery } from "./query.js";
import { suggest, type Suggestion } from "./random.js";
import { resetScenarios, scenarios } from "./scenarios.js";
import { serveDataset } from "./serve.js";

const errorBody = z.object({ error: z.string(), message: z.string().optional() });
const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

function datasetRoute(ds: Dataset, mode: AuthModeName) {
  const auth = authModes[mode];
  return createRoute({
    method: "get",
    path: `/${mode}/v1/${ds.id}`,
    tags: [ds.title],
    summary: `${ds.title} (${mode})`,
    description: `${ds.description}\n\nAuth: ${auth.description}\n\nBasis: ${ds.basis === "settlement" ? "GB settlement periods (Europe/London)" : "fixed intervals (?granularity=)"}.`,
    security: auth.security.map((name) => ({ [name]: [] })),
    request: { query: datasetQuery(ds) },
    responses: {
      200: json(z.object({ data: z.array(z.record(z.string(), z.unknown())) }).openapi({ example: { data: [ds.example] } }), "Records (shape set by ?envelope=, body by ?scenario=)"),
      400: json(errorBody, "Invalid query or window"),
      401: json(errorBody, "Missing or expired credentials"),
      403: json(errorBody, "Wrong credentials"),
    },
  });
}

export function createApp() {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "invalid request", issues: result.error.issues }, 400);
    },
  });

  for (const [name, scheme] of Object.entries(securitySchemes)) {
    app.openAPIRegistry.registerComponent("securitySchemes", name, scheme as never);
  }

  for (const [name, mode] of Object.entries(authModes)) app.use(`/${name}/*`, mode.check);

  for (const ds of datasets) {
    for (const mode of Object.keys(authModes) as AuthModeName[]) {
      app.openapi(datasetRoute(ds, mode), (c) => serveDataset(c, ds, c.req.valid("query") as DatasetQuery) as never);
    }
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/cases",
      tags: ["Cases"],
      summary: "List the named edge-case presets",
      responses: { 200: json(z.record(z.string(), z.object({ dataset: z.string(), url: z.string(), description: z.string() })), "Presets") },
    }),
    (c) =>
      c.json(
        Object.fromEntries(
          Object.entries(cases).map(([name, k]) => [name, { dataset: k.dataset, url: `/cases/${name}`, description: k.description }]),
        ),
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/cases/{name}",
      tags: ["Cases"],
      summary: "Serve a named preset (no auth); request params override the preset's",
      description: Object.entries(cases)
        .map(([name, k]) => `- \`${name}\` (${k.dataset}): ${k.description}`)
        .join("\n"),
      request: { params: z.object({ name: z.enum(Object.keys(cases) as [string, ...string[]]) }) },
      responses: { 200: json(z.unknown(), "As the dataset route"), 400: json(errorBody, "Invalid query") },
    }),
    (c) => {
      const preset = cases[c.req.valid("param").name]!;
      const ds = datasetById.get(preset.dataset)!;
      const parsed = datasetQuery(ds).safeParse({ ...preset.query, ...c.req.query() });
      if (!parsed.success) return c.json({ error: "invalid request", issues: parsed.error.issues }, 400) as never;
      return serveDataset(c, ds, parsed.data as DatasetQuery) as never;
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/oauth/token",
      tags: ["Auth"],
      summary: "OAuth 2 client_credentials: get a bearer token for the /bearer routes",
      description: "Client id and secret in the body or as HTTP Basic. `expires_in` (seconds, default 3600) sets the lifetime, to test expiry.",
      request: {
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                grant_type: z.literal("client_credentials"),
                client_id: z.string().optional(),
                client_secret: z.string().optional(),
                expires_in: z.coerce.number().int().min(1).optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: json(z.object({ access_token: z.string(), token_type: z.literal("Bearer"), expires_in: z.number() }), "Token"),
        400: json(z.object({ error: z.string() }), "Bad grant"),
        401: json(z.object({ error: z.string() }), "Bad client"),
      },
    }),
    async (c) => {
      const type = c.req.header("Content-Type") ?? "";
      const body: Record<string, unknown> = type.includes("json") ? await c.req.json() : await c.req.parseBody();
      if (body.grant_type !== "client_credentials") return c.json({ error: "unsupported_grant_type" }, 400);
      const basic = basicCredentials(c.req.header("Authorization"));
      const id = basic?.id ?? body.client_id;
      const secret = basic?.secret ?? body.client_secret;
      if (id !== config.clientId || secret !== config.clientSecret) return c.json({ error: "invalid_client" }, 401);
      const ttl = Number(body.expires_in ?? 3600);
      return c.json({ access_token: issueToken(ttl), token_type: "Bearer" as const, expires_in: ttl }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/echo/{path}",
      tags: ["Tools"],
      summary: "Echo the request back (any method, any sub-path); secrets are masked",
      request: { params: z.object({ path: z.string() }) },
      responses: { 200: json(z.object({ method: z.string(), path: z.string(), query: z.record(z.string(), z.array(z.string())), headers: z.record(z.string(), z.string()) }), "The request") },
    }),
    (c) => echo(c.req.raw) as never,
  );
  app.all("/echo/*", (c) => echo(c.req.raw));

  app.openapi(
    createRoute({
      method: "get",
      path: "/random",
      tags: ["Tools"],
      summary: "Suggest a random request: a full URL to copy, its headers, and where the values sit",
      description:
        "Picks a dataset, auth mode, window and formats at random and returns the URL, headers and a curl command, the dotted/JSONPath paths of the records, times and values, and a preview: the first record and its values, fetched from this server.",
      request: {
        query: z.object({
          seed: z.string().optional().openapi({ description: "Repeat a suggestion. Default: a new random seed (returned in the response)." }),
          dataset: z.enum(datasets.map((d) => d.id) as [string, ...string[]]).optional().openapi({ description: "Pin the dataset." }),
          auth: z.enum(Object.keys(authModes) as [AuthModeName, ...AuthModeName[]]).optional().openapi({ description: "Pin the auth mode." }),
          chaos: z.enum(["true", "false"]).default("false").openapi({ description: "Also pick failure scenarios. No preview is fetched for them." }),
        }),
      },
      responses: { 200: json(z.record(z.string(), z.unknown()), "The suggestion") },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const s = suggest(new URL(c.req.url).origin, { seed: q.seed ?? crypto.randomUUID().slice(0, 8), dataset: q.dataset, auth: q.auth, chaos: q.chaos === "true" });
      return c.json({ ...s, preview: s.settings.scenario ? null : await preview(app, s) });
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/admin/reset",
      tags: ["Tools"],
      summary: "Reset flaky-scenario counters",
      responses: { 200: json(z.object({ reset: z.boolean() }), "Done") },
    }),
    (c) => {
      resetScenarios();
      return c.json({ reset: true });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/meta",
      tags: ["Tools"],
      summary: "Everything the server can do, as JSON",
      responses: { 200: json(z.record(z.string(), z.unknown()), "Datasets, formats, envelopes, scenarios, auth modes, cases") },
    }),
    (c) => {
      const sample = new Date("2026-07-14T13:30:00Z");
      return c.json({
        datasets: datasets.map(({ id, title, description, basis, valueFields, timeFields, seriesKey, example }) => ({
          id,
          title,
          description,
          basis,
          valueFields,
          timeFields,
          seriesKey,
          example,
        })),
        timeFormats: Object.fromEntries(Object.entries(timeFormats).map(([k, f]) => [k, { ...f, render: undefined, example: f.render(sample) }])),
        valueStyles: Object.fromEntries(Object.entries(valueStyles).map(([k, v]) => [k, v.description])),
        envelopes: Object.fromEntries(Object.entries(envelopes).map(([k, v]) => [k, v.description])),
        scenarios: Object.fromEntries(Object.entries(scenarios).map(([k, v]) => [k, v.description])),
        authModes: Object.fromEntries(Object.entries(authModes).map(([k, v]) => [k, v.description])),
        cases: Object.keys(cases),
      });
    },
  );

  app.doc31("/openapi.json", openApiInfo);
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));
  app.get("/", (c) => c.redirect("/docs"));
  return app;
}

export const openApiInfo = {
  openapi: "3.1.0",
  info: {
    title: "stubbur",
    version: "1.0.0",
    description:
      "Deterministic stub data API for testing ingestion: GB settlement and interval datasets, every common timestamp and value format, envelopes, auth styles and failure scenarios. Routes: `/{auth}/v1/{dataset}`, presets at `/cases/{name}`.",
  },
};

/** Fetches a suggestion from this app and picks out its first record and values. */
async function preview(app: OpenAPIHono, s: Suggestion) {
  const res = await app.request(s.path, { headers: s.headers });
  const body: unknown = await res.json();
  const records = getPath(body, s.response.recordsPath);
  const first = Array.isArray(records) ? records[0] : records;
  return {
    status: res.status,
    recordCount: Array.isArray(records) ? records.length : records == null ? 0 : 1,
    firstRecord: first ?? null,
    firstValues: Object.fromEntries(
      [...s.response.values, ...s.response.times, ...(s.response.seriesKey ? [s.response.seriesKey] : [])].map((f) => [f.path, getPath(first, f.field)]),
    ),
  };
}

const SECRET_HEADERS = new Set(["authorization", "x-api-key", "x-client-secret", "proxy-authorization", "cookie"]);

function echo(req: Request) {
  const url = new URL(req.url);
  const query: Record<string, string[]> = {};
  for (const [k, v] of url.searchParams) (query[k] ??= []).push(k === "api_key" ? mask(v) : v);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = SECRET_HEADERS.has(k) ? mask(v) : v));
  return Response.json({ method: req.method, path: url.pathname.replace(/^\/echo/, "") || "/", query, headers });
}

const mask = (v: string) => (v.length <= 8 ? "***" : `${v.slice(0, 4)}…${v.slice(-2)}`);
