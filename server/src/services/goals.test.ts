// Tests for the goals service + route. The DB client is mocked with a small
// in-memory fake table (mirroring the pattern in logs.test.ts) that
// interprets real `eq()` conditions produced by drizzle-orm, so we exercise
// the actual query-building wiring rather than just asserting mocks were
// called.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

// --- Fake DB (in-memory `goals` table, one row per visitor) ---

interface FakeGoalsRow {
  id: number;
  visitorId: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  updatedAt: Date;
}

// Maps the real DB column name (snake_case, as defined in shared/src/schema.ts)
// to the fake row's JS property key (camelCase) — mirrors how Drizzle itself
// maps between the two.
const COLUMN_NAME_TO_KEY: Record<string, keyof FakeGoalsRow> = {
  id: "id",
  visitor_id: "visitorId",
};

function extractEqCondition(condition: unknown): { key: keyof FakeGoalsRow; value: unknown } {
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
  const key = COLUMN_NAME_TO_KEY[columnChunk.name];
  if (!key) {
    throw new Error(`Fake db: unmapped column name "${columnChunk.name}"`);
  }
  return { key, value: paramChunk.value };
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
              visitorId: values.visitorId as string,
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
        from: () => ({
          where: async (condition: unknown) => {
            const { key, value } = extractEqCondition(condition);
            return store.filter((row) => row[key] === value);
          },
        }),
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
const { visitorIdMiddleware } = await import("../middleware/visitorId.js");

const VISITOR_A = "visitor-a";
const VISITOR_B = "visitor-b";

beforeEach(() => {
  store = [];
  nextId = 1;
});

describe("getGoals", () => {
  it("returns null when no row exists yet for this visitor (goals unset)", async () => {
    const result = await getGoals(VISITOR_A);
    expect(result).toBeNull();
  });

  it("returns the goals after a row has been inserted (insert-then-get round-trips)", async () => {
    await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 }, VISITOR_A);

    const result = await getGoals(VISITOR_A);

    expect(result).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
  });
});

describe("upsertGoals", () => {
  it("inserts a new row when none exists for this visitor", async () => {
    const result = await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 }, VISITOR_A);

    expect(result).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
    expect(store).toHaveLength(1);
  });

  it("updates the existing row on a second call, rather than inserting a second row", async () => {
    await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 }, VISITOR_A);
    const updated = await upsertGoals({ calories: 2200, protein: 160, carbs: 220, fat: 70 }, VISITOR_A);

    expect(updated).toEqual({ calories: 2200, protein: 160, carbs: 220, fat: 70 });
    expect(store).toHaveLength(1);

    const result = await getGoals(VISITOR_A);
    expect(result).toEqual({ calories: 2200, protein: 160, carbs: 220, fat: 70 });
  });
});

describe("visitor isolation", () => {
  it("two visitors' goals are stored and read back independently", async () => {
    await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 }, VISITOR_A);
    await upsertGoals({ calories: 1800, protein: 120, carbs: 180, fat: 55 }, VISITOR_B);

    expect(await getGoals(VISITOR_A)).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
    expect(await getGoals(VISITOR_B)).toEqual({ calories: 1800, protein: 120, carbs: 180, fat: 55 });
    expect(store).toHaveLength(2);
  });

  it("upserting visitor B's goals does not affect visitor A's row", async () => {
    await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 }, VISITOR_A);
    await upsertGoals({ calories: 1800, protein: 120, carbs: 180, fat: 55 }, VISITOR_B);
    await upsertGoals({ calories: 1900, protein: 130, carbs: 190, fat: 60 }, VISITOR_B);

    expect(await getGoals(VISITOR_A)).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
    expect(await getGoals(VISITOR_B)).toEqual({ calories: 1900, protein: 130, carbs: 190, fat: 60 });
    expect(store).toHaveLength(2);
  });
});

describe("PUT /api/goals — route-level Zod validation", () => {
  const app = new Hono();
  app.use("/api/goals/*", visitorIdMiddleware);
  app.route("/api/goals", goalsRoute);

  it("returns 200 with the saved goals for a valid body", async () => {
    const res = await app.request("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Visitor-Id": VISITOR_A },
      body: JSON.stringify({ calories: 2000, protein: 150, carbs: 200, fat: 65 }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
  });

  it("returns 400 for a negative value", async () => {
    const res = await app.request("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Visitor-Id": VISITOR_A },
      body: JSON.stringify({ calories: -100, protein: 150, carbs: 200, fat: 65 }),
    });

    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });

  it("returns 400 for a missing field", async () => {
    const res = await app.request("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Visitor-Id": VISITOR_A },
      body: JSON.stringify({ calories: 2000, protein: 150, carbs: 200 }),
    });

    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });

  it("returns 400 when the X-Visitor-Id header is missing", async () => {
    const res = await app.request("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calories: 2000, protein: 150, carbs: 200, fat: 65 }),
    });

    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });
});

describe("GET /api/goals — route", () => {
  const app = new Hono();
  app.use("/api/goals/*", visitorIdMiddleware);
  app.route("/api/goals", goalsRoute);

  it("returns 200 with null when goals are unset", async () => {
    const res = await app.request("/api/goals", { headers: { "X-Visitor-Id": VISITOR_A } });

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("returns 200 with the saved goals once set", async () => {
    await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 }, VISITOR_A);

    const res = await app.request("/api/goals", { headers: { "X-Visitor-Id": VISITOR_A } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
  });

  it("returns 400 when the X-Visitor-Id header is missing", async () => {
    const res = await app.request("/api/goals");

    expect(res.status).toBe(400);
  });

  it("scopes results to the requesting visitor — visitor B sees no goals after visitor A sets theirs", async () => {
    await upsertGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 }, VISITOR_A);

    const res = await app.request("/api/goals", { headers: { "X-Visitor-Id": VISITOR_B } });

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});
