// Reads the anonymous per-browser `X-Visitor-Id` header the client generates
// and stores in localStorage. This is the entire "auth" story for this demo
// app — no real accounts, just enough separation that each browser gets its
// own blank slate. Applied only to the route groups whose data is
// per-visitor (logs, goals, health-score settings); food search/lookup stays
// global and doesn't use this.
import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    visitorId: string;
  }
}

export const visitorIdMiddleware: MiddlewareHandler = async (c, next) => {
  const visitorId = c.req.header("X-Visitor-Id");
  if (!visitorId || visitorId.trim().length === 0) {
    return c.json({ error: "X-Visitor-Id header is required" }, 400);
  }

  c.set("visitorId", visitorId);
  await next();
};
