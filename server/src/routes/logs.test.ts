// Route-level tests for /api/logs/*. The service layer is mocked so these
// tests focus purely on Zod validation + status-code wiring, exercised
// in-process via Hono's `app.request` (no real network server spun up) —
// mirrors the pattern in routes/foods.test.ts. The `visitorIdMiddleware` is
// mounted here too (mirroring how `index.ts` wires it up), so requests must
// carry an `X-Visitor-Id` header just like against the real app.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { LogEntry } from "shared";
import type { CreateLogInput, LogsForDate, UpdateLogInput } from "../services/logs.js";

const createLog = vi.fn<(input: CreateLogInput, visitorId: string) => Promise<LogEntry | null>>();
const getLogsByDate = vi.fn<(date: string, visitorId: string) => Promise<LogsForDate>>();
const updateLog =
  vi.fn<(id: number, patch: UpdateLogInput, visitorId: string) => Promise<LogEntry | null>>();
const deleteLog = vi.fn<(id: number, visitorId: string) => Promise<boolean>>();

class FakeInvalidServingSizeError extends Error {
  constructor(foodName: string) {
    super(`"${foodName}" doesn't have a serving size on record; log it using "g" or "oz" instead.`);
    this.name = "InvalidServingSizeError";
  }
}

vi.mock("../services/logs.js", () => ({
  createLog: (input: CreateLogInput, visitorId: string) => createLog(input, visitorId),
  getLogsByDate: (date: string, visitorId: string) => getLogsByDate(date, visitorId),
  updateLog: (id: number, patch: UpdateLogInput, visitorId: string) =>
    updateLog(id, patch, visitorId),
  deleteLog: (id: number, visitorId: string) => deleteLog(id, visitorId),
  InvalidServingSizeError: FakeInvalidServingSizeError,
}));

const { logsRoute } = await import("./logs.js");
const { onError } = await import("../errorHandler.js");
const { visitorIdMiddleware } = await import("../middleware/visitorId.js");

const VISITOR_ID = "visitor-a";

const app = new Hono();
app.use("/api/logs/*", visitorIdMiddleware);
app.route("/api/logs", logsRoute);
// index.ts registers this same handler on the real app; wire it up here too
// since these tests mount logsRoute on a standalone Hono instance.
app.onError(onError);

// Convenience wrapper so every existing test only has to add the header
// once, at the request site, rather than duplicating it per test.
function withVisitor(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers ?? {}), "X-Visitor-Id": VISITOR_ID },
  };
}

const sampleEntry: LogEntry = {
  id: 1,
  loggedDate: "2026-07-01",
  foodId: 1,
  amount: 100,
  unit: "g",
  calories: 143,
  protein: 18.51,
  carbs: 3.49,
  fat: 5.28,
  sugar: null,
  sodium: 660,
};

beforeEach(() => {
  createLog.mockReset();
  getLogsByDate.mockReset();
  updateLog.mockReset();
  deleteLog.mockReset();
});

