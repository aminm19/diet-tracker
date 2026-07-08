// Fetches food data from USDA FDC + Open Food Facts, normalizes both into
// the shared `Food` shape, and caches results into the `foods` table
// (deduped by `source` + `external_id`).
import { eq, ilike, or } from "drizzle-orm";
import type { Food, FoodGroup, FoodSource, NormalizedFoodInput } from "shared";
import { foods } from "shared";
import { db } from "../db/client.js";
import { numericToString, stringToNumber } from "../db/numeric.js";
import { classifyFoodGroup } from "./foodGroup.js";

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
// Open Food Facts asks integrators to identify their app in the User-Agent.
const OFF_USER_AGENT = "DietTrackerV1/1.0";

// If our own `foods` table already has at least this many matches for a
// query, skip both upstream calls entirely and serve from the local cache.
const LOCAL_CACHE_MIN_RESULTS = 5;

// A normalized result plus the raw upstream record, prior to being upserted
// (and thus not yet assigned an internal DB id). `foodGroup` is omitted here
// — it isn't sourced from USDA/OFF, it's classified from `name` at upsert
// time (see `upsertFood`).
type FoodUpsertInput = Omit<NormalizedFoodInput, "foodGroup"> & { rawData: unknown };

// --- USDA FDC ---
// Confirmed against a live call to the search endpoint (not the detail
// endpoint, whose foodNutrients shape differs): each entry in
// `foodNutrients[]` is flat — `{ nutrientNumber, nutrientName, value,
// unitName }` — rather than nested under a `nutrient` object. Values are
// per 100g of the food regardless of dataType (Foundation/SR Legacy/Survey
// FNDDS all use the same convention).
const USDA_NUTRIENT_NUMBER = {
  energyKcal: "208", // Energy, KCAL
  protein: "203", // Protein, G
  carbs: "205", // Carbohydrate, by difference, G
  fat: "204", // Total lipid (fat), G
  sugar: "269", // Total Sugars, G (not present on every food)
  sodiumMg: "307", // Sodium, Na, MG
} as const;

interface UsdaNutrient {
  nutrientNumber: string;
  value?: number;
}

interface UsdaFoodMeasure {
  disseminationText: string;
  gramWeight: number;
  rank?: number;
}

interface UsdaFoodItem {
  fdcId: number;
  description: string;
  foodNutrients: UsdaNutrient[];
  // Only present on `Survey (FNDDS)` dataType items — consumer-facing
  // portion sizes (e.g. "1 medium", "1 cup"). Absent on Foundation/SR Legacy
  // items, which are lab-analysis entries with no natural serving.
  foodMeasures?: UsdaFoodMeasure[];
}

interface UsdaSearchResponse {
  foods?: UsdaFoodItem[];
}

function usdaNutrientValue(item: UsdaFoodItem, nutrientNumber: string): number | null {
  const nutrient = item.foodNutrients.find((n) => n.nutrientNumber === nutrientNumber);
  return typeof nutrient?.value === "number" ? nutrient.value : null;
}

// Picks the most natural serving size from a USDA item's `foodMeasures`.
// "Quantity not specified" appears on nearly every food and isn't a
// meaningful default, so it's excluded; among what's left, the lowest
// `rank` tends to be the most common serving (e.g. rank 1 = "1 medium" for
// an apple). Returns null if there's nothing usable.
function pickUsdaServingMeasure(
  measures: UsdaFoodMeasure[] | undefined,
): UsdaFoodMeasure | null {
  if (!measures || measures.length === 0) return null;

  const candidates = measures.filter(
    (m) => !m.disseminationText.startsWith("Quantity not specified"),
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    const bestRank = best.rank ?? Number.POSITIVE_INFINITY;
    const currentRank = current.rank ?? Number.POSITIVE_INFINITY;
    return currentRank < bestRank ? current : best;
  });
}

