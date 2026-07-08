// Daily calorie/macro goals, one row per anonymous visitor. `goals.visitorId`
// has a unique constraint, but upserting is still done as a select-then-
// insert-or-update in JS (rather than a DB-level `ON CONFLICT`) to keep the
// same pattern as the rest of the codebase.
import { eq } from "drizzle-orm";
import type { Goals } from "shared";
import { goals } from "shared";
import { db } from "../db/client.js";
import { numericToString, stringToNumber } from "../db/numeric.js";

function rowToGoals(row: typeof goals.$inferSelect): Goals {
  return {
    // All four columns are `numeric().notNull()`, so `stringToNumber` never
    // actually returns null here — used anyway for a consistent round-trip
    // with the rest of the numeric-column handling (see logs.ts).
    calories: stringToNumber(row.calories)!,
    protein: stringToNumber(row.protein)!,
    carbs: stringToNumber(row.carbs)!,
    fat: stringToNumber(row.fat)!,
  };
}

// Returns `null` if no goals row exists yet for this visitor (goals unset).
export async function getGoals(visitorId: string): Promise<Goals | null> {
  const [row] = await db.select().from(goals).where(eq(goals.visitorId, visitorId));
  return row ? rowToGoals(row) : null;
}

// Inserts a new row if none exists yet for this visitor, otherwise updates
// the existing one.
export async function upsertGoals(input: Goals, visitorId: string): Promise<Goals> {
  const [existing] = await db.select().from(goals).where(eq(goals.visitorId, visitorId));

  const values = {
    visitorId,
    calories: numericToString(input.calories)!,
    protein: numericToString(input.protein)!,
    carbs: numericToString(input.carbs)!,
    fat: numericToString(input.fat)!,
    updatedAt: new Date(),
  };

  if (!existing) {
    const [row] = await db.insert(goals).values(values).returning();
    if (!row) {
      throw new Error("Insert into goals returned no row");
    }
    return rowToGoals(row);
  }

  const [row] = await db
    .update(goals)
    .set(values)
    .where(eq(goals.id, existing.id))
    .returning();
  if (!row) {
    throw new Error("Update to goals returned no row");
  }
  return rowToGoals(row);
}
