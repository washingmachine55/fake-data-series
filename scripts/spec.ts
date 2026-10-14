/// <reference types="bun" />
// Writes the OpenAPI spec to openapi.json, for sharing or importing into other tools.
// The running server serves the same document at /openapi.json.
import { createApp, openApiInfo } from "../src/app.js";

const doc = createApp().getOpenAPI31Document(openApiInfo);
await Bun.write("openapi.json", JSON.stringify(doc, null, 2) + "\n");
console.log(`openapi.json: ${Object.keys(doc.paths ?? {}).length} paths`);
