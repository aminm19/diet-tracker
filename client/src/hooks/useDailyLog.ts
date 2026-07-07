// Loads a day's log entries + totals and keeps them in sync with local
// create/update/delete actions without a full page reload.
//
// `GET /api/logs` returns entries with only a `foodId` (no name/brand), so
// this hook additionally resolves each entry's `Food` via
// `GET /api/foods/:id`, caching results across day switches so foods logged
// on multiple days aren't re-fetched.
//
// Race safety: rapid day switches fire overlapping requests. Every load
// tags itself with an incrementing request id; if a response comes back
// after a newer request has started, it's discarded so the last request
// always wins regardless of resolution order. Each load also aborts the
// previous in-flight fetch via `AbortController`.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Food, LogEntry, LogTotals } from "shared";
import { computeLogTotals } from "shared";
import { ApiError, getFoodById, getLogs } from "../lib/api";

export interface EnrichedEntry extends LogEntry {
  food: Food | null;
}

type Status = "loading" | "success" | "error";

interface State {
  status: Status;
  entries: EnrichedEntry[];
  totals: LogTotals;
  error: string | null;
}

const EMPTY_TOTALS: LogTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function useDailyLog(date: string) {
  const [state, setState] = useState<State>({
    status: "loading",
    entries: [],
    totals: EMPTY_TOTALS,
    error: null,
  });

  const foodCacheRef = useRef(new Map<number, Food>());
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // `load` itself stays a plain synchronous function — the actual async
  // work runs inside a nested async IIFE so this hook's state updates
  // synchronize with the fetch's *result* (an external event), not the
  // effect's own synchronous execution.
  const load = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = ++requestIdRef.current;

    void (async () => {
      setState((prev) => ({ ...prev, status: "loading", error: null }));

      try {
        const response = await getLogs(date, controller.signal);

        const missingIds = [...new Set(response.entries.map((entry) => entry.foodId))].filter(
          (id) => !foodCacheRef.current.has(id),
        );

        if (missingIds.length > 0) {
          const foods = await Promise.all(
            missingIds.map((id) => getFoodById(id, controller.signal).catch(() => null)),
          );
          foods.forEach((food) => {
            if (food) foodCacheRef.current.set(food.id, food);
          });
        }

        if (requestId !== requestIdRef.current) return; // superseded by a newer load

        const entries: EnrichedEntry[] = response.entries.map((entry) => ({
          ...entry,
          food: foodCacheRef.current.get(entry.foodId) ?? null,
        }));

        setState({ status: "success", entries, totals: response.totals, error: null });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId !== requestIdRef.current) return;

        const message = err instanceof ApiError ? err.message : "Couldn't load today's log.";
        setState({ status: "error", entries: [], totals: EMPTY_TOTALS, error: message });
      }
    })();
  }, [date]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const cacheFood = useCallback((food: Food) => {
    foodCacheRef.current.set(food.id, food);
  }, []);

  const addEntryLocally = useCallback((entry: LogEntry, food: Food) => {
    foodCacheRef.current.set(food.id, food);
    setState((prev) => {
      const entries = [...prev.entries, { ...entry, food }];
      return { ...prev, entries, totals: computeLogTotals(entries) };
    });
  }, []);

  const updateEntryLocally = useCallback((entry: LogEntry) => {
    setState((prev) => {
      const entries = prev.entries.map((existing) =>
        existing.id === entry.id ? { ...entry, food: existing.food } : existing,
      );
      return { ...prev, entries, totals: computeLogTotals(entries) };
    });
  }, []);

  const removeEntryLocally = useCallback((id: number) => {
    setState((prev) => {
      const entries = prev.entries.filter((entry) => entry.id !== id);
      return { ...prev, entries, totals: computeLogTotals(entries) };
    });
  }, []);

  return {
    ...state,
    reload: load,
    cacheFood,
    addEntryLocally,
    updateEntryLocally,
    removeEntryLocally,
  };
}
