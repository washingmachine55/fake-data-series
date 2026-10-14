// Bun loads .env automatically. Defaults keep the server usable with no setup.
export const config = {
  port: Number(Bun.env.PORT ?? 4070),
  apiKey: Bun.env.STUB_API_KEY ?? "stub-api-key",
  bearerToken: Bun.env.STUB_BEARER_TOKEN ?? "stub-bearer-token",
  clientId: Bun.env.STUB_CLIENT_ID ?? "stub-client",
  clientSecret: Bun.env.STUB_CLIENT_SECRET ?? "stub-secret",
  // A request that would generate more records than this is refused (400).
  maxRecords: Number(Bun.env.STUB_MAX_RECORDS ?? 100_000),
};
