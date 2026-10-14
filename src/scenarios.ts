// How the server answers (?scenario=): success, slowness, errors, bad bodies, redirects.
// Add one by adding an entry; `body()` builds the normal response body on demand.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ScenarioParams {
  delayMs: number;
  status: number;
  retryAfter: number;
  failTimes: number;
  flakyKey?: string;
  sizeMb: number;
  hops: number;
}

export interface Scenario {
  description: string;
  run: (c: Context, p: ScenarioParams, body: () => unknown) => Response | Promise<Response>;
}

const JSON_TYPE = { "Content-Type": "application/json" };

// Failures served per flaky key; POST /admin/reset clears them.
const failures = new Map<string, number>();
export const resetScenarios = () => failures.clear();

export const scenarios = {
  ok: { description: "200 with the data", run: (c, _p, body) => c.json(body()) },
  delay: {
    description: "waits delayMs (default 35000) and then answers 200; for client timeouts",
    run: async (c, p, body) => {
      await new Promise((resolve) => setTimeout(resolve, p.delayMs));
      return c.json(body());
    },
  },
  status: {
    description: "answers `status` (default 500) with a JSON error; 429 and 503 add Retry-After: retryAfter",
    run: (c, p) => {
      if (p.status === 429 || p.status === 503) c.header("Retry-After", String(p.retryAfter));
      return c.json({ error: `scenario status ${p.status}` }, p.status as ContentfulStatusCode);
    },
  },
  flaky: {
    description: "fails with 500 the first failTimes (default 2) calls per flakyKey (default: the path), then answers 200",
    run: (c, p, body) => {
      const key = p.flakyKey ?? new URL(c.req.url).pathname;
      const served = failures.get(key) ?? 0;
      if (served < p.failTimes) {
        failures.set(key, served + 1);
        return c.json({ error: `flaky failure ${served + 1} of ${p.failTimes}` }, 500);
      }
      return c.json(body());
    },
  },
  no_content: { description: "204 with no body", run: (c) => c.body(null, 204) },
  html: {
    description: "200 with an HTML maintenance page",
    run: (c) => c.html("<!doctype html><title>Maintenance</title><h1>We'll be back soon</h1>"),
  },
  text_content_type: {
    description: "200 with the JSON body but Content-Type: text/plain",
    run: (c, _p, body) => c.body(JSON.stringify(body()), 200, { "Content-Type": "text/plain" }),
  },
  broken_json: {
    description: "200 with invalid JSON (trailing comma, unclosed)",
    run: (c) => c.body('{"data": [{"price": 81.5,}', 200, JSON_TYPE),
  },
  truncated_json: {
    description: "200 with the first half of the real body",
    run: (c, _p, body) => {
      const text = JSON.stringify(body());
      return c.body(text.slice(0, Math.floor(text.length / 2)), 200, JSON_TYPE);
    },
  },
  gzip: {
    description: "200 with the body gzip-compressed (Content-Encoding: gzip), whatever the client asked for",
    run: (_c, _p, body) =>
      new Response(new Blob([JSON.stringify(body())]).stream().pipeThrough(new CompressionStream("gzip")), {
        headers: { ...JSON_TYPE, "Content-Encoding": "gzip" },
      }),
  },
  huge: {
    description: "200 streaming a valid {\"data\": [...]} of about sizeMb (default 12) MB",
    run: (_c, p) => new Response(hugeBody(p.sizeMb), { headers: JSON_TYPE }),
  },
  redirect: {
    description: "302 to the same URL `hops` times (default 1), then 200",
    run: (c, p, body) => {
      if (p.hops <= 0) return c.json(body());
      const next = new URL(c.req.url);
      next.searchParams.set("hops", String(p.hops - 1));
      return c.redirect(next.toString(), 302);
    },
  },
  redirect_private: {
    description: "302 to a link-local metadata address (http://169.254.169.254/latest/meta-data/)",
    run: (c) => c.redirect("http://169.254.169.254/latest/meta-data/", 302),
  },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof scenarios;

function hugeBody(sizeMb: number): ReadableStream<Uint8Array> {
  const record = JSON.stringify({ startTime: "2026-10-14T13:30:00Z", price: 81.5, filler: "x".repeat(1000) });
  const batch = Array(100).fill(record).join(",");
  const target = sizeMb * 1024 * 1024;
  const encoder = new TextEncoder();
  let sent = 0;
  return new ReadableStream({
    pull(ctrl) {
      const piece = (sent === 0 ? '{"data":[' : ",") + batch;
      sent += piece.length;
      ctrl.enqueue(encoder.encode(sent >= target ? piece + "]}" : piece));
      if (sent >= target) ctrl.close();
    },
  });
}
