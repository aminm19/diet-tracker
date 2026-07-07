// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Food } from "shared";
import { EntryCard } from "./EntryCard";
import { ApiError, deleteLog, updateLog } from "../lib/api";
import type { EnrichedEntry } from "../hooks/useDailyLog";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    updateLog: vi.fn(),
    deleteLog: vi.fn(),
  };
});

const mockUpdateLog = vi.mocked(updateLog);
const mockDeleteLog = vi.mocked(deleteLog);

function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: 1,
    source: "usda",
    externalId: "ext-1",
    name: "Chicken breast",
    brand: null,
    servingSize: null,
    servingUnit: null,
    caloriesPer100g: 165,
    proteinPer100g: 31,
    carbsPer100g: 0,
    fatPer100g: 3.6,
    sugarPer100g: null,
    sodiumPer100g: null,
    novaGroup: 1,
    foodGroup: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<EnrichedEntry> = {}): EnrichedEntry {
  return {
    id: 42,
    loggedDate: "2026-07-06",
    foodId: 1,
    amount: 150,
    unit: "g",
    calories: 247.5,
    protein: 46.5,
    carbs: 0,
    fat: 5.4,
    sugar: null,
    sodium: null,
    food: makeFood(),
    ...overrides,
  };
}

beforeEach(() => {
  mockUpdateLog.mockReset();
  mockDeleteLog.mockReset();
});

describe("EntryCard — view mode", () => {
  it("renders food name, brand, amount, and macro summary", () => {
    render(
      <EntryCard
        entry={makeEntry({ food: makeFood({ brand: "Acme" }) })}
        index={0}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    expect(screen.getByText("Chicken breast")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("150 g")).toBeInTheDocument();
    expect(screen.getByText("248 kcal")).toBeInTheDocument(); // rounded
  });

  it("renders 'Unknown food' if food failed to resolve", () => {
    render(<EntryCard entry={makeEntry({ food: null })} index={0} onUpdated={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByText("Unknown food")).toBeInTheDocument();
  });
});

describe("EntryCard — edit flow", () => {
  it("submits the correct payload (amount + unit) and calls onUpdated", async () => {
    const user = userEvent.setup();
    const updated = { ...makeEntry(), amount: 200, calories: 330 };
    mockUpdateLog.mockResolvedValue(updated);
    const onUpdated = vi.fn();

    render(<EntryCard entry={makeEntry()} index={0} onUpdated={onUpdated} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Chicken breast" }));

    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "200");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdateLog).toHaveBeenCalledWith(42, { amount: 200, unit: "g" }));
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  // Note: the input has a native `min="0.1"` attribute, so a real click on
  // the Save button is intercepted by the browser's own HTML5 constraint
  // validation before the JS handler ever runs (confirmed by instrumenting
  // the component — clicking Save with 0 or a negative value never reaches
  // `handleSave`, and no visible feedback of any kind is shown to the user).
  // `fireEvent.submit` bypasses that native step (as it does for any real
  // browser too, since it dispatches the submit event directly instead of
  // going through the button-activation submission algorithm), which is the
  // only way to exercise the component's own JS-level validation directly.
  it("rejects amount <= 0 without calling the API (component-level validation)", async () => {
    const user = userEvent.setup();
    const { container } = render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Chicken breast" }));
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "0");
    fireEvent.submit(container.querySelector("form")!);

    expect(mockUpdateLog).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount greater than 0.");
  });

  it("rejects a negative amount (component-level validation)", async () => {
    const user = userEvent.setup();
    const { container } = render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Chicken breast" }));
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "-5");
    fireEvent.submit(container.querySelector("form")!);

    expect(mockUpdateLog).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount greater than 0.");
  });

  it("real click with amount=0 reaches the JS handler and shows the custom validation message", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Chicken breast" }));
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockUpdateLog).not.toHaveBeenCalled();
    // The form has `noValidate`, so native min-validation doesn't shadow
    // this component's own error message.
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount greater than 0.");
  });

  it("rejects a non-numeric amount", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Chicken breast" }));
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "abc");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockUpdateLog).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount greater than 0.");
  });

  it("disables the 'serving' unit option when the food has no servingSize", async () => {
    const user = userEvent.setup();
    render(
      <EntryCard
        entry={makeEntry({ food: makeFood({ servingSize: null }) })}
        index={0}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Chicken breast" }));
    const servingOption = screen.getByRole("option", { name: "serving" }) as HTMLOptionElement;
    expect(servingOption.disabled).toBe(true);
  });

  it("enables the 'serving' unit option when the food has a servingSize", async () => {
    const user = userEvent.setup();
    render(
      <EntryCard
        entry={makeEntry({ food: makeFood({ servingSize: 100, servingUnit: "g" }) })}
        index={0}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Chicken breast" }));
    const servingOption = screen.getByRole("option", { name: "serving" }) as HTMLOptionElement;
    expect(servingOption.disabled).toBe(false);
  });

  it("cancel discards edits without calling the API and reverts to view mode", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Chicken breast" }));
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "9999");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockUpdateLog).not.toHaveBeenCalled();
    // Back in view mode showing the original amount, unaffected by the discarded edit.
    expect(screen.getByText("150 g")).toBeInTheDocument();
  });

  it("shows an error message and stays editable if the update API call fails", async () => {
    const user = userEvent.setup();
    mockUpdateLog.mockRejectedValue(new ApiError("Amount must be positive", 400));
    render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Chicken breast" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Amount must be positive"));
    // Still in edit mode (Save button still present).
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("EntryCard — delete flow", () => {
  it("requires confirmation before deleting", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Delete Chicken breast" }));
    expect(screen.getByText("Delete?")).toBeInTheDocument();
    expect(mockDeleteLog).not.toHaveBeenCalled();
  });

  it("cancelling the confirm step does not call deleteLog", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Delete Chicken breast" }));
    await user.click(screen.getByRole("button", { name: "Cancel delete" }));

    expect(mockDeleteLog).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete?")).not.toBeInTheDocument();
  });

  it("confirming delete calls deleteLog with the entry id, then onDeleted after the exit transition", async () => {
    const user = userEvent.setup();
    mockDeleteLog.mockResolvedValue(undefined);
    const onDeleted = vi.fn();

    render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Delete Chicken breast" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(mockDeleteLog).toHaveBeenCalledWith(42));

    // onDeleted only fires once the exit CSS transition completes — jsdom
    // doesn't run real transitions, so this simulates the transitionend
    // event the component listens for.
    expect(onDeleted).not.toHaveBeenCalled();
    const container = screen.getByText("Chicken breast").closest("div[style]")!;
    fireEvent.transitionEnd(container, { propertyName: "opacity" });
    expect(onDeleted).toHaveBeenCalledWith(42);
  });

  it("shows an error and reverts to view mode if delete fails", async () => {
    const user = userEvent.setup();
    mockDeleteLog.mockRejectedValue(new ApiError("Cannot delete", 500));
    const onDeleted = vi.fn();

    render(<EntryCard entry={makeEntry()} index={0} onUpdated={vi.fn()} onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Delete Chicken breast" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot delete"));
    expect(onDeleted).not.toHaveBeenCalled();
    // Back to normal view-mode action buttons.
    expect(screen.getByRole("button", { name: "Delete Chicken breast" })).toBeInTheDocument();
  });
});
