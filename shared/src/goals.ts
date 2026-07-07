// Daily macro/calorie targets — mirrors the `goals` table. Shared between
// client and server instead of being redeclared as a client-only type.
import { z } from "zod";

export const goalsSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});
export type Goals = z.infer<typeof goalsSchema>;
