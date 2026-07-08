// Tests for the log CRUD service. The DB client is mocked with a small
// in-memory fake table (mirroring the pattern in foodSearch.test.ts) that
// interprets real `eq()`/`and()` conditions produced by drizzle-orm, so we
// exercise the actual query-building wiring rather than just asserting mocks
// were called. `getFoodById` (from the food search service) is mocked
// directly since log creation/recompute depends on it, not on the `foods`
// table.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Food } from "shared";

// --- Fake DB (in-memory `food_logs` table) ---

interface FakeLogRow {
  id: number;
  visitorId: string;
  loggedDate: string;
  foodId: number;
  amount: string;
  unit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  sugar: string | null;
  sodium: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Maps the real DB column name (snake_case, as defined in shared/src/schema.ts)
// to the fake row's JS property key (camelCase) — mirrors how Drizzle itself
// maps between the two.
const COLUMN_NAME_TO_KEY: Record<string, keyof FakeLogRow> = {
  id: "id",
  visitor_id: "visitorId",
  logged_date: "loggedDate",
  food_id: "foodId",
  amount: "amount",
  unit: "unit",
  calories: "calories",
  protein: "protein",
  carbs: "carbs",
  fat: "fat",
  sugar: "sugar",
  sodium: "sodium",
};

// Extracts every `{ key, value }` pair from a real `eq()`/`and(eq(), eq())`
// condition (a drizzle-orm `SQL` instance) without depending on unexported
// internal classes — column chunks carry `name`/`columnType`, the bound
// value chunk carries `value`/`encoder`. `and()` nests its child `eq()` SQL
// instances inside its own `queryChunks`, so this recurses to flatten them;
// each column chunk is paired with the next value chunk encountered (the
// order `eq()` always emits them in).
function extractConditions(condition: unknown): Array<{ key: keyof FakeLogRow; value: unknown }> {
  const results: Array<{ key: keyof FakeLogRow; value: unknown }> = [];
  let pendingColumn: string | null = null;

  function walk(node: unknown): void {
    if (typeof node !== "object" || node === null) return;

    if ("name" in node && "columnType" in node) {
      pendingColumn = (node as { name: string }).name;
      return;
    }

    if ("value" in node && "encoder" in node) {
      if (pendingColumn) {
        const key = COLUMN_NAME_TO_KEY[pendingColumn];
        if (!key) {
          throw new Error(`Fake db: unmapped column name "${pendingColumn}"`);
        }
        results.push({ key, value: (node as { value: unknown }).value });
        pendingColumn = null;
      }
      return;
    }

    if ("queryChunks" in node) {
      for (const chunk of (node as { queryChunks: unknown[] }).queryChunks) {
        walk(chunk);
      }
    }
  }

  walk(condition);

  if (results.length === 0) {
    throw new Error("Fake db: could not parse eq()/and() condition");
  }
  return results;
}

function matchesAll(row: FakeLogRow, conditions: Array<{ key: keyof FakeLogRow; value: unknown }>): boolean {
  return conditions.every(({ key, value }) => row[key] === value);
}

let store: FakeLogRow[];
let nextId: number;

vi.mock("../db/client.js", () => {
  return {
    db: {
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          returning: async () => {
            const row: FakeLogRow = {
              id: nextId++,
              visitorId: values.visitorId as string,
              loggedDate: values.loggedDate as string,
              foodId: values.foodId as number,
              amount: values.amount as string,
              unit: values.unit as string,
              calories: values.calories as string,
              protein: values.protein as string,
              carbs: values.carbs as string,
              fat: values.fat as string,
              sugar: (values.sugar as string | null) ?? null,
              sodium: (values.sodium as string | null) ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            store.push(row);
            return [row];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: async (condition: unknown) => {
            const conditions = extractConditions(condition);
            return store.filter((row) => matchesAll(row, conditions));
          },
        }),
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: (condition: unknown) => ({
            returning: async () => {
              const conditions = extractConditions(condition);
              const row = store.find((r) => matchesAll(r, conditions));
              if (!row) return [];
              Object.assign(row, patch);
              return [row];
            },
          }),
        }),
      }),
      delete: () => ({
        where: (condition: unknown) => ({
          returning: async () => {
            const conditions = extractConditions(condition);
            const idx = store.findIndex((r) => matchesAll(r, conditions));
            if (idx === -1) return [];
            const [removed] = store.splice(idx, 1);
            return removed ? [removed] : [];
          },
        }),
      }),
    },
  };
});

