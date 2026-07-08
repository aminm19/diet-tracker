// Tests for the food search/normalization/upsert service. The DB client is
// mocked with a small in-memory fake that mimics Postgres upsert semantics
// (insert-or-update keyed by (source, external_id)) so we exercise the real
// `upsertFood` conflict-target/values wiring rather than just asserting the
// mock was called. Upstream HTTP calls are mocked via a stubbed `fetch`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { foods } from "shared";

// --- Fake DB (in-memory, mimics ON CONFLICT (source, external_id) DO UPDATE) ---

interface FakeRow {
  id: number;
  [key: string]: unknown;
}

let store: FakeRow[];
let nextId: number;
let lastConflictTarget: unknown;

function findByKey(source: unknown, externalId: unknown): FakeRow | undefined {
  return store.find((r) => r.source === source && r.externalId === externalId);
}

// Used to compile the `or(ilike(...), ilike(...))` expression built by
// `searchLocalCache` into `{ sql, params }` so this fake can extract the
// `%query%` patterns without depending on drizzle's internal SQL AST shape.
const pgDialect = new PgDialect();

vi.mock("../db/client.js", () => {
  return {
    db: {
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: (args: { target: unknown; set: Record<string, unknown> }) => ({
            returning: async () => {
              lastConflictTarget = args.target;
              const existing = findByKey(values.source, values.externalId);
              if (existing) {
                Object.assign(existing, args.set);
                return [existing];
              }
              const row: FakeRow = { id: nextId++, ...values };
              store.push(row);
              return [row];
            },
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: (condition: unknown) => ({
            limit: async (n: number) => {
              const { params } = pgDialect.sqlToQuery(condition as Parameters<typeof pgDialect.sqlToQuery>[0]);
              // `ilike(column, "%query%")` — strip the wildcards to recover
              // the raw query text, then match case-insensitively against
              // `name`/`brand`, mirroring what Postgres's ILIKE would do.
              const pattern = String(params[0] ?? "")
                .replace(/^%/, "")
                .replace(/%$/, "")
                .toLowerCase();
              const matches = store.filter((row) => {
                const name = String(row.name ?? "").toLowerCase();
                const brand = String(row.brand ?? "").toLowerCase();
                return name.includes(pattern) || brand.includes(pattern);
              });
              return matches.slice(0, n);
            },
          }),
        }),
      }),
    },
  };
});

// Imported *after* the mock is registered.
const { searchFoods } = await import("./foodSearch.js");

// --- Realistic upstream fixtures ---

// USDA FDC /foods/search response shape, trimmed to one Foundation-type item
// (chicken roll), matching the flat foodNutrients[] the code expects.
function usdaResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    foods: [
      {
        fdcId: 174608,
        description: "Chicken roll, light meat",
        dataType: "SR Legacy",
        foodNutrients: [
          { nutrientNumber: "208", nutrientName: "Energy", value: 143, unitName: "KCAL" },
          { nutrientNumber: "203", nutrientName: "Protein", value: 18.51, unitName: "G" },
          { nutrientNumber: "205", nutrientName: "Carbohydrate, by difference", value: 3.49, unitName: "G" },
          { nutrientNumber: "204", nutrientName: "Total lipid (fat)", value: 5.28, unitName: "G" },
          { nutrientNumber: "307", nutrientName: "Sodium, Na", value: 660, unitName: "MG" },
          // nutrientNumber 269 (sugar) intentionally absent — not present on every food.
        ],
        ...overrides,
      },
    ],
  };
}

// Open Food Facts /cgi/search.pl response shape, trimmed to one product
// (frozen pizza), matching `_100g`-suffixed nutriments.
function offResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    products: [
      {
        code: "3017620422003",
        product_name: "Thin Crust Pepperoni Pizza",
        brands: "Acme Foods",
        nova_group: 4,
        serving_quantity: 150,
        serving_quantity_unit: "g",
        nutriments: {
          "energy-kcal_100g": 250,
          proteins_100g: 11,
          carbohydrates_100g: 28,
          fat_100g: 10,
          sugars_100g: 3.5,
          // OFF reports sodium in grams per 100g.
          sodium_100g: 0.6,
        },
        ...overrides,
      },
    ],
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function installFetchMock(handlers: {
  usda?: () => Response | Promise<Response>;
  off?: () => Response | Promise<Response>;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.nal.usda.gov")) {
        if (!handlers.usda) throw new Error("unexpected USDA fetch");
        return handlers.usda();
      }
      if (url.includes("openfoodfacts.org")) {
        if (!handlers.off) throw new Error("unexpected OFF fetch");
        return handlers.off();
      }
      throw new Error(`unexpected fetch url: ${url}`);
    }),
  );
}

