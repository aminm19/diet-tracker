// Tests for the Drizzle `numeric` column round-tripping helpers. These were
// previously duplicated inline in `foodSearch.ts` and `logs.ts`'s row-mappers;
// this file covers them directly now that they live in one place.
import { describe, expect, it } from "vitest";
import { numericToString, stringToNumber } from "./numeric.js";

describe("numericToString", () => {
  it("converts a positive number to a string", () => {
    expect(numericToString(42)).toBe("42");
  });

  it("converts zero to a string", () => {
    expect(numericToString(0)).toBe("0");
  });

  it("converts a negative number to a string", () => {
    expect(numericToString(-3.5)).toBe("-3.5");
  });

  it("preserves decimal precision", () => {
    expect(numericToString(1.23456789)).toBe("1.23456789");
  });

  it("passes null through as null", () => {
    expect(numericToString(null)).toBeNull();
  });
});

describe("stringToNumber", () => {
  it("converts a numeric string to a number", () => {
    expect(stringToNumber("42")).toBe(42);
  });

  it("converts a decimal string to a number", () => {
    expect(stringToNumber("3.5")).toBe(3.5);
  });

  it("converts a negative numeric string to a number", () => {
    expect(stringToNumber("-3.5")).toBe(-3.5);
  });

  it("converts a zero string to a number", () => {
    expect(stringToNumber("0")).toBe(0);
  });

  it("passes null through as null", () => {
    expect(stringToNumber(null)).toBeNull();
  });

  it("preserves decimal precision from Postgres-formatted strings", () => {
    // Postgres `numeric` columns often come back zero-padded per their
    // declared scale (e.g. "3.50" for a numeric(10,2) column storing 3.5).
    expect(stringToNumber("3.50")).toBe(3.5);
  });
});

describe("numericToString / stringToNumber round-trip", () => {
  const values = [0, 1, -1, 42, 3.5, -3.5, 100.25, 0.1, -0.1, 123456.789];

  it.each(values)("round-trips %s through encode then decode", (value) => {
    expect(stringToNumber(numericToString(value))).toBe(value);
  });

  it("round-trips null through encode then decode", () => {
    expect(stringToNumber(numericToString(null))).toBeNull();
  });

  it("does not treat null and 0 the same in either direction", () => {
    expect(numericToString(0)).not.toBeNull();
    expect(stringToNumber("0")).not.toBeNull();
  });
});
