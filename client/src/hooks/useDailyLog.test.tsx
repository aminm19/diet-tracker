// @vitest-environment jsdom
// Tests for `useDailyLog`: race-safety across rapid date switches, food-cache
// reuse, local optimistic-update helpers, and error/abort handling.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Food, GetLogsResponse, LogEntry } from "shared";
import { useDailyLog } from "./useDailyLog";
import { ApiError } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    getLogs: vi.fn(),
    getFoodById: vi.fn(),
  };
});

import { getFoodById, getLogs } from "../lib/api";

const mockGetLogs = vi.mocked(getLogs);
const mockGetFoodById = vi.mocked(getFoodById);

function makeFood(id: number, overrides: Partial<Food> = {}): Food {
  return {
    id,
    source: "usda",
    externalId: `ext-${id}`,
    name: `Food ${id}`,
    brand: null,
    servingSize: null,
    servingUnit: null,
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 10,
    fatPer100g: 5,
    sugarPer100g: null,
    sodiumPer100g: null,
    novaGroup: null,
    foodGroup: null,
    ...overrides,
  };
}

function makeEntry(id: number, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id,
    loggedDate: "2026-07-06",
    foodId: id,
    amount: 100,
    unit: "g",
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
    sugar: null,
    sodium: null,
    ...overrides,
  };
}

function emptyResponse(): GetLogsResponse {
  return { entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } };
}