beforeEach(() => {
  store = [];
  nextId = 1;
  lastConflictTarget = undefined;
  process.env.USDA_FDC_API_KEY = "test-key";
  vi.unstubAllGlobals();
});

describe("searchFoods — normalization", () => {
  it("maps a USDA item's flat foodNutrients into the normalized shape", async () => {
    installFetchMock({
      usda: () => jsonResponse(usdaResponse()),
      off: () => jsonResponse({ products: [] }),
    });

    const results = await searchFoods("chicken");
    expect(results).toHaveLength(1);
    const food = results[0]!;

    expect(food.source).toBe("usda");
    expect(food.externalId).toBe("174608");
    expect(food.name).toBe("Chicken roll, light meat");
    expect(food.caloriesPer100g).toBe(143);
    expect(food.proteinPer100g).toBe(18.51);
    expect(food.carbsPer100g).toBe(3.49);
    expect(food.fatPer100g).toBe(5.28);
    // Sodium 307 is already mg on USDA — no conversion.
    expect(food.sodiumPer100g).toBe(660);
    // nutrientNumber 269 absent from fixture.
    expect(food.sugarPer100g).toBeNull();
    expect(food.novaGroup).toBeNull();
    expect(food.servingSize).toBeNull();
    expect(food.servingUnit).toBeNull();
  });

  it("converts OFF sodium from grams to mg and maps macros correctly", async () => {
    installFetchMock({
      usda: () => jsonResponse({ foods: [] }),
      off: () => jsonResponse(offResponse()),
    });

    const results = await searchFoods("pizza");
    expect(results).toHaveLength(1);
    const food = results[0]!;

    expect(food.source).toBe("off");
    expect(food.externalId).toBe("3017620422003");
    expect(food.name).toBe("Thin Crust Pepperoni Pizza");
    expect(food.brand).toBe("Acme Foods");
    expect(food.caloriesPer100g).toBe(250);
    expect(food.proteinPer100g).toBe(11);
    expect(food.carbsPer100g).toBe(28);
    expect(food.fatPer100g).toBe(10);
    expect(food.sugarPer100g).toBe(3.5);
    // 0.6 g/100g * 1000 = 600 mg/100g.
    expect(food.sodiumPer100g).toBe(600);
    expect(food.novaGroup).toBe(4);
    expect(food.servingSize).toBe(150);
    expect(food.servingUnit).toBe("g");
  });

  it("skips an OFF product with null/missing macro fields (e.g. an 'add water' prepared item)", async () => {
    installFetchMock({
      usda: () => jsonResponse({ foods: [] }),
      off: () =>
        jsonResponse(
          offResponse({
            code: "0000000000001",
            product_name: "Instant Soup Mix (add water)",
            nutriments: {
              // Only *_prepared fields reported; plain _100g macros are absent.
              carbohydrates_100g: 20,
              fat_100g: 2,
              // energy-kcal_100g and proteins_100g deliberately missing.
            },
          }),
        ),
    });

    const results = await searchFoods("soup");
    expect(results).toHaveLength(0);
    expect(store).toHaveLength(0);
  });

  it("skips a USDA item missing a core macro nutrient", async () => {
    installFetchMock({
      usda: () =>
        jsonResponse(
          usdaResponse({
            foodNutrients: [
              { nutrientNumber: "208", value: 100, unitName: "KCAL" },
              // protein (203) missing entirely.
              { nutrientNumber: "205", value: 10, unitName: "G" },
              { nutrientNumber: "204", value: 2, unitName: "G" },
            ],
          }),
        ),
      off: () => jsonResponse({ products: [] }),
    });

    const results = await searchFoods("incomplete");
    expect(results).toHaveLength(0);
  });

  it("does not treat a zero-value macro (e.g. water) as missing", async () => {
    installFetchMock({
      usda: () =>
        jsonResponse(
          usdaResponse({
            fdcId: 173094,
            description: "Water, tap",
            foodNutrients: [
              { nutrientNumber: "208", value: 0, unitName: "KCAL" },
              { nutrientNumber: "203", value: 0, unitName: "G" },
              { nutrientNumber: "205", value: 0, unitName: "G" },
              { nutrientNumber: "204", value: 0, unitName: "G" },
            ],
          }),
        ),
      off: () => jsonResponse({ products: [] }),
    });

    const results = await searchFoods("water");
    expect(results).toHaveLength(1);
    expect(results[0]!.caloriesPer100g).toBe(0);
    expect(results[0]!.proteinPer100g).toBe(0);
  });

  it("parses OFF nutriment values that come through as numeric strings", async () => {
    installFetchMock({
      usda: () => jsonResponse({ foods: [] }),
      off: () =>
        jsonResponse(
          offResponse({
            code: "2222222222222",
            product_name: "String-Encoded Nutriments Product",
            nutriments: {
              "energy-kcal_100g": "250",
              proteins_100g: "11",
              carbohydrates_100g: "28",
              fat_100g: "10",
              sugars_100g: "3.5",
              sodium_100g: "0.6",
            },
          }),
        ),
    });

    const results = await searchFoods("stringnutriments");
    expect(results).toHaveLength(1);
    expect(results[0]!.caloriesPer100g).toBe(250);
    expect(results[0]!.sodiumPer100g).toBe(600);
  });

  it("does not choke on a null sugar value explicitly present (not just absent)", async () => {
    installFetchMock({
      usda: () => jsonResponse({ foods: [] }),
      off: () =>
        jsonResponse(
          offResponse({
            code: "1111111111111",
            product_name: "No Sugar Data Product",
            nutriments: {
              "energy-kcal_100g": 200,
              proteins_100g: 5,
              carbohydrates_100g: 30,
              fat_100g: 8,
              sugars_100g: null,
              sodium_100g: null,
            },
          }),
        ),
    });

    const results = await searchFoods("nosugar");
    expect(results).toHaveLength(1);
    expect(results[0]!.sugarPer100g).toBeNull();
    expect(results[0]!.sodiumPer100g).toBeNull();
  });
});

