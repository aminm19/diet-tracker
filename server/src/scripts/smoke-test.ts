// Temporary smoke test for Unit 2 — proves the Drizzle + Neon wiring works
// end to end by inserting one throwaway row into each of the 4 tables,
// reading it back, then deleting it so the DB is left clean.
//
// Run with: pnpm --filter server exec tsx src/scripts/smoke-test.ts

import { eq } from "drizzle-orm";
import { foodLogs, foods, goals, healthScoreSettings } from "shared";
import { db } from "../db/client.js";

async function main() {
  console.log("Inserting throwaway rows...");

  const [food] = await db
    .insert(foods)
    .values({
      source: "usda",
      externalId: "smoke-test-external-id",
      name: "Smoke Test Food",
      caloriesPer100g: "100",
      proteinPer100g: "10",
      carbsPer100g: "20",
      fatPer100g: "5",
    })
    .returning();

  if (!food) throw new Error("Insert into foods returned no row");
  console.log("  foods:", food.id, food.name);

  const [log] = await db
    .insert(foodLogs)
    .values({
      loggedDate: "2026-07-05",
      foodId: food.id,
      amount: "150",
      unit: "g",
      calories: "150",
      protein: "15",
      carbs: "30",
      fat: "7.5",
    })
    .returning();

  if (!log) throw new Error("Insert into food_logs returned no row");
  console.log("  food_logs:", log.id, log.loggedDate);

  const [goal] = await db
    .insert(goals)
    .values({
      calories: "2000",
      protein: "150",
      carbs: "200",
      fat: "70",
    })
    .returning();

  if (!goal) throw new Error("Insert into goals returned no row");
  console.log("  goals:", goal.id, goal.calories);

  const [settings] = await db.insert(healthScoreSettings).values({}).returning();

  if (!settings) throw new Error("Insert into health_score_settings returned no row");
  console.log("  health_score_settings:", settings.id, settings.enabled);

  console.log("Reading rows back...");
  const [readFood] = await db.select().from(foods).where(eq(foods.id, food.id));
  const [readLog] = await db.select().from(foodLogs).where(eq(foodLogs.id, log.id));
  const [readGoal] = await db.select().from(goals).where(eq(goals.id, goal.id));
  const [readSettings] = await db
    .select()
    .from(healthScoreSettings)
    .where(eq(healthScoreSettings.id, settings.id));

  if (!readFood || !readLog || !readGoal || !readSettings) {
    throw new Error("Read-back failed for at least one table");
  }
  console.log("Read-back succeeded for all 4 tables.");

  console.log("Cleaning up throwaway rows...");
  // food_logs first — it has a FK to foods.
  await db.delete(foodLogs).where(eq(foodLogs.id, log.id));
  await db.delete(foods).where(eq(foods.id, food.id));
  await db.delete(goals).where(eq(goals.id, goal.id));
  await db.delete(healthScoreSettings).where(eq(healthScoreSettings.id, settings.id));

  console.log("Cleanup complete. Smoke test passed.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Smoke test failed:", err);
    process.exit(1);
  });
