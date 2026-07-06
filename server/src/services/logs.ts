// CRUD for logged food entries. Nutrition values are snapshotted from the
// resolved food + amount/unit at write time (create, or an amount/unit
// change on update) so later corrections to `foods` never rewrite history.
import { eq } from "drizzle-orm";
import type { Food, LogEntry, LogTotals, LogUnit } from "shared";
import { foodLogs } from "shared";
import { db } from "../db/client.js";
import { getFoodById } from "./foodSearch.js";

const OZ_TO_GRAMS = 28.3495;

// Thrown when a log is requested with `unit: "serving"` against a food that
// has no `servingSize` on record (true for all USDA-sourced foods). Route
// layer maps this to a 400.
export class InvalidServingSizeError extends Error {
  constructor(foodName: string) {
    super(
      `"${foodName}" doesn't have a serving size on record; log it using "g" or "oz" instead.`,
    );
    this.name = "InvalidServingSizeError";
  }
}

interface Snapshot {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number | null;
  sodium: number | null;
}

function gramsForAmount(amount: number, unit: LogUnit, food: Food): number {
  if (unit === "g") return amount;
  if (unit === "oz") return amount * OZ_TO_GRAMS;

  // unit === "serving"
  if (food.servingSize === null) {
    throw new InvalidServingSizeError(food.name);
  }
  return amount * food.servingSize;
}

function computeSnapshot(food: Food, amount: number, unit: LogUnit): Snapshot {
  const grams = gramsForAmount(amount, unit, food);
  const scaleFactor = grams / 100;

  return {
    calories: food.caloriesPer100g * scaleFactor,
    protein: food.proteinPer100g * scaleFactor,
    carbs: food.carbsPer100g * scaleFactor,
    fat: food.fatPer100g * scaleFactor,
    sugar: food.sugarPer100g === null ? null : food.sugarPer100g * scaleFactor,
    sodium: food.sodiumPer100g === null ? null : food.sodiumPer100g * scaleFactor,
  };
}

function numericToString(value: number | null): string | null {
  return value === null ? null : value.toString();
}

function rowToLogEntry(row: typeof foodLogs.$inferSelect): LogEntry {
  return {
    id: row.id,
    loggedDate: row.loggedDate,
    foodId: row.foodId,
    amount: Number(row.amount),
    unit: row.unit as LogUnit,
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    sugar: row.sugar === null ? null : Number(row.sugar),
    sodium: row.sodium === null ? null : Number(row.sodium),
  };
}

export interface CreateLogInput {
  foodId: number;
  loggedDate: string;
  amount: number;
  unit: LogUnit;
}

// Returns `null` if `foodId` doesn't resolve to a cached food (route maps to
// 404). Throws `InvalidServingSizeError` for an invalid serving-unit request
// (route maps to 400).
export async function createLog(input: CreateLogInput): Promise<LogEntry | null> {
  const food = await getFoodById(input.foodId);
  if (!food) return null;

  const snapshot = computeSnapshot(food, input.amount, input.unit);

  const [row] = await db
    .insert(foodLogs)
    .values({
      loggedDate: input.loggedDate,
      foodId: input.foodId,
      amount: input.amount.toString(),
      unit: input.unit,
      calories: snapshot.calories.toString(),
      protein: snapshot.protein.toString(),
      carbs: snapshot.carbs.toString(),
      fat: snapshot.fat.toString(),
      sugar: numericToString(snapshot.sugar),
      sodium: numericToString(snapshot.sodium),
    })
    .returning();

  if (!row) {
    throw new Error("Insert into food_logs returned no row");
  }

  return rowToLogEntry(row);
}

export interface LogsForDate {
  entries: LogEntry[];
  totals: LogTotals;
}

export async function getLogsByDate(date: string): Promise<LogsForDate> {
  const rows = await db.select().from(foodLogs).where(eq(foodLogs.loggedDate, date));
  const entries = rows.map(rowToLogEntry);

  const totals = entries.reduce<LogTotals>(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      carbs: acc.carbs + entry.carbs,
      fat: acc.fat + entry.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return { entries, totals };
}

export interface UpdateLogInput {
  amount?: number;
  unit?: LogUnit;
  loggedDate?: string;
}

// Returns `null` if the log id doesn't exist (route maps to 404). Throws
// `InvalidServingSizeError` if the recomputed snapshot hits an invalid
// serving-unit request (route maps to 400).
export async function updateLog(id: number, patch: UpdateLogInput): Promise<LogEntry | null> {
  const [existing] = await db.select().from(foodLogs).where(eq(foodLogs.id, id));
  if (!existing) return null;

  const needsRecompute = patch.amount !== undefined || patch.unit !== undefined;
  const amount = patch.amount ?? Number(existing.amount);
  const unit = (patch.unit ?? existing.unit) as LogUnit;
  const loggedDate = patch.loggedDate ?? existing.loggedDate;

  let snapshot: Snapshot | null = null;
  if (needsRecompute) {
    const food = await getFoodById(existing.foodId);
    if (!food) {
      // Shouldn't happen in practice (food_id is FK-constrained), but guard
      // rather than silently writing a stale/incorrect snapshot.
      throw new Error(`Food ${existing.foodId} referenced by log ${id} no longer exists`);
    }
    snapshot = computeSnapshot(food, amount, unit);
  }

  const [row] = await db
    .update(foodLogs)
    .set({
      loggedDate,
      amount: amount.toString(),
      unit,
      ...(snapshot
        ? {
            calories: snapshot.calories.toString(),
            protein: snapshot.protein.toString(),
            carbs: snapshot.carbs.toString(),
            fat: snapshot.fat.toString(),
            sugar: numericToString(snapshot.sugar),
            sodium: numericToString(snapshot.sodium),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(foodLogs.id, id))
    .returning();

  if (!row) {
    throw new Error("Update to food_logs returned no row");
  }

  return rowToLogEntry(row);
}

// Returns `false` if the log id didn't exist (route maps to 404).
export async function deleteLog(id: number): Promise<boolean> {
  const [row] = await db.delete(foodLogs).where(eq(foodLogs.id, id)).returning({ id: foodLogs.id });
  return row !== undefined;
}
