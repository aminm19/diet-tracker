// Singleton daily calorie/macro goals — the `goals` table has no unique
// constraint to `ON CONFLICT` against (a plain `serial` PK), so existence is
// checked in JS and we insert or update accordingly rather than upserting at
// the DB level.
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

// Returns `null` if no goals row exists yet (goals unset).
export async function getGoals(): Promise<Goals | null> {
  const [row] = await db.select().from(goals);
  return row ? rowToGoals(row) : null;
}

// Inserts a new row if none exists yet, otherwise updates the existing one.
export async function upsertGoals(input: Goals): Promise<Goals> {
  const [existing] = await db.select().from(goals);

  const values = {
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
