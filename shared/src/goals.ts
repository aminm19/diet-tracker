// Daily macro/calorie targets — mirrors the `goals` table. There's no
// goals API yet (Unit 6); this only gives the shape a shared home instead
// of it being redeclared as a client-only type alias of `LogTotals`.
import { z } from "zod";

export const goalsSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});
export type Goals = z.infer<typeof goalsSchema>;
