import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { goalsSchema } from "shared";
import { getGoals, upsertGoals } from "../services/goals.js";

export const goalsRoute = new Hono();

goalsRoute.get("/", async (c) => {
  const visitorId = c.get("visitorId");
  const goals = await getGoals(visitorId);
  return c.json(goals, 200);
});

goalsRoute.put("/", zValidator("json", goalsSchema), async (c) => {
  const body = c.req.valid("json");
  const visitorId = c.get("visitorId");
  const goals = await upsertGoals(body, visitorId);
  return c.json(goals, 200);
});
