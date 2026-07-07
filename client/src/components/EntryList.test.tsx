// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntryList } from "./EntryList";
import type { EnrichedEntry } from "../hooks/useDailyLog";
import { deleteLog } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    deleteLog: vi.fn(),
  };
});

const mockDeleteLog = vi.mocked(deleteLog);

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

// Stateful harness mirroring how `App` actually owns the entries array (via
// `useDailyLog`'s `removeEntryLocally`) — `EntryList` itself is presentational
// and relies on the parent to actually remove the deleted entry, which is
// what triggers the post-delete focus-restoration effect under test.
function DeletableEntryList({
  initialEntries,
  onEmptyAfterDelete,
}: {
  initialEntries: EnrichedEntry[];
  onEmptyAfterDelete?: () => void;
}) {
  const [entries, setEntries] = useState(initialEntries);
  return (
    <EntryList
      status="success"
      entries={entries}
      error={null}
      onRetry={vi.fn()}
      onUpdated={vi.fn()}
      onDeleted={(id) => setEntries((prev) => prev.filter((entry) => entry.id !== id))}
      onEmptyAfterDelete={onEmptyAfterDelete}
    />
  );
}

async function deleteEntryThroughUi(user: ReturnType<typeof userEvent.setup>, foodLabel: string) {
  await user.click(screen.getByRole("button", { name: `Delete ${foodLabel}` }));
  await user.click(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() => expect(mockDeleteLog).toHaveBeenCalled());
  const container = screen.getByText(foodLabel).closest("div[style]")!;
  await act(async () => {
    fireEvent.transitionEnd(container, { propertyName: "opacity" });
  });
}

// Mirrors `App.tsx`'s actual wiring (a real focusable "Add food" button whose
// ref is passed through `onEmptyAfterDelete`) rather than a bare spy, so the
// empty-after-delete case can be checked with a real `document.activeElement`
// assertion instead of merely asserting the callback fired.
function AppLikeHarness({ initialEntries }: { initialEntries: EnrichedEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const addFoodButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={addFoodButtonRef} type="button">
        Add food
      </button>
      <EntryList
        status="success"
        entries={entries}
        error={null}
        onRetry={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={(id) => setEntries((prev) => prev.filter((entry) => entry.id !== id))}
        onEmptyAfterDelete={() => addFoodButtonRef.current?.focus()}
      />
    </div>
  );
}

describe("EntryList — focus restoration after delete", () => {
  beforeEach(() => {
    mockDeleteLog.mockReset();
    mockDeleteLog.mockResolvedValue(undefined);
  });

  it("moves focus to the next remaining row's Edit button after deleting a middle row", async () => {
    const user = userEvent.setup();
    render(<DeletableEntryList initialEntries={[makeEntry(1), makeEntry(2), makeEntry(3)]} />);

    await deleteEntryThroughUi(user, "Food 2");

    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Food 3" })).toHaveFocus());
  });

  it("moves focus to the previous row's Edit button after deleting the last row", async () => {
    const user = userEvent.setup();
    render(<DeletableEntryList initialEntries={[makeEntry(1), makeEntry(2), makeEntry(3)]} />);

    await deleteEntryThroughUi(user, "Food 3");

    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Food 2" })).toHaveFocus());
  });

  it("calls onEmptyAfterDelete once the last remaining row is deleted", async () => {
    const user = userEvent.setup();
    const onEmptyAfterDelete = vi.fn();
    render(<DeletableEntryList initialEntries={[makeEntry(1)]} onEmptyAfterDelete={onEmptyAfterDelete} />);

    await deleteEntryThroughUi(user, "Food 1");

    await waitFor(() => expect(onEmptyAfterDelete).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Nothing logged yet")).toBeInTheDocument();
  });

  it("actually moves focus to the page-level 'Add food' button after deleting the only remaining entry (real DOM focus, not just the callback firing)", async () => {
    const user = userEvent.setup();
    render(<AppLikeHarness initialEntries={[makeEntry(1)]} />);

    await deleteEntryThroughUi(user, "Food 1");

    await waitFor(() => expect(screen.getByRole("button", { name: "Add food" })).toHaveFocus());
  });

  it("handles a rapid double-delete (deleting a second row before the first row's focus restoration frame has fired) without losing or misplacing focus", async () => {
    const user = userEvent.setup();
    render(<DeletableEntryList initialEntries={[makeEntry(1), makeEntry(2), makeEntry(3)]} />);

    // Delete the middle row, but don't let its rAF-deferred focus move settle
    // before starting a second delete.
    await user.click(screen.getByRole("button", { name: "Delete Food 2" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(mockDeleteLog).toHaveBeenCalledWith(2));
    const container2 = screen.getByText("Food 2").closest("div[style]")!;
    // Deliberately not awaited/act-wrapped as a macrotask boundary — fires the
    // transition end (and thus the first delete's focus-target bookkeeping)
    // right before immediately starting a second delete below.
    fireEvent.transitionEnd(container2, { propertyName: "opacity" });

    await user.click(screen.getByRole("button", { name: "Delete Food 3" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(mockDeleteLog).toHaveBeenCalledWith(3));
    const container3 = screen.getByText("Food 3").closest("div[style]")!;
    await act(async () => {
      fireEvent.transitionEnd(container3, { propertyName: "opacity" });
    });

    // Only Food 1 remains; focus must land on its Edit button — not be lost
    // (e.g. stuck on <body>) and not thrown onto a since-removed row.
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Food 1" })).toHaveFocus());
    expect(screen.queryByText("Food 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Food 3")).not.toBeInTheDocument();
  });

  it("cancelling an edit on a middle row focuses that row's own Edit button, not a sibling row's", async () => {
    const user = userEvent.setup();
    render(<DeletableEntryList initialEntries={[makeEntry(1), makeEntry(2), makeEntry(3)]} />);

    await user.click(screen.getByRole("button", { name: "Edit Food 2" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Edit Food 2" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Edit Food 1" })).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "Edit Food 3" })).not.toHaveFocus();
  });
});

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