async function searchUsda(query: string): Promise<FoodUpsertInput[]> {
  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) {
    throw new Error("USDA_FDC_API_KEY is not set");
  }

  // Restricted to whole/generic/homemade-style dataTypes. USDA's `Branded`
  // dataType is intentionally excluded — Open Food Facts covers
  // branded/packaged foods for this app.
  const url = `${USDA_SEARCH_URL}?query=${encodeURIComponent(query)}&api_key=${apiKey}&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)&pageSize=15`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`USDA search failed with status ${response.status}`);
  }

  const data = (await response.json()) as UsdaSearchResponse;
  const results: FoodUpsertInput[] = [];

  for (const item of data.foods ?? []) {
    const caloriesPer100g = usdaNutrientValue(item, USDA_NUTRIENT_NUMBER.energyKcal);
    const proteinPer100g = usdaNutrientValue(item, USDA_NUTRIENT_NUMBER.protein);
    const carbsPer100g = usdaNutrientValue(item, USDA_NUTRIENT_NUMBER.carbs);
    const fatPer100g = usdaNutrientValue(item, USDA_NUTRIENT_NUMBER.fat);

    // Skip anything missing a core macro — those columns are NOT NULL in `foods`.
    if (
      caloriesPer100g === null ||
      proteinPer100g === null ||
      carbsPer100g === null ||
      fatPer100g === null
    ) {
      continue;
    }

    const servingMeasure = pickUsdaServingMeasure(item.foodMeasures);

    results.push({
      source: "usda",
      externalId: String(item.fdcId),
      name: item.description,
      brand: null,
      // Foundation/SR Legacy items don't carry `foodMeasures` — they're
      // lab-analysis entries, not consumer-facing, so this stays null for
      // those. Survey (FNDDS) items do, so we surface a real "1 medium"-style
      // serving where one is available.
      servingSize: servingMeasure?.gramWeight ?? null,
      servingUnit: servingMeasure?.disseminationText ?? null,
      caloriesPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      sugarPer100g: usdaNutrientValue(item, USDA_NUTRIENT_NUMBER.sugar),
      sodiumPer100g: usdaNutrientValue(item, USDA_NUTRIENT_NUMBER.sodiumMg),
      novaGroup: null,
      rawData: item,
    });
  }

  return results;
}

// --- Open Food Facts ---

interface OffNutriments {
  "energy-kcal_100g"?: unknown;
  proteins_100g?: unknown;
  carbohydrates_100g?: unknown;
  fat_100g?: unknown;
  sugars_100g?: unknown;
  // Confirmed from a live call: OFF reports sodium in grams per 100g, not
  // mg. We convert to mg below to stay consistent with USDA and with the
  // unit this app stores sodium in.
  sodium_100g?: unknown;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nova_group?: unknown;
  serving_quantity?: unknown;
  serving_quantity_unit?: unknown;
  nutriments?: OffNutriments;
}

