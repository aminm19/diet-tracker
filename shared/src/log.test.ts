// Tests for the shared log request/response Zod schemas — in particular
// `dateStringSchema`, which is reused by `createLogRequestSchema`,
// `updateLogRequestSchema`, and `getLogsQuerySchema`.
import { describe, expect, it } from "vitest";
import { dateStringSchema } from "./log";

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