const getFoodById = vi.fn<(id: number) => Promise<Food | null>>();

vi.mock("./foodSearch.js", () => ({
  getFoodById: (id: number) => getFoodById(id),
}));

const { createLog, deleteLog, getLogsByDate, InvalidServingSizeError, updateLog } = await import(
  "./logs.js"
);

// --- Fixtures ---

const VISITOR_A = "visitor-a";
const VISITOR_B = "visitor-b";

const usdaChicken: Food = {
  id: 1,
  source: "usda",
  externalId: "174608",
  name: "Chicken roll, light meat",
  brand: null,
  servingSize: null,
  servingUnit: null,
  caloriesPer100g: 143,
  proteinPer100g: 18.51,
  carbsPer100g: 3.49,
  fatPer100g: 5.28,
  sugarPer100g: null,
  sodiumPer100g: 660,
  novaGroup: null,
  foodGroup: "protein",
};

const offPizza: Food = {
  id: 2,
  source: "off",
  externalId: "3017620422003",
  name: "Thin Crust Pepperoni Pizza",
  brand: "Acme Foods",
  servingSize: 150,
  servingUnit: "g",
  caloriesPer100g: 250,
  proteinPer100g: 11,
  carbsPer100g: 28,
  fatPer100g: 10,
  sugarPer100g: 3.5,
  sodiumPer100g: 600,
  novaGroup: 4,
  foodGroup: "other",
};

beforeEach(() => {
  store = [];
  nextId = 1;
  getFoodById.mockReset();
});

describe("createLog — unit conversion + snapshotting", () => {
  it("converts grams directly (scaleFactor = amount / 100)", async () => {
    getFoodById.mockResolvedValue(usdaChicken);

    const entry = await createLog(
      {
        foodId: 1,
        loggedDate: "2026-07-01",
        amount: 200,
        unit: "g",
      },
      VISITOR_A,
    );

    expect(entry).not.toBeNull();
    // 200g -> scaleFactor 2 -> 143 * 2 = 286
    expect(entry!.calories).toBeCloseTo(286);
    expect(entry!.protein).toBeCloseTo(37.02);
    expect(entry!.carbs).toBeCloseTo(6.98);
    expect(entry!.fat).toBeCloseTo(10.56);
    // sodium present on food (660/100g) -> 660 * 2 = 1320
    expect(entry!.sodium).toBeCloseTo(1320);
    // sugar absent on food -> snapshot stays null, not coerced to 0
    expect(entry!.sugar).toBeNull();
  });

  it("converts ounces to grams using 28.3495 g/oz", async () => {
    getFoodById.mockResolvedValue(usdaChicken);

    const entry = await createLog(
      {
        foodId: 1,
        loggedDate: "2026-07-01",
        amount: 4,
        unit: "oz",
      },
      VISITOR_A,
    );

    // 4oz -> 113.398g -> scaleFactor 1.13398
    const expectedCalories = 143 * ((4 * 28.3495) / 100);
    expect(entry!.calories).toBeCloseTo(expectedCalories, 5);
  });

  it("converts servings using the food's servingSize when present", async () => {
    getFoodById.mockResolvedValue(offPizza);

    const entry = await createLog(
      {
        foodId: 2,
        loggedDate: "2026-07-01",
        amount: 2,
        unit: "serving",
      },
      VISITOR_A,
    );

    // 2 servings * 150g = 300g -> scaleFactor 3
    expect(entry!.calories).toBeCloseTo(750);
    expect(entry!.protein).toBeCloseTo(33);
    expect(entry!.carbs).toBeCloseTo(84);
    expect(entry!.fat).toBeCloseTo(30);
    expect(entry!.sugar).toBeCloseTo(10.5);
    expect(entry!.sodium).toBeCloseTo(1800);
  });

  it("rejects unit: 'serving' against a food with no servingSize (e.g. USDA-sourced)", async () => {
    getFoodById.mockResolvedValue(usdaChicken);

    await expect(
      createLog({ foodId: 1, loggedDate: "2026-07-01", amount: 1, unit: "serving" }, VISITOR_A),
    ).rejects.toThrow(InvalidServingSizeError);
  });

  it("returns null when the food id doesn't resolve (route maps this to 404)", async () => {
    getFoodById.mockResolvedValue(null);

    const entry = await createLog(
      {
        foodId: 999,
        loggedDate: "2026-07-01",
        amount: 100,
        unit: "g",
      },
      VISITOR_A,
    );

    expect(entry).toBeNull();
  });
});

