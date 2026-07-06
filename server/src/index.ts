import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { SHARED_SCAFFOLD_MARKER } from "shared";
import { foodsRoute } from "./routes/foods.js";
import { logsRoute } from "./routes/logs.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"],
  }),
);

app.get("/health", (c) => {
  return c.json({ status: "ok" }, 200);
});

app.route("/api/foods", foodsRoute);
app.route("/api/logs", logsRoute);

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const port = Number(process.env.PORT) || 3000;

  serve({ fetch: app.fetch, port }, (info) => {
    // Smoke test confirming the `shared` workspace package resolves correctly.
    console.log(`shared package resolved: ${SHARED_SCAFFOLD_MARKER}`);
    console.log(`Server listening on http://localhost:${info.port}`);
  });
}

export default app;
