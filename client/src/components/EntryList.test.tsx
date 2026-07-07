// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EntryList } from "./EntryList";
import type { EnrichedEntry } from "../hooks/useDailyLog";

function makeEntry(id: number): EnrichedEntry {
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
    food: {
      id,
      source: "usda",
      externalId: `e${id}`,
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
    },
  };
}

describe("EntryList", () => {
  it("shows a skeleton loading state and no entries when status=loading", () => {
    render(
      <EntryList status="loading" entries={[]} error={null} onRetry={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} />,
    );
    expect(screen.getByLabelText("Loading entries")).toBeInTheDocument();
  });

  it("shows the error message and a working retry button when status=error", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <EntryList
        status="error"
        entries={[]}
        error="Network unreachable"
        onRetry={onRetry}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    expect(screen.getByText("Network unreachable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message when status=error and error is null", () => {
    render(
      <EntryList status="error" entries={[]} error={null} onRetry={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} />,
    );
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("shows an empty-state message when status=success with zero entries", () => {
    render(
      <EntryList status="success" entries={[]} error={null} onRetry={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} />,
    );
    expect(screen.getByText("Nothing logged yet")).toBeInTheDocument();
  });

  it("renders one EntryCard per entry when status=success", () => {
    render(
      <EntryList
        status="success"
        entries={[makeEntry(1), makeEntry(2)]}
        error={null}
        onRetry={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    expect(screen.getByText("Food 1")).toBeInTheDocument();
    expect(screen.getByText("Food 2")).toBeInTheDocument();
  });
});
