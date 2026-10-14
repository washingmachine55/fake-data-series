// Auth modes: each is a path prefix (/open, /apikey, …) guarding every dataset route.
// Add a mode by adding an entry to `authModes`; the routes and the spec follow.
import type { Context, MiddlewareHandler } from "hono";
import { config } from "./config";

export interface AuthMode {
  description: string;
  /** Security scheme names in the OpenAPI spec (see securitySchemes). */
  security: string[];
  /** Headers a client sends to pass, for /random's ready-to-use suggestions. */
  headers: () => Record<string, string>;
  check: MiddlewareHandler;
}

// Tokens issued by POST /oauth/token → expiry (ms).
const issued = new Map<string, number>();

export function issueToken(ttlSeconds: number): string {
  const token = crypto.randomUUID();
  issued.set(token, Date.now() + ttlSeconds * 1000);
  return token;
}

const unauthorized = (c: Context, message: string, challenge?: string) => {
  if (challenge) c.header("WWW-Authenticate", challenge);
  return c.json({ error: "unauthorized", message }, 401);
};
const forbidden = (c: Context, message: string) => c.json({ error: "forbidden", message }, 403);

/** client id and secret from `Authorization: Basic …`, or null. */
export function basicCredentials(header?: string): { id: string; secret: string } | null {
  const m = /^Basic\s+(.+)$/i.exec(header ?? "");
  if (!m?.[1]) return null;
  const [id = "", ...rest] = atob(m[1]).split(":");
  return { id, secret: rest.join(":") };
}

export const authModes = {
  open: { description: "no auth", security: [], headers: () => ({}), check: async (_c, next) => next() },
  apikey: {
    description: "API key in a header (X-API-Key, or the name in ?keyHeader=) or ?api_key=. Missing → 401, wrong → 403.",
    security: ["ApiKeyHeader", "ApiKeyQuery"],
    headers: () => ({ "X-API-Key": config.apiKey }),
    check: async (c, next) => {
      const header = c.req.query("keyHeader") ?? "X-API-Key";
      const key = c.req.header(header) ?? c.req.query("api_key");
      if (!key) return unauthorized(c, `send the API key in the ${header} header or ?api_key=`);
      if (key !== config.apiKey) return forbidden(c, "wrong API key");
      await next();
    },
  },
  bearer: {
    description: "Authorization: Bearer <token>: the static token, or one from POST /oauth/token (which expires).",
    security: ["BearerToken", "OAuth2"],
    headers: () => ({ Authorization: `Bearer ${config.bearerToken}` }),
    check: async (c, next) => {
      const token = /^Bearer\s+(.+)$/i.exec(c.req.header("Authorization") ?? "")?.[1]?.trim();
      if (!token) return unauthorized(c, "send Authorization: Bearer <token>", 'Bearer realm="stubbur"');
      if (token !== config.bearerToken) {
        const expiry = issued.get(token);
        if (!expiry) return unauthorized(c, "unknown token", 'Bearer error="invalid_token"');
        if (expiry < Date.now()) return unauthorized(c, "token expired", 'Bearer error="invalid_token", error_description="expired"');
      }
      await next();
    },
  },
  basic: {
    description: "Authorization: Basic base64(client_id:client_secret).",
    security: ["BasicClient"],
    headers: () => ({ Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}` }),
    check: async (c, next) => {
      const creds = basicCredentials(c.req.header("Authorization"));
      if (!creds) return unauthorized(c, "send Authorization: Basic base64(client_id:client_secret)", 'Basic realm="stubbur"');
      if (creds.id !== config.clientId || creds.secret !== config.clientSecret) return forbidden(c, "wrong client id or secret");
      await next();
    },
  },
  client_headers: {
    description: "Client id and secret as two headers: X-Client-Id and X-Client-Secret.",
    security: ["ClientIdHeader"],
    headers: () => ({ "X-Client-Id": config.clientId, "X-Client-Secret": config.clientSecret }),
    check: async (c, next) => {
      const id = c.req.header("X-Client-Id");
      const secret = c.req.header("X-Client-Secret");
      if (!id || !secret) return unauthorized(c, "send X-Client-Id and X-Client-Secret");
      if (id !== config.clientId || secret !== config.clientSecret) return forbidden(c, "wrong client id or secret");
      await next();
    },
  },
} satisfies Record<string, AuthMode>;

export type AuthModeName = keyof typeof authModes;

export const securitySchemes = {
  ApiKeyHeader: { type: "apiKey", in: "header", name: "X-API-Key" },
  ApiKeyQuery: { type: "apiKey", in: "query", name: "api_key" },
  BearerToken: { type: "http", scheme: "bearer" },
  BasicClient: { type: "http", scheme: "basic" },
  ClientIdHeader: { type: "apiKey", in: "header", name: "X-Client-Id", description: "Also send X-Client-Secret." },
  OAuth2: { type: "oauth2", flows: { clientCredentials: { tokenUrl: "/oauth/token", scopes: {} } } },
} as const;