describe("searchFoods — upsert/dedup", () => {
  it("dedupes on (source, external_id): a repeat search updates the existing row rather than duplicating it", async () => {
    installFetchMock({
      usda: () => jsonResponse(usdaResponse()),
      off: () => jsonResponse({ products: [] }),
    });

    const first = await searchFoods("chicken");
    expect(first).toHaveLength(1);
    const firstId = first[0]!.id;
    expect(store).toHaveLength(1);

    // Second search for the same query — same fdcId, but with an updated
    // description as if USDA's record changed slightly.
    installFetchMock({
      usda: () => jsonResponse(usdaResponse({ description: "Chicken roll, light meat, updated" })),
      off: () => jsonResponse({ products: [] }),
    });

    const second = await searchFoods("chicken");
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe(firstId);
    expect(second[0]!.name).toBe("Chicken roll, light meat, updated");
    // Still exactly one row in the store — no duplicate inserted.
    expect(store).toHaveLength(1);
  });

  it("upserts using the (source, external_id) conflict target", async () => {
    installFetchMock({
      usda: () => jsonResponse(usdaResponse()),
      off: () => jsonResponse({ products: [] }),
    });

    await searchFoods("chicken");
    expect(lastConflictTarget).toEqual([foods.source, foods.externalId]);
  });
});

describe("searchFoods — partial-failure resilience", () => {
  it("still returns USDA results when the OFF request rejects", async () => {
    installFetchMock({
      usda: () => jsonResponse(usdaResponse()),
      off: () => {
        throw new Error("network error");
      },
    });

    const results = await searchFoods("chicken");
    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe("usda");
  });

  it("still returns OFF results when the USDA request rejects", async () => {
    installFetchMock({
      usda: () => {
        throw new Error("network error");
      },
      off: () => jsonResponse(offResponse()),
    });

    const results = await searchFoods("pizza");
    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe("off");
  });

  it("still returns USDA results when OFF responds with a non-2xx status", async () => {
    installFetchMock({
      usda: () => jsonResponse(usdaResponse()),
      off: () => jsonResponse({}, false, 503),
    });

    const results = await searchFoods("chicken");
    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe("usda");
  });

  it("does not throw and returns an empty array when both sources fail", async () => {
    installFetchMock({
      usda: () => {
        throw new Error("network error");
      },
      off: () => {
        throw new Error("network error");
      },
    });

    const results = await searchFoods("anything");
    expect(results).toEqual([]);
  });
});

