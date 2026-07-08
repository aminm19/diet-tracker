import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { SHARED_SCAFFOLD_MARKER } from "shared";
import { onError } from "./errorHandler.js";
import { visitorIdMiddleware } from "./middleware/visitorId.js";
import { foodsRoute } from "./routes/foods.js";
import { goalsRoute } from "./routes/goals.js";
import { healthScoreRoute } from "./routes/healthScore.js";
import { logsRoute } from "./routes/logs.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "https://diet-tracker-client.vercel.app"],
    allowHeaders: ["Content-Type", "X-Visitor-Id"],
  }),
);

app.get("/health", (c) => {
  return c.json({ status: "ok" }, 200);
});

app.route("/api/foods", foodsRoute);
app.use("/api/goals/*", visitorIdMiddleware);
app.route("/api/goals", goalsRoute);
app.use("/api/health-score/*", visitorIdMiddleware);
app.route("/api/health-score", healthScoreRoute);
app.use("/api/logs/*", visitorIdMiddleware);
app.route("/api/logs", logsRoute);

app.onError(onError);

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
