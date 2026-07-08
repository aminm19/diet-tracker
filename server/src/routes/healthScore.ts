import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getHealthScoreQuerySchema, healthScoreSettingsSchema } from "shared";
import { computeHealthScore, getHealthScoreSettings, upsertHealthScoreSettings } from "../services/healthScore.js";

export const healthScoreRoute = new Hono();

healthScoreRoute.get("/settings", async (c) => {
  const visitorId = c.get("visitorId");
  const settings = await getHealthScoreSettings(visitorId);
  return c.json(settings, 200);
});

healthScoreRoute.put("/settings", zValidator("json", healthScoreSettingsSchema), async (c) => {
  const body = c.req.valid("json");
  const visitorId = c.get("visitorId");
  const settings = await upsertHealthScoreSettings(body, visitorId);
  return c.json(settings, 200);
});

healthScoreRoute.get("/", zValidator("query", getHealthScoreQuerySchema), async (c) => {
  const { date } = c.req.valid("query");
  const visitorId = c.get("visitorId");
  const result = await computeHealthScore(date, visitorId);
  return c.json(result, 200);
});
