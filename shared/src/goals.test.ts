// Tests for `goalsSchema`, which mirrors the `goals` table (all four
// columns are `numeric(...).notNull()` — see `shared/src/schema.ts` — so
// unlike `logEntrySchema`'s `sugar`/`sodium`, nothing here is nullable).
import { describe, expect, it } from "vitest";
import { goalsSchema } from "./goals";

describe("goalsSchema", () => {
  it("accepts a valid full payload", () => {
    const result = goalsSchema.safeParse({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
    expect(result.success).toBe(true);
  });

  it("accepts zero for every field", () => {
    const result = goalsSchema.safeParse({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts decimal values", () => {
    const result = goalsSchema.safeParse({ calories: 2000.5, protein: 150.25, carbs: 200.1, fat: 65.75 });
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing a required field", () => {
    const result = goalsSchema.safeParse({ calories: 2000, protein: 150, carbs: 200 });
    expect(result.success).toBe(false);
  });

  it("rejects null for a field (columns are notNull in the goals table)", () => {
    const result = goalsSchema.safeParse({ calories: null, protein: 150, carbs: 200, fat: 65 });
    expect(result.success).toBe(false);
  });

  it("rejects undefined explicitly passed for a field", () => {
    const result = goalsSchema.safeParse({ calories: undefined, protein: 150, carbs: 200, fat: 65 });
    expect(result.success).toBe(false);
  });

  it("rejects wrong types (string instead of number)", () => {
    const result = goalsSchema.safeParse({ calories: "2000", protein: 150, carbs: 200, fat: 65 });
    expect(result.success).toBe(false);
  });

  it("rejects an empty object", () => {
    expect(goalsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(goalsSchema.safeParse(null).success).toBe(false);
    expect(goalsSchema.safeParse("goals").success).toBe(false);
    expect(goalsSchema.safeParse(42).success).toBe(false);
  });

  it("rejects negative numbers", () => {
    const result = goalsSchema.safeParse({ calories: -100, protein: 150, carbs: 200, fat: 65 });
    expect(result.success).toBe(false);
  });

  it("strips unknown extra fields rather than rejecting them (default Zod object behavior)", () => {
    const result = goalsSchema.safeParse({ calories: 2000, protein: 150, carbs: 200, fat: 65, extra: "nope" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
    }
  });
});
