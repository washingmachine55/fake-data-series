import app from "./src/index";
import { config } from "./src/config";

console.log(
  `stubbur on http://localhost:${config.port}  (docs: /docs, spec: /openapi.json)`,
);

export default {
  port: config.port,
  fetch: app.fetch,
  // Bun closes idle connections after 10 s by default, which would cut scenario=delay short.
  idleTimeout: 0,
};