describe("updateLog — snapshot recompute", () => {
  it("recomputes the snapshot when amount changes, not just the raw field", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    const created = await createLog(
      {
        foodId: 1,
        loggedDate: "2026-07-01",
        amount: 100,
        unit: "g",
      },
      VISITOR_A,
    );
    expect(created!.calories).toBeCloseTo(143);

    const updated = await updateLog(created!.id, { amount: 200 }, VISITOR_A);

    expect(updated!.amount).toBe(200);
    // Must be recomputed from the food's per-100g values, not simply doubled
    // by coincidence — assert against the actual arithmetic.
    expect(updated!.calories).toBeCloseTo(286);
    expect(updated!.protein).toBeCloseTo(37.02);
  });

  it("recomputes the snapshot when unit changes", async () => {
    getFoodById.mockResolvedValue(offPizza);
    const created = await createLog(
      {
        foodId: 2,
        loggedDate: "2026-07-01",
        amount: 1,
        unit: "serving",
      },
      VISITOR_A,
    );
    expect(created!.calories).toBeCloseTo(375); // 150g -> scaleFactor 1.5

    const updated = await updateLog(created!.id, { amount: 100, unit: "g" }, VISITOR_A);

    expect(updated!.unit).toBe("g");
    expect(updated!.calories).toBeCloseTo(250); // 100g -> scaleFactor 1
  });

  it("does not recompute (or look up the food) when only loggedDate changes", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    const created = await createLog(
      {
        foodId: 1,
        loggedDate: "2026-07-01",
        amount: 100,
        unit: "g",
      },
      VISITOR_A,
    );
    getFoodById.mockClear();

    const updated = await updateLog(created!.id, { loggedDate: "2026-07-02" }, VISITOR_A);

    expect(updated!.loggedDate).toBe("2026-07-02");
    expect(updated!.calories).toBeCloseTo(143);
    expect(getFoodById).not.toHaveBeenCalled();
  });

  it("rejects switching to unit: 'serving' on recompute if the food has no servingSize", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    const created = await createLog(
      {
        foodId: 1,
        loggedDate: "2026-07-01",
        amount: 100,
        unit: "g",
      },
      VISITOR_A,
    );

    await expect(updateLog(created!.id, { unit: "serving" }, VISITOR_A)).rejects.toThrow(
      InvalidServingSizeError,
    );
  });

  it("returns null for a nonexistent log id", async () => {
    const updated = await updateLog(12345, { amount: 50 }, VISITOR_A);
    expect(updated).toBeNull();
  });
});

describe("deleteLog", () => {
  it("deletes an existing log and returns true", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    const created = await createLog(
      {
        foodId: 1,
        loggedDate: "2026-07-01",
        amount: 100,
        unit: "g",
      },
      VISITOR_A,
    );

    const result = await deleteLog(created!.id, VISITOR_A);

    expect(result).toBe(true);
    expect(store).toHaveLength(0);
  });

  it("returns false for a nonexistent log id", async () => {
    const result = await deleteLog(99999, VISITOR_A);
    expect(result).toBe(false);
  });
});

