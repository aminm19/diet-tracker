// Drizzle schema — single source of truth for the DB shape.
// Shared between client (types only) and server (queries + migrations).
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  date,
  unique,
} from "drizzle-orm/pg-core";

// Cached, normalized food items sourced from USDA FDC or Open Food Facts.
// Nutrient columns are per-100g so any logged amount can be scaled consistently.
export const foods = pgTable(
  "foods",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(), // 'usda' | 'off'
    externalId: text("external_id").notNull(), // FDC id or OFF barcode/code
    name: text("name").notNull(),
    brand: text("brand"),
    servingSize: numeric("serving_size"),
    servingUnit: text("serving_unit"),
    caloriesPer100g: numeric("calories_per_100g").notNull(),
    proteinPer100g: numeric("protein_per_100g").notNull(),
    carbsPer100g: numeric("carbs_per_100g").notNull(),
    fatPer100g: numeric("fat_per_100g").notNull(),
    sugarPer100g: numeric("sugar_per_100g"),
    sodiumPer100g: numeric("sodium_per_100g"),
    novaGroup: integer("nova_group"), // 1-4 processing classification
    // Coarse food-group bucket for the health score's variety factor —
    // 'protein'|'vegetable'|'fruit'|'grain'|'dairy'|'fat'|'other', assigned by
    // a keyword classifier at cache-write time (see `foodGroupSchema`).
    foodGroup: text("food_group"),
    rawData: jsonb("raw_data"), // cached original API response
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("foods_source_external_id_unique").on(table.source, table.externalId)],
);

// A single logged entry of a food on a given day. Nutrition values are
// snapshotted at log time so later corrections to `foods` never rewrite history.
export const foodLogs = pgTable("food_logs", {
  id: serial("id").primaryKey(),
  loggedDate: date("logged_date").notNull(),
  foodId: integer("food_id")
    .notNull()
    .references(() => foods.id),
  amount: numeric("amount").notNull(),
  unit: text("unit").notNull(),
  calories: numeric("calories").notNull(),
  protein: numeric("protein").notNull(),
  carbs: numeric("carbs").notNull(),
  fat: numeric("fat").notNull(),
  sugar: numeric("sugar"),
  sodium: numeric("sodium"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Daily macro/calorie targets. Single-user app — effectively a singleton
// row (id=1) enforced at the application layer, not the schema.
export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  calories: numeric("calories").notNull(),
  protein: numeric("protein").notNull(),
  carbs: numeric("carbs").notNull(),
  fat: numeric("fat").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Master + per-factor toggles and weights for the health score composite.
// Also a singleton row in practice.
export const healthScoreSettings = pgTable("health_score_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  processingEnabled: boolean("processing_enabled").notNull().default(true),
  processingWeight: numeric("processing_weight").notNull().default("0.25"),
  macroFitEnabled: boolean("macro_fit_enabled").notNull().default(true),
  macroFitWeight: numeric("macro_fit_weight").notNull().default("0.25"),
  sugarSodiumEnabled: boolean("sugar_sodium_enabled").notNull().default(true),
  sugarSodiumWeight: numeric("sugar_sodium_weight").notNull().default("0.25"),
  varietyEnabled: boolean("variety_enabled").notNull().default(true),
  varietyWeight: numeric("variety_weight").notNull().default("0.25"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