interface OffSearchResponse {
  products?: OffProduct[];
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function searchOff(query: string): Promise<FoodUpsertInput[]> {
  const url = `${OFF_SEARCH_URL}?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15`;

  const response = await fetch(url, {
    headers: { "User-Agent": OFF_USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Open Food Facts search failed with status ${response.status}`);
  }

  const data = (await response.json()) as OffSearchResponse;
  const results: FoodUpsertInput[] = [];

  for (const product of data.products ?? []) {
    if (!product.code || !product.product_name) continue;

    const n = product.nutriments ?? {};
    const caloriesPer100g = toFiniteNumber(n["energy-kcal_100g"]);
    const proteinPer100g = toFiniteNumber(n.proteins_100g);
    const carbsPer100g = toFiniteNumber(n.carbohydrates_100g);
    const fatPer100g = toFiniteNumber(n.fat_100g);

    // Some products (e.g. "add water" instant meals) only report
    // `_prepared` nutrient variants and leave the plain `_100g` fields
    // null — skip those since we can't fill the NOT NULL macro columns.
    if (
      caloriesPer100g === null ||
      proteinPer100g === null ||
      carbsPer100g === null ||
      fatPer100g === null
    ) {
      continue;
    }

    const sodiumGramsPer100g = toFiniteNumber(n.sodium_100g);

    results.push({
      source: "off",
      externalId: product.code,
      name: product.product_name,
      brand: product.brands?.trim() || null,
      servingSize: toFiniteNumber(product.serving_quantity),
      servingUnit: typeof product.serving_quantity_unit === "string"
        ? product.serving_quantity_unit
        : null,
      caloriesPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      sugarPer100g: toFiniteNumber(n.sugars_100g),
      sodiumPer100g: sodiumGramsPer100g === null ? null : sodiumGramsPer100g * 1000,
      novaGroup: toFiniteNumber(product.nova_group),
      rawData: product,
    });
  }

  return results;
}

// --- Cache (upsert into `foods`) ---

function rowToFood(row: typeof foods.$inferSelect): Food {
  return {
    id: row.id,
    source: row.source as FoodSource,
    externalId: row.externalId,
    name: row.name,
    brand: row.brand,
    servingSize: stringToNumber(row.servingSize),
    servingUnit: row.servingUnit,
    caloriesPer100g: Number(row.caloriesPer100g),
    proteinPer100g: Number(row.proteinPer100g),
    carbsPer100g: Number(row.carbsPer100g),
    fatPer100g: Number(row.fatPer100g),
    sugarPer100g: stringToNumber(row.sugarPer100g),
    sodiumPer100g: stringToNumber(row.sodiumPer100g),
    novaGroup: row.novaGroup,
    foodGroup: row.foodGroup as FoodGroup | null,
  };
}

async function upsertFood(item: FoodUpsertInput): Promise<Food> {
  const values = {
    source: item.source,
    externalId: item.externalId,
    name: item.name,
    brand: item.brand,
    servingSize: numericToString(item.servingSize),
    servingUnit: item.servingUnit,
    caloriesPer100g: item.caloriesPer100g.toString(),
    proteinPer100g: item.proteinPer100g.toString(),
    carbsPer100g: item.carbsPer100g.toString(),
    fatPer100g: item.fatPer100g.toString(),
    sugarPer100g: numericToString(item.sugarPer100g),
    sodiumPer100g: numericToString(item.sodiumPer100g),
    novaGroup: item.novaGroup,
    // Classified from `name` at write time — not sourced from USDA/OFF.
    foodGroup: classifyFoodGroup(item.name),
    rawData: item.rawData,
  };

  const [row] = await db
    .insert(foods)
    .values(values)
    .onConflictDoUpdate({
      target: [foods.source, foods.externalId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  if (!row) {
    throw new Error("Upsert into foods returned no row");
  }

  return rowToFood(row);
}

// --- Public service API ---

// Checks our own `foods` table before touching upstream — matches on `name`
// or `brand` containing the query, case-insensitively.
async function searchLocalCache(query: string): Promise<Food[]> {
  const rows = await db
    .select()
    .from(foods)
    .where(or(ilike(foods.name, `%${query}%`), ilike(foods.brand, `%${query}%`)))
    .limit(15);

  return rows.map(rowToFood);
}

// Fires both upstream searches in parallel. If one source errors (network
// failure, non-2xx response, etc.), it's logged and the other source's
// results are still returned — a single upstream outage never fails the
// whole search.
//
// Read-side caching tradeoff: once the `foods` table already has
// LOCAL_CACHE_MIN_RESULTS+ matches for a query, we serve straight from the
// local cache and skip both upstream APIs entirely — this makes
// repeat/overlapping searches fast and immune to upstream flakiness (both
// USDA and Open Food Facts are free APIs observed to intermittently 4xx/5xx
// or rate-limit), at the cost of not always showing the newest possible
// upstream results for a query that's already well-cached locally. That's an
// acceptable tradeoff given this app already treats `foods` as its cache
// (see root CLAUDE.md).
export async function searchFoods(query: string): Promise<Food[]> {
  const localResults = await searchLocalCache(query);
  if (localResults.length >= LOCAL_CACHE_MIN_RESULTS) {
    return localResults;
  }

  const [usdaResult, offResult] = await Promise.allSettled([
    searchUsda(query),
    searchOff(query),
  ]);

  const normalized: FoodUpsertInput[] = [];

  if (usdaResult.status === "fulfilled") {
    normalized.push(...usdaResult.value);
  } else {
    console.error("USDA food search failed:", usdaResult.reason);
  }

  if (offResult.status === "fulfilled") {
    normalized.push(...offResult.value);
  } else {
    console.error("Open Food Facts search failed:", offResult.reason);
  }

  const upserted: Food[] = [];
  for (const item of normalized) {
    upserted.push(await upsertFood(item));
  }

  return upserted;
}

// Reads a single cached food by our internal DB id — used once a user picks
// a specific search result to log (Units 4/5).
export async function getFoodById(id: number): Promise<Food | null> {
  const [row] = await db.select().from(foods).where(eq(foods.id, id));
  return row ? rowToFood(row) : null;
}
