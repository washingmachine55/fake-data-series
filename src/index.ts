// Entrypoint for hosts that take a default-exported Hono app (Vercel, Cloudflare Workers,
// Deno). Vercel only recognises an entry file that imports "hono" itself. Locally, Bun runs
// server.ts instead.
import { Hono } from "hono";
import { createApp } from "./app.js";

const app = new Hono().route("/", createApp());

export default app;
