// process.env on Bun (which also loads .env), Node and Vercel; read through globalThis so
// no Node type definitions are needed. Defaults keep the server usable with no setup.
type Env = Record<string, string | undefined>;
const env: Env = (globalThis as { process?: { env?: Env } }).process?.env ?? {};

export const config = {
  port: Number(env.PORT ?? 4070),
  apiKey: env.STUB_API_KEY ?? "stub-api-key",
  bearerToken: env.STUB_BEARER_TOKEN ?? "stub-bearer-token",
  clientId: env.STUB_CLIENT_ID ?? "stub-client",
  clientSecret: env.STUB_CLIENT_SECRET ?? "stub-secret",
  // A request that would generate more records than this is refused (400).
  maxRecords: Number(env.STUB_MAX_RECORDS ?? 100_000),
};
