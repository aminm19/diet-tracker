// One-off backfill: classifies `foodGroup` for every row in `foods` that was
// cached before the `food_group` column existed (i.e. currently null).
// Safe to leave in the repo — not wired into any app code path, and safe to
// re-run (it only ever touches rows where `foodGroup IS NULL`).
//
// Run with: pnpm --filter server exec tsx src/scripts/backfill-food-groups.ts
import { eq, isNull } from "drizzle-orm";
import { foods } from "shared";
import { db } from "../db/client.js";
import { classifyFoodGroup } from "../services/foodGroup.js";

async function main() {
  const rows = await db.select().from(foods).where(isNull(foods.foodGroup));
  console.log(`Found ${rows.length} food row(s) with no foodGroup set.`);

  for (const row of rows) {
    const foodGroup = classifyFoodGroup(row.name);
    await db.update(foods).set({ foodGroup }).where(eq(foods.id, row.id));
    console.log(`  #${row.id} "${row.name}" -> ${foodGroup}`);
  }

  console.log("Backfill complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
