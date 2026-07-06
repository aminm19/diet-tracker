import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { getFoodById, searchFoods } from "../services/foodSearch.js";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required"),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const foodsRoute = new Hono();

foodsRoute.get("/search", zValidator("query", searchQuerySchema), async (c) => {
  const { q } = c.req.valid("query");
  const results = await searchFoods(q);
  return c.json(results, 200);
});

foodsRoute.get("/:id", zValidator("param", idParamSchema), async (c) => {
  const { id } = c.req.valid("param");
  const food = await getFoodById(id);
  if (!food) {
    return c.json({ error: "Food not found" }, 404);
  }
  return c.json(food, 200);
});