describe("POST /api/logs", () => {
  const validBody = { foodId: 1, loggedDate: "2026-07-01", amount: 100, unit: "g" };

  it("returns 201 with the created entry for a valid body", async () => {
    createLog.mockResolvedValue(sampleEntry);

    const res = await app.request(
      "/api/logs",
      withVisitor({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(sampleEntry);
    expect(createLog).toHaveBeenCalledWith(validBody, VISITOR_ID);
  });

  it("returns 404 when the food id doesn't exist", async () => {
    createLog.mockResolvedValue(null);

    const res = await app.request(
      "/api/logs",
      withVisitor({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when the service rejects an invalid serving-size request", async () => {
    createLog.mockRejectedValue(new FakeInvalidServingSizeError("Chicken roll"));

    const res = await app.request(
      "/api/logs",
      withVisitor({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, unit: "serving" }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Chicken roll");
  });

  it("returns 400 for a malformed loggedDate", async () => {
    const res = await app.request(
      "/api/logs",
      withVisitor({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, loggedDate: "07/01/2026" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(createLog).not.toHaveBeenCalled();
  });

  it("returns 400 for a nonexistent calendar date (e.g. 2026-13-45)", async () => {
    const res = await app.request(
      "/api/logs",
      withVisitor({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, loggedDate: "2026-13-45" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(createLog).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid unit value", async () => {
    const res = await app.request(
      "/api/logs",
      withVisitor({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, unit: "lbs" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(createLog).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-positive amount", async () => {
    const res = await app.request(
      "/api/logs",
      withVisitor({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, amount: 0 }),
      }),
    );

    expect(res.status).toBe(400);
    expect(createLog).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing foodId", async () => {
    const res = await app.request(
      "/api/logs",
      withVisitor({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loggedDate: "2026-07-01", amount: 100, unit: "g" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(createLog).not.toHaveBeenCalled();
  });
});

describe("GET /api/logs", () => {
  it("returns 200 with entries + totals for a valid date", async () => {
    const payload: LogsForDate = {
      entries: [sampleEntry],
      totals: { calories: 143, protein: 18.51, carbs: 3.49, fat: 5.28 },
    };
    getLogsByDate.mockResolvedValue(payload);

    const res = await app.request("/api/logs?date=2026-07-01", withVisitor());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(getLogsByDate).toHaveBeenCalledWith("2026-07-01", VISITOR_ID);
  });

  it("returns 400 for a missing date", async () => {
    const res = await app.request("/api/logs", withVisitor());

    expect(res.status).toBe(400);
    expect(getLogsByDate).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed date", async () => {
    const res = await app.request("/api/logs?date=not-a-date", withVisitor());

    expect(res.status).toBe(400);
    expect(getLogsByDate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/logs/:id", () => {
  it("returns 200 with the updated entry for a valid partial body", async () => {
    const updated = { ...sampleEntry, amount: 200, calories: 286 };
    updateLog.mockResolvedValue(updated);

    const res = await app.request(
      "/api/logs/1",
      withVisitor({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 200 }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(updateLog).toHaveBeenCalledWith(1, { amount: 200 }, VISITOR_ID);
  });

  it("returns 404 for a nonexistent log id", async () => {
    updateLog.mockResolvedValue(null);

    const res = await app.request(
      "/api/logs/999999",
      withVisitor({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 200 }),
      }),
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when the recomputed snapshot hits an invalid serving-size request", async () => {
    updateLog.mockRejectedValue(new FakeInvalidServingSizeError("Chicken roll"));

    const res = await app.request(
      "/api/logs/1",
      withVisitor({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: "serving" }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await app.request(
      "/api/logs/not-a-number",
      withVisitor({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 200 }),
      }),
    );

    expect(res.status).toBe(400);
    expect(updateLog).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty body (no fields to update)", async () => {
    const res = await app.request(
      "/api/logs/1",
      withVisitor({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
    expect(updateLog).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid unit value", async () => {
    const res = await app.request(
      "/api/logs/1",
      withVisitor({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: "lbs" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(updateLog).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/logs/:id", () => {
  it("returns 204 when the log existed and was deleted", async () => {
    deleteLog.mockResolvedValue(true);

    const res = await app.request("/api/logs/1", withVisitor({ method: "DELETE" }));

    expect(res.status).toBe(204);
    expect(deleteLog).toHaveBeenCalledWith(1, VISITOR_ID);
  });

  it("returns 404 for a nonexistent log id", async () => {
    deleteLog.mockResolvedValue(false);

    const res = await app.request("/api/logs/999999", withVisitor({ method: "DELETE" }));

    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await app.request("/api/logs/not-a-number", withVisitor({ method: "DELETE" }));

    expect(res.status).toBe(400);
    expect(deleteLog).not.toHaveBeenCalled();
  });
});

describe("visitorIdMiddleware — missing header", () => {
  it("returns 400 for POST with no X-Visitor-Id header", async () => {
    const res = await app.request("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foodId: 1, loggedDate: "2026-07-01", amount: 100, unit: "g" }),
    });

    expect(res.status).toBe(400);
    expect(createLog).not.toHaveBeenCalled();
  });

  it("returns 400 for GET with no X-Visitor-Id header", async () => {
    const res = await app.request("/api/logs?date=2026-07-01");

    expect(res.status).toBe(400);
    expect(getLogsByDate).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty X-Visitor-Id header", async () => {
    const res = await app.request("/api/logs?date=2026-07-01", {
      headers: { "X-Visitor-Id": "" },
    });

    expect(res.status).toBe(400);
    expect(getLogsByDate).not.toHaveBeenCalled();
  });
});
