// Normalized food shape — the common contract between the two upstream
// sources (USDA FDC + Open Food Facts) and our own `foods` cache table.
// Used both as the API response contract (search + get-by-id) and, later,
// by the client to render results and log entries.
import { z } from "zod";

export const foodSourceSchema = z.enum(["usda", "off"]);
export type FoodSource = z.infer<typeof foodSourceSchema>;

// A cached, normalized food record — mirrors the `foods` table (minus
// internal-only bookkeeping columns like `raw_data`/timestamps). All
// nutrient fields are per 100g of the food so any logged amount can be
// scaled consistently regardless of source.
//
// Unit note: sodium is stored/returned in milligrams. USDA's search API
// already reports sodium in mg; Open Food Facts reports it in grams per
// 100g, so the OFF mapper multiplies by 1000 to keep both sources
// consistent in this shape and in the `foods` table.
export const foodSchema = z.object({
  id: z.number().int().positive(),
  source: foodSourceSchema,
  externalId: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  servingSize: z.number().nullable(),
  servingUnit: z.string().nullable(),
  caloriesPer100g: z.number(),
  proteinPer100g: z.number(),
  carbsPer100g: z.number(),
  fatPer100g: z.number(),
  sugarPer100g: z.number().nullable(),
  sodiumPer100g: z.number().nullable(),
  novaGroup: z.number().int().min(1).max(4).nullable(),
});
export type Food = z.infer<typeof foodSchema>;

// Same shape, before it has been assigned an internal DB id (i.e. the
// output of normalizing a single upstream search result, prior to upsert).
export const normalizedFoodInputSchema = foodSchema.omit({ id: true });
export type NormalizedFoodInput = z.infer<typeof normalizedFoodInputSchema>;
