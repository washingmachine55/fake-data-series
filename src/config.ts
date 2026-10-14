// process.env works on Bun (which also loads .env), Node and Vercel. Defaults keep the
// server usable with no setup.
const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4070),
  apiKey: env.STUB_API_KEY ?? "stub-api-key",
  bearerToken: env.STUB_BEARER_TOKEN ?? "stub-bearer-token",
  clientId: env.STUB_CLIENT_ID ?? "stub-client",
  clientSecret: env.STUB_CLIENT_SECRET ?? "stub-secret",
  // A request that would generate more records than this is refused (400).
  maxRecords: Number(env.STUB_MAX_RECORDS ?? 100_000),
};
