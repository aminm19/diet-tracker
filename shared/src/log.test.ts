// Tests for the shared log request/response Zod schemas — in particular
// `dateStringSchema`, which is reused by `createLogRequestSchema`,
// `updateLogRequestSchema`, and `getLogsQuerySchema` — and `computeLogTotals`,
// which replaces the two independent reducer implementations that used to
// live in `server/src/services/logs.ts` and `client/src/hooks/useDailyLog.ts`.
import { describe, expect, it } from "vitest";
import { computeLogTotals, dateStringSchema, type LogEntry } from "./log";

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 1,
    loggedDate: "2026-07-01",
    foodId: 1,
    amount: 100,
    unit: "g",
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
    sugar: 2,
    sodium: 50,
    ...overrides,
  };
}

describe("dateStringSchema", () => {
  it("accepts a real calendar date", () => {
    expect(dateStringSchema.safeParse("2026-07-01").success).toBe(true);
  });

  it("rejects malformed date strings", () => {
    expect(dateStringSchema.safeParse("07/01/2026").success).toBe(false);
    expect(dateStringSchema.safeParse("not-a-date").success).toBe(false);
    expect(dateStringSchema.safeParse("").success).toBe(false);
  });

  it("rejects an out-of-range month (2024-13-45)", () => {
    expect(dateStringSchema.safeParse("2024-13-45").success).toBe(false);
  });

  // Rollover cases: `dateStringSchema` reparses the y/m/d components and
  // confirms `new Date(y, m-1, d)` round-trips to the same components,
  // rather than trusting `Date.parse` (which silently normalizes e.g.
  // "2024-02-30" into March 1st instead of rejecting it). Fixed after the
  // gap below was reported; these now assert the correct (rejecting)
  // behavior instead of documenting the bug.
  it("rejects Feb 30 (2024-02-30) — no such day", () => {
    expect(dateStringSchema.safeParse("2024-02-30").success).toBe(false);
  });

  it("rejects Feb 29 in a non-leap year (2023-02-29)", () => {
    expect(dateStringSchema.safeParse("2023-02-29").success).toBe(false);
  });

  it("rejects April 31 (2024-04-31) — April has 30 days", () => {
    expect(dateStringSchema.safeParse("2024-04-31").success).toBe(false);
  });

  it("correctly accepts Feb 29 in a leap year (2024-02-29)", () => {
    expect(dateStringSchema.safeParse("2024-02-29").success).toBe(true);
  });
});

describe("computeLogTotals", () => {
  it("returns zeroed totals for an empty array, without throwing", () => {
    expect(computeLogTotals([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("returns that single entry's macros for a single-entry array", () => {
    const entry = makeEntry({ calories: 250, protein: 20, carbs: 30, fat: 8 });
    expect(computeLogTotals([entry])).toEqual({ calories: 250, protein: 20, carbs: 30, fat: 8 });
  });

  it("sums macros across multiple entries", () => {
    const entries = [
      makeEntry({ id: 1, calories: 100, protein: 10, carbs: 10, fat: 5 }),
      makeEntry({ id: 2, calories: 200, protein: 20, carbs: 15, fat: 7 }),
      makeEntry({ id: 3, calories: 50, protein: 5, carbs: 5, fat: 1 }),
    ];
    expect(computeLogTotals(entries)).toEqual({ calories: 350, protein: 35, carbs: 30, fat: 13 });
  });

  it("sums correctly with negative-adjacent floating point values (no NaN)", () => {
    const entries = [
      makeEntry({ id: 1, calories: 0.1, protein: 0.1, carbs: 0.1, fat: 0.1 }),
      makeEntry({ id: 2, calories: 0.2, protein: 0.2, carbs: 0.2, fat: 0.2 }),
    ];
    const totals = computeLogTotals(entries);
    expect(totals.calories).toBeCloseTo(0.3);
    expect(totals.protein).toBeCloseTo(0.3);
    expect(totals.carbs).toBeCloseTo(0.3);
    expect(totals.fat).toBeCloseTo(0.3);
  });

  it("ignores nullable sugar/sodium fields (not part of LogTotals)", () => {
    const entries = [
      makeEntry({ id: 1, sugar: null, sodium: null }),
      makeEntry({ id: 2, sugar: 5, sodium: 100 }),
    ];
    expect(computeLogTotals(entries)).toEqual({ calories: 200, protein: 20, carbs: 20, fat: 10 });
  });

  it("does not mutate the input array", () => {
    const entries = [makeEntry()];
    const snapshot = JSON.parse(JSON.stringify(entries));
    computeLogTotals(entries);
    expect(entries).toEqual(snapshot);
  });
});
