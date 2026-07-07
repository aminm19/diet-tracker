import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  createLogRequestSchema,
  getLogsQuerySchema,
  logIdParamSchema,
  updateLogRequestSchema,
} from "shared";
import { createLog, deleteLog, getLogsByDate, updateLog } from "../services/logs.js";

export const logsRoute = new Hono();

logsRoute.post("/", zValidator("json", createLogRequestSchema), async (c) => {
  const body = c.req.valid("json");

  const entry = await createLog(body);
  if (!entry) {
    return c.json({ error: "Food not found" }, 404);
  }
  return c.json(entry, 201);
});

logsRoute.get("/", zValidator("query", getLogsQuerySchema), async (c) => {
  const { date } = c.req.valid("query");
  const result = await getLogsByDate(date);
  return c.json(result, 200);
});

logsRoute.patch(
  "/:id",
  zValidator("param", logIdParamSchema),
  zValidator("json", updateLogRequestSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");

    const entry = await updateLog(id, patch);
    if (!entry) {
      return c.json({ error: "Log entry not found" }, 404);
    }
    return c.json(entry, 200);
  },
);

logsRoute.delete("/:id", zValidator("param", logIdParamSchema), async (c) => {
  const { id } = c.req.valid("param");
  const deleted = await deleteLog(id);
  if (!deleted) {
    return c.json({ error: "Log entry not found" }, 404);
  }
  return c.body(null, 204);
});
