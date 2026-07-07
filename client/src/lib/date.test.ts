import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, formatDateLabel, todayString, toDateString } from "./date";

describe("toDateString", () => {
  it("formats a date as YYYY-MM-DD using local components", () => {
    expect(toDateString(new Date(2026, 6, 6))).toBe("2026-07-06");
  });

  it("pads single-digit months and days", () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("does not roll over near local midnight the way toISOString would", () => {
    // 2026-01-01 00:30 local time — toISOString() could push this into
    // 2025-12-31 in timezones ahead of UTC. toDateString must not.
    const date = new Date(2026, 0, 1, 0, 30);
    expect(toDateString(date)).toBe("2026-01-01");
  });
});

describe("todayString", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reflects the local system date", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 12, 0, 0));
    expect(todayString()).toBe("2026-07-06");
  });
});

describe("addDays", () => {
  it("adds a positive delta", () => {
    expect(addDays("2026-07-06", 1)).toBe("2026-07-07");
  });

  it("subtracts with a negative delta", () => {
    expect(addDays("2026-07-06", -1)).toBe("2026-07-05");
  });

  it("rolls over a month boundary", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("rolls over a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles Feb 28 -> Feb 29 in a leap year", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("handles Feb 28 -> Mar 1 in a non-leap year", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("handles delta of 0 as a no-op", () => {
    expect(addDays("2026-07-06", 0)).toBe("2026-07-06");
  });

  it("handles large deltas spanning multiple months", () => {
    expect(addDays("2026-01-01", 365)).toBe("2027-01-01");
  });
});

describe("formatDateLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 6, 12, 0, 0)); // 2026-07-06
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('labels today as "Today"', () => {
    expect(formatDateLabel("2026-07-06")).toBe("Today");
  });

  it('labels yesterday as "Yesterday"', () => {
    expect(formatDateLabel("2026-07-05")).toBe("Yesterday");
  });

  it("formats other dates as weekday/month/day", () => {
    // 2026-07-04 is a Saturday
    expect(formatDateLabel("2026-07-04")).toMatch(/Sat, Jul 4/);
  });

  it("formats a future date the same way (not just past dates)", () => {
    expect(formatDateLabel("2026-07-08")).toMatch(/Jul 8/);
  });
});
