// Route-level tests for /api/foods/*. The service layer is mocked so these
// tests focus purely on Zod validation + status-code wiring, exercised
// in-process via Hono's `app.request` (no real network server spun up).
//
// Note: `server/src/index.ts` calls `serve(...)` unconditionally at module
// scope (no `require.main`-style guard), so importing it would bind a real
// port as a side effect. We instead mount the exported `foodsRoute` on a
// fresh Hono instance here, mirroring exactly how index.ts wires it
// (`app.route("/api/foods", foodsRoute)`) without that side effect.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Food } from "shared";

const searchFoods = vi.fn<(query: string) => Promise<Food[]>>();
const getFoodById = vi.fn<(id: number) => Promise<Food | null>>();

vi.mock("../services/foodSearch.js", () => ({
  searchFoods: (query: string) => searchFoods(query),
  getFoodById: (id: number) => getFoodById(id),
}));

const { foodsRoute } = await import("./foods.js");

const app = new Hono();
app.route("/api/foods", foodsRoute);

const sampleFood: Food = {
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
  foodGroup: null,
};

beforeEach(() => {
  searchFoods.mockReset();
  getFoodById.mockReset();
});

describe("GET /api/foods/search", () => {
  it("returns 200 with results for a valid query", async () => {
    searchFoods.mockResolvedValue([sampleFood]);

    const res = await app.request("/api/foods/search?q=chicken");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([sampleFood]);
    expect(searchFoods).toHaveBeenCalledWith("chicken");
  });

  it("returns 400 when q is missing entirely", async () => {
    const res = await app.request("/api/foods/search");

    expect(res.status).toBe(400);
    expect(searchFoods).not.toHaveBeenCalled();
  });

  it("returns 400 when q is an empty string", async () => {
    const res = await app.request("/api/foods/search?q=");

    expect(res.status).toBe(400);
    expect(searchFoods).not.toHaveBeenCalled();
  });

  it("returns 400 when q is only whitespace", async () => {
    const res = await app.request(`/api/foods/search?q=${encodeURIComponent("   ")}`);

    expect(res.status).toBe(400);
    expect(searchFoods).not.toHaveBeenCalled();
  });

  it("propagates a 500 rather than a false 200 if the service throws", async () => {
    searchFoods.mockRejectedValue(new Error("upstream exploded"));

    const res = await app.request("/api/foods/search?q=chicken");

    expect(res.status).toBe(500);
  });
});

describe("GET /api/foods/:id", () => {
  it("returns 200 with the food for a valid, existing id", async () => {
    getFoodById.mockResolvedValue(sampleFood);

    const res = await app.request("/api/foods/1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(sampleFood);
    expect(getFoodById).toHaveBeenCalledWith(1);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await app.request("/api/foods/not-a-number");

    expect(res.status).toBe(400);
    expect(getFoodById).not.toHaveBeenCalled();
  });

  it("returns 400 for a zero id (must be positive)", async () => {
    const res = await app.request("/api/foods/0");

    expect(res.status).toBe(400);
    expect(getFoodById).not.toHaveBeenCalled();
  });

  it("returns 400 for a negative id", async () => {
    const res = await app.request("/api/foods/-5");

    expect(res.status).toBe(400);
    expect(getFoodById).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-integer id", async () => {
    const res = await app.request("/api/foods/1.5");

    expect(res.status).toBe(400);
    expect(getFoodById).not.toHaveBeenCalled();
  });

  it("returns 404 for a well-formed but nonexistent id", async () => {
    getFoodById.mockResolvedValue(null);

    const res = await app.request("/api/foods/999999");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Food not found" });
  });
});