// A promise we can resolve/reject from outside, to control response ordering.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockGetLogs.mockReset();
  mockGetFoodById.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDailyLog — basic load", () => {
  it("loads entries, resolves foods, and computes totals", async () => {
    const entry = makeEntry(1, { calories: 200, protein: 20, carbs: 30, fat: 5 });
    mockGetLogs.mockResolvedValue({
      entries: [entry],
      totals: { calories: 200, protein: 20, carbs: 30, fat: 5 },
    });
    mockGetFoodById.mockResolvedValue(makeFood(1, { name: "Banana" }));

    const { result } = renderHook(() => useDailyLog("2026-07-06"));

    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.food?.name).toBe("Banana");
    expect(result.current.totals).toEqual({ calories: 200, protein: 20, carbs: 30, fat: 5 });
  });

  it("sets status=error with the ApiError message on fetch failure", async () => {
    mockGetLogs.mockRejectedValue(new ApiError("Server exploded", 500));

    const { result } = renderHook(() => useDailyLog("2026-07-06"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Server exploded");
    expect(result.current.entries).toEqual([]);
  });

  it("falls back to a generic error message for non-ApiError failures", async () => {
    mockGetLogs.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useDailyLog("2026-07-06"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Couldn't load today's log.");
  });

  it("swallows AbortError instead of surfacing it as an error", async () => {
    mockGetLogs.mockRejectedValue(new DOMException("aborted", "AbortError"));

    const { result } = renderHook(() => useDailyLog("2026-07-06"));

    // Give the rejected promise a tick to be handled.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).not.toBe("error");
  });

  it("retries via `reload` after an error", async () => {
    mockGetLogs.mockRejectedValueOnce(new ApiError("boom", 500));
    const { result } = renderHook(() => useDailyLog("2026-07-06"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    mockGetLogs.mockResolvedValueOnce(emptyResponse());
    act(() => result.current.reload());

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.entries).toEqual([]);
  });
});

describe("useDailyLog — race safety across rapid date switches", () => {
  it("discards a stale response that resolves after a newer request has started", async () => {
    const d1 = deferred<GetLogsResponse>();
    const d2 = deferred<GetLogsResponse>();

    mockGetLogs.mockImplementation((date: string) => {
      if (date === "2026-07-01") return d1.promise;
      if (date === "2026-07-02") return d2.promise;
      return Promise.resolve(emptyResponse());
    });

    const { result, rerender } = renderHook(({ date }) => useDailyLog(date), {
      initialProps: { date: "2026-07-01" },
    });

    rerender({ date: "2026-07-02" });

    // Resolve the OLDER request (day 1) AFTER the newer one (day 2) has
    // already been kicked off — it must be discarded.
    const entryDay1 = makeEntry(1, { loggedDate: "2026-07-01" });
    const entryDay2 = makeEntry(2, { loggedDate: "2026-07-02" });
    mockGetFoodById.mockResolvedValue(makeFood(1));
    mockGetFoodById.mockResolvedValue(makeFood(2));

    d2.resolve({ entries: [entryDay2], totals: { calories: 100, protein: 10, carbs: 10, fat: 5 } });
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.entries[0]!.loggedDate).toBe("2026-07-02");

    // Now resolve the stale day-1 request — it must NOT overwrite state.
    d1.resolve({ entries: [entryDay1], totals: { calories: 999, protein: 999, carbs: 999, fat: 999 } });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.entries[0]!.loggedDate).toBe("2026-07-02");
    expect(result.current.totals.calories).toBe(100);
  });

  it("caches resolved foods across day switches (no duplicate fetch for the same foodId)", async () => {
    const food1 = makeFood(1, { name: "Apple" });
    mockGetFoodById.mockImplementation((id: number) =>
      id === 1 ? Promise.resolve(food1) : Promise.reject(new Error("unexpected id")),
    );

    mockGetLogs
      .mockResolvedValueOnce({
        entries: [makeEntry(10, { foodId: 1, loggedDate: "2026-07-01" })],
        totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
      })
      .mockResolvedValueOnce({
        entries: [makeEntry(11, { foodId: 1, loggedDate: "2026-07-02" })],
        totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
      });

    const { result, rerender } = renderHook(({ date }) => useDailyLog(date), {
      initialProps: { date: "2026-07-01" },
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(mockGetFoodById).toHaveBeenCalledTimes(1);

    rerender({ date: "2026-07-02" });
    await waitFor(() => expect(result.current.entries[0]!.loggedDate).toBe("2026-07-02"));

    // Same foodId (1) on the new day — should reuse the cache, not refetch.
    expect(mockGetFoodById).toHaveBeenCalledTimes(1);
    expect(result.current.entries[0]!.food?.name).toBe("Apple");
  });
});

describe("useDailyLog — local optimistic updates", () => {
  it("addEntryLocally appends the entry and recomputes totals", async () => {
    mockGetLogs.mockResolvedValue(emptyResponse());
    const { result } = renderHook(() => useDailyLog("2026-07-06"));
    await waitFor(() => expect(result.current.status).toBe("success"));

    const food = makeFood(5, { name: "Rice" });
    const entry = makeEntry(5, { calories: 300, protein: 6, carbs: 60, fat: 1 });

    act(() => result.current.addEntryLocally(entry, food));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.food?.name).toBe("Rice");
    expect(result.current.totals).toEqual({ calories: 300, protein: 6, carbs: 60, fat: 1 });
  });

  it("updateEntryLocally replaces the entry data but keeps the resolved food and recomputes totals", async () => {
    const entry = makeEntry(1, { calories: 100, protein: 10, carbs: 10, fat: 5 });
    mockGetLogs.mockResolvedValue({
      entries: [entry],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });
    mockGetFoodById.mockResolvedValue(makeFood(1, { name: "Bread" }));

    const { result } = renderHook(() => useDailyLog("2026-07-06"));
    await waitFor(() => expect(result.current.status).toBe("success"));

    const updated: LogEntry = { ...entry, amount: 200, calories: 200, protein: 20, carbs: 20, fat: 10 };
    act(() => result.current.updateEntryLocally(updated));

    expect(result.current.entries[0]!.amount).toBe(200);
    expect(result.current.entries[0]!.food?.name).toBe("Bread"); // food preserved
    expect(result.current.totals).toEqual({ calories: 200, protein: 20, carbs: 20, fat: 10 });
  });

  it("updateEntryLocally is a no-op if the id doesn't match any existing entry", async () => {
    const entry = makeEntry(1, { calories: 100, protein: 10, carbs: 10, fat: 5 });
    mockGetLogs.mockResolvedValue({
      entries: [entry],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });
    mockGetFoodById.mockResolvedValue(makeFood(1));

    const { result } = renderHook(() => useDailyLog("2026-07-06"));
    await waitFor(() => expect(result.current.status).toBe("success"));

    act(() => result.current.updateEntryLocally(makeEntry(999, { calories: 5000 })));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.totals.calories).toBe(100);
  });

  it("removeEntryLocally removes the entry and recomputes totals to zero when empty", async () => {
    const entry = makeEntry(1, { calories: 100, protein: 10, carbs: 10, fat: 5 });
    mockGetLogs.mockResolvedValue({
      entries: [entry],
      totals: { calories: 100, protein: 10, carbs: 10, fat: 5 },
    });
    mockGetFoodById.mockResolvedValue(makeFood(1));

    const { result } = renderHook(() => useDailyLog("2026-07-06"));
    await waitFor(() => expect(result.current.status).toBe("success"));

    act(() => result.current.removeEntryLocally(1));

    expect(result.current.entries).toEqual([]);
    expect(result.current.totals).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});
