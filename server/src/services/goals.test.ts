// Tests for the goals service + route. The DB client is mocked with a small
// in-memory fake table (mirroring the pattern in logs.test.ts) that
// interprets real `eq()` conditions produced by drizzle-orm, so we exercise
// the actual query-building wiring rather than just asserting mocks were
// called.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

// --- Fake DB (in-memory `goals` table, singleton in practice) ---

interface FakeGoalsRow {
  id: number;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  updatedAt: Date;
}

function extractEqCondition(condition: unknown): { key: string; value: unknown } {
  const chunks = (condition as { queryChunks: unknown[] }).queryChunks;
  const columnChunk = chunks.find(
    (c): c is { name: string } =>
      typeof c === "object" && c !== null && "name" in c && "columnType" in c,
  );
  const paramChunk = chunks.find(
    (c): c is { value: unknown } =>
      typeof c === "object" && c !== null && "value" in c && "encoder" in c,
  );
  if (!columnChunk || !paramChunk) {
    throw new Error("Fake db: could not parse eq() condition");
  }
  return { key: columnChunk.name, value: paramChunk.value };
}

let store: FakeGoalsRow[];
let nextId: number;

vi.mock("../db/client.js", () => {
  return {
    db: {
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          returning: async () => {
            const row: FakeGoalsRow = {
              id: nextId++,
              calories: values.calories as string,
              protein: values.protein as string,
              carbs: values.carbs as string,
              fat: values.fat as string,
              updatedAt: values.updatedAt as Date,
            };
            store.push(row);
            return [row];
          },
        }),
      }),
      select: () => ({
        from: async () => store,
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: (condition: unknown) => ({
            returning: async () => {
              const { value } = extractEqCondition(condition);
              const row = store.find((r) => r.id === value);
              if (!row) return [];
              Object.assign(row, patch);
              return [row];
            },
          }),
        }),
      }),
    },
  };
});

const { getGoals, upsertGoals } = await import("./goals.js");
const { goalsRoute } = await import("../routes/goals.js");

beforeEach(() => {
  store = [];
  nextId = 1;
});

describe("getGoals", () => {
  it("returns null when no row exists yet (goals unset)", async () => {
    const result = await getGoals();
    expect(result).toBeNull();
  });

  it("returns the goals after a row has been inserted (insert-then-get round-trips)", async () => {
    await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 });

    const result = await getGoals();

    expect(result).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
  });
});

describe("upsertGoals", () => {
  it("inserts a new row when none exists", async () => {
    const result = await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 });

    expect(result).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
    expect(store).toHaveLength(1);
  });

  it("updates the existing row on a second call, rather than inserting a second row", async () => {
    await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
    const updated = await upsertGoals({ calories: 2200, protein: 160, carbs: 220, fat: 70 });

    expect(updated).toEqual({ calories: 2200, protein: 160, carbs: 220, fat: 70 });
    expect(store).toHaveLength(1);

    const result = await getGoals();
    expect(result).toEqual({ calories: 2200, protein: 160, carbs: 220, fat: 70 });
  });
});

describe("PUT /api/goals — route-level Zod validation", () => {
  const app = new Hono();
  app.route("/api/goals", goalsRoute);

  it("returns 200 with the saved goals for a valid body", async () => {
    const res = await app.request("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calories: 2000, protein: 150, carbs: 200, fat: 65 }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
  });

  it("returns 400 for a negative value", async () => {
    const res = await app.request("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calories: -100, protein: 150, carbs: 200, fat: 65 }),
    });

    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });

  it("returns 400 for a missing field", async () => {
    const res = await app.request("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calories: 2000, protein: 150, carbs: 200 }),
    });

    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });
});

describe("GET /api/goals — route", () => {
  const app = new Hono();
  app.route("/api/goals", goalsRoute);

  it("returns 200 with null when goals are unset", async () => {
    const res = await app.request("/api/goals");

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("returns 200 with the saved goals once set", async () => {
    await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 });

    const res = await app.request("/api/goals");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
  });
});