describe("adversarial gap-hunting — service-level, bypasses route/Zod validation", () => {
  it("does NOT itself reject a non-positive amount (only the route's Zod schema does) — documents a defense-in-depth gap", async () => {
    getFoodById.mockResolvedValue(usdaChicken);

    const entry = await createLog(
      {
        foodId: 1,
        loggedDate: "2026-07-01",
        amount: -50,
        unit: "g",
      },
      VISITOR_A,
    );

    // No validation error thrown; a negative snapshot is silently persisted.
    // Safe today only because the route layer's Zod schema (`amount:
    // z.number().positive()`) is the sole gate — any future direct/internal
    // caller of `createLog` would not be protected.
    expect(entry).not.toBeNull();
    expect(entry!.amount).toBe(-50);
    expect(entry!.calories).toBeCloseTo(-71.5);
  });

  it("updateLog with an empty patch object no-ops without crashing (route's Zod .refine() is what actually blocks `{}` over HTTP)", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    const created = await createLog(
      {
        foodId: 1,
        loggedDate: "2026-07-01",
        amount: 100,
        unit: "g",
      },
      VISITOR_A,
    );
    getFoodById.mockClear();

    const updated = await updateLog(created!.id, {}, VISITOR_A);

    expect(updated).not.toBeNull();
    expect(updated!.amount).toBe(100);
    expect(updated!.calories).toBeCloseTo(143);
    expect(getFoodById).not.toHaveBeenCalled();
  });

  it("updateLog with only `unit` changed keeps the existing amount (doesn't reset it to a default)", async () => {
    getFoodById.mockResolvedValue(offPizza);
    const created = await createLog(
      {
        foodId: 2,
        loggedDate: "2026-07-01",
        amount: 3,
        unit: "serving",
      },
      VISITOR_A,
    );
    expect(created!.calories).toBeCloseTo(1125); // 3 * 150g -> scaleFactor 4.5

    const updated = await updateLog(created!.id, { unit: "g" }, VISITOR_A);

    expect(updated!.amount).toBe(3); // amount untouched
    expect(updated!.unit).toBe("g");
    expect(updated!.calories).toBeCloseTo(7.5); // 3g -> scaleFactor 0.03
  });

  it("throws a generic (uncaught-by-route) Error if the log's food no longer resolves at update time", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    const created = await createLog(
      {
        foodId: 1,
        loggedDate: "2026-07-01",
        amount: 100,
        unit: "g",
      },
      VISITOR_A,
    );

    // Simulate the food having disappeared out from under the log between
    // create and update (no delete-food endpoint exists yet, but the code
    // guards against it defensively).
    getFoodById.mockResolvedValue(null);

    await expect(updateLog(created!.id, { amount: 200 }, VISITOR_A)).rejects.toThrow(
      /no longer exists/,
    );
    // Note: this is a plain Error, not `InvalidServingSizeError` — the route
    // layer only special-cases the latter, so this would surface to the
    // client as an unhandled 500 rather than a clean 4xx today.
  });
});

describe("getLogsByDate — totals", () => {
  it("returns zero totals (not null/undefined) when there are no entries for the date", async () => {
    const result = await getLogsByDate("2026-07-05", VISITOR_A);

    expect(result.entries).toEqual([]);
    expect(result.totals).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("sums snapshotted macros across all entries for the date, ignoring other dates", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    await createLog({ foodId: 1, loggedDate: "2026-07-01", amount: 100, unit: "g" }, VISITOR_A); // 143 cal
    await createLog({ foodId: 1, loggedDate: "2026-07-01", amount: 200, unit: "g" }, VISITOR_A); // 286 cal
    await createLog({ foodId: 1, loggedDate: "2026-07-02", amount: 100, unit: "g" }, VISITOR_A); // different date

    const result = await getLogsByDate("2026-07-01", VISITOR_A);

    expect(result.entries).toHaveLength(2);
    expect(result.totals.calories).toBeCloseTo(429);
    expect(result.totals.protein).toBeCloseTo(55.53);
  });
});

describe("visitor isolation", () => {
  it("getLogsByDate only returns the requesting visitor's entries for a shared date", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    await createLog({ foodId: 1, loggedDate: "2026-07-01", amount: 100, unit: "g" }, VISITOR_A);
    await createLog({ foodId: 1, loggedDate: "2026-07-01", amount: 200, unit: "g" }, VISITOR_B);

    const resultA = await getLogsByDate("2026-07-01", VISITOR_A);
    const resultB = await getLogsByDate("2026-07-01", VISITOR_B);

    expect(resultA.entries).toHaveLength(1);
    expect(resultA.entries[0]!.amount).toBe(100);
    expect(resultB.entries).toHaveLength(1);
    expect(resultB.entries[0]!.amount).toBe(200);
  });

  it("updateLog against another visitor's log id returns null rather than updating it", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    const created = await createLog(
      { foodId: 1, loggedDate: "2026-07-01", amount: 100, unit: "g" },
      VISITOR_A,
    );

    const result = await updateLog(created!.id, { amount: 999 }, VISITOR_B);

    expect(result).toBeNull();
    // Underlying row is untouched.
    const stillThere = await getLogsByDate("2026-07-01", VISITOR_A);
    expect(stillThere.entries[0]!.amount).toBe(100);
  });

  it("deleteLog against another visitor's log id returns false rather than deleting it", async () => {
    getFoodById.mockResolvedValue(usdaChicken);
    const created = await createLog(
      { foodId: 1, loggedDate: "2026-07-01", amount: 100, unit: "g" },
      VISITOR_A,
    );

    const result = await deleteLog(created!.id, VISITOR_B);

    expect(result).toBe(false);
    expect(store).toHaveLength(1);
  });
});