describe("searchFoods — USDA foodMeasures serving size", () => {
  it("picks the lowest-rank measure, excluding 'Quantity not specified', for a Survey (FNDDS) item", async () => {
    installFetchMock({
      usda: () =>
        jsonResponse(
          usdaResponse({
            fdcId: 171688,
            description: "Apple, raw",
            dataType: "Survey (FNDDS)",
            foodMeasures: [
              // Present on nearly every food, and (deliberately, here) has a
              // lower rank than the real servings — must still be excluded.
              { disseminationText: "Quantity not specified", gramWeight: 100, rank: 0 },
              { disseminationText: "1 cup slices", gramWeight: 125, rank: 3 },
              { disseminationText: "1 medium", gramWeight: 200, rank: 1 },
              { disseminationText: "1 large", gramWeight: 250, rank: 2 },
            ],
          }),
        ),
      off: () => jsonResponse({ products: [] }),
    });

    const results = await searchFoods("apple");
    expect(results).toHaveLength(1);
    expect(results[0]!.servingSize).toBe(200);
    expect(results[0]!.servingUnit).toBe("1 medium");
  });

  it("stays null when every foodMeasures entry is 'Quantity not specified'", async () => {
    installFetchMock({
      usda: () =>
        jsonResponse(
          usdaResponse({
            fdcId: 999001,
            description: "Mystery Survey Food",
            dataType: "Survey (FNDDS)",
            foodMeasures: [
              { disseminationText: "Quantity not specified", gramWeight: 100, rank: 1 },
              { disseminationText: "Quantity not specified", gramWeight: 100, rank: 2 },
            ],
          }),
        ),
      off: () => jsonResponse({ products: [] }),
    });

    const results = await searchFoods("mystery");
    expect(results).toHaveLength(1);
    expect(results[0]!.servingSize).toBeNull();
    expect(results[0]!.servingUnit).toBeNull();
  });

  it("stays null for a Foundation/SR Legacy item with no foodMeasures field at all", async () => {
    installFetchMock({
      // The default `usdaResponse()` fixture is dataType "SR Legacy" and has
      // no `foodMeasures` field, matching real USDA behavior for that dataType.
      usda: () => jsonResponse(usdaResponse()),
      off: () => jsonResponse({ products: [] }),
    });

    const results = await searchFoods("chicken");
    expect(results).toHaveLength(1);
    expect(results[0]!.servingSize).toBeNull();
    expect(results[0]!.servingUnit).toBeNull();
  });

  it("stays null when foodMeasures is an empty array", async () => {
    installFetchMock({
      usda: () =>
        jsonResponse(
          usdaResponse({
            fdcId: 999002,
            description: "No Measures Food",
            dataType: "Survey (FNDDS)",
            foodMeasures: [],
          }),
        ),
      off: () => jsonResponse({ products: [] }),
    });

    const results = await searchFoods("nomeasures");
    expect(results).toHaveLength(1);
    expect(results[0]!.servingSize).toBeNull();
    expect(results[0]!.servingUnit).toBeNull();
  });
});

describe("searchFoods — read-side local cache", () => {
  it("falls through to the live upstream path when the local cache has fewer than 5 matches", async () => {
    // 3 pre-existing rows in the "foods" table matching "chicken" — below
    // the LOCAL_CACHE_MIN_RESULTS=5 threshold.
    store.push(
      { id: 1, source: "usda", externalId: "1", name: "Chicken breast" },
      { id: 2, source: "usda", externalId: "2", name: "Chicken thigh" },
      { id: 3, source: "usda", externalId: "3", name: "Chicken wing" },
    );
    nextId = 4;

    installFetchMock({
      usda: () => jsonResponse(usdaResponse()),
      off: () => jsonResponse({ products: [] }),
    });

    const results = await searchFoods("chicken");
    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe("usda");
    expect(fetch).toHaveBeenCalled();
  });

  it("skips both upstream calls entirely when the local cache already has 5+ matches", async () => {
    store.push(
      { id: 1, source: "usda", externalId: "1", name: "Chicken breast" },
      { id: 2, source: "usda", externalId: "2", name: "Chicken thigh" },
      { id: 3, source: "usda", externalId: "3", name: "Chicken wing" },
      { id: 4, source: "usda", externalId: "4", name: "Chicken drumstick" },
      { id: 5, source: "off", externalId: "5", name: "Chicken Nuggets", brand: "Acme" },
    );
    nextId = 6;

    installFetchMock({
      usda: () => {
        throw new Error("USDA should not be called when local cache is sufficient");
      },
      off: () => {
        throw new Error("OFF should not be called when local cache is sufficient");
      },
    });

    const results = await searchFoods("chicken");
    expect(results).toHaveLength(5);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("matches case-insensitively against brand as well as name", async () => {
    store.push(
      { id: 1, source: "off", externalId: "1", name: "Snack Bar", brand: "GRANOLA CO" },
      { id: 2, source: "off", externalId: "2", name: "Snack Bar 2", brand: "GRANOLA CO" },
      { id: 3, source: "off", externalId: "3", name: "Snack Bar 3", brand: "GRANOLA CO" },
      { id: 4, source: "off", externalId: "4", name: "Snack Bar 4", brand: "GRANOLA CO" },
      { id: 5, source: "off", externalId: "5", name: "Snack Bar 5", brand: "GRANOLA CO" },
    );
    nextId = 6;

    installFetchMock({
      usda: () => {
        throw new Error("should not be called");
      },
      off: () => {
        throw new Error("should not be called");
      },
    });

    const results = await searchFoods("granola");
    expect(results).toHaveLength(5);
    expect(fetch).not.toHaveBeenCalled();
  });
});
