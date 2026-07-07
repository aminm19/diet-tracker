// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Food } from "shared";
import { AddFoodModal } from "./AddFoodModal";
import { ApiError, createLog, searchFoods } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    searchFoods: vi.fn(),
    createLog: vi.fn(),
  };
});

const mockSearchFoods = vi.mocked(searchFoods);
const mockCreateLog = vi.mocked(createLog);

function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: 1,
    source: "usda",
    externalId: "ext-1",
    name: "Banana",
    brand: null,
    servingSize: null,
    servingUnit: null,
    caloriesPer100g: 89,
    proteinPer100g: 1.1,
    carbsPer100g: 23,
    fatPer100g: 0.3,
    sugarPer100g: 12,
    sodiumPer100g: 1,
    novaGroup: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockSearchFoods.mockReset();
  mockCreateLog.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AddFoodModal — search & debounce", () => {
  it("shows a prompt instead of searching for an empty query", () => {
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);
    expect(screen.getByText("Start typing to search foods.")).toBeInTheDocument();
    expect(mockSearchFoods).not.toHaveBeenCalled();
  });

  it("does not call searchFoods until the 300ms debounce elapses", async () => {
    mockSearchFoods.mockResolvedValue([makeFood()]);
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    expect(mockSearchFoods).not.toHaveBeenCalled();

    await act299ms();
    expect(mockSearchFoods).not.toHaveBeenCalled();

    await act1ms();
    expect(mockSearchFoods).toHaveBeenCalledWith("ban", expect.anything());
  });

  it("only issues one search after rapid retyping within the debounce window", async () => {
    mockSearchFoods.mockResolvedValue([makeFood()]);
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search for a food…");

    fireEvent.change(input, { target: { value: "b" } });
    await act(150);
    fireEvent.change(input, { target: { value: "ba" } });
    await act(150);
    fireEvent.change(input, { target: { value: "ban" } });
    await act(300);

    expect(mockSearchFoods).toHaveBeenCalledTimes(1);
    expect(mockSearchFoods).toHaveBeenCalledWith("ban", expect.anything());
  });

  it("trims whitespace-only queries and treats them as empty", async () => {
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "   " } });
    await act(300);
    expect(mockSearchFoods).not.toHaveBeenCalled();
    expect(screen.getByText("Start typing to search foods.")).toBeInTheDocument();
  });

  it("shows a loading state while searching", async () => {
    let resolveSearch!: (foods: Food[]) => void;
    mockSearchFoods.mockReturnValue(new Promise((resolve) => (resolveSearch = resolve)));
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    await act(300);

    expect(screen.getByLabelText("Searching")).toBeInTheDocument();
    await act(async () => resolveSearch([makeFood()]));
    expect(screen.queryByLabelText("Searching")).not.toBeInTheDocument();
  });

  it("shows an empty-results message when the search returns nothing", async () => {
    mockSearchFoods.mockResolvedValue([]);
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "zzz" } });
    await act(300);

    await waitFor(() => expect(screen.getByText('No foods found for "zzz".')).toBeInTheDocument());
  });

  it("shows an error message when the search fails", async () => {
    mockSearchFoods.mockRejectedValue(new ApiError("Search backend down", 502));
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    await act(300);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Search backend down"));
  });

  it("renders results with name, brand, source, and calories", async () => {
    mockSearchFoods.mockResolvedValue([makeFood({ brand: "Chiquita" })]);
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    await act(300);

    await waitFor(() => expect(screen.getByText("Banana")).toBeInTheDocument());
    expect(screen.getByText(/Chiquita/)).toBeInTheDocument();
    expect(screen.getByText(/USDA/)).toBeInTheDocument();
    expect(screen.getByText("89 kcal/100g")).toBeInTheDocument();
  });
});

describe("AddFoodModal — select & submit flow", () => {
  it("selecting a food with no servingSize defaults amount=100, unit=g", async () => {
    mockSearchFoods.mockResolvedValue([makeFood({ servingSize: null })]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    await act(300);
    await waitFor(() => expect(screen.getByText("Banana")).toBeInTheDocument());

    await user.click(screen.getByText("Banana"));

    expect(screen.getByDisplayValue("100")).toBeInTheDocument();
    const gramButton = screen.getByRole("button", { name: "g" });
    expect(gramButton).toHaveAttribute("aria-pressed", "true");
    const servingButton = screen.getByRole("button", { name: "serving" });
    expect(servingButton).toBeDisabled();
  });

  it("selecting a food with a servingSize defaults amount=1, unit=serving", async () => {
    mockSearchFoods.mockResolvedValue([makeFood({ servingSize: 118, servingUnit: "g" })]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    await act(300);
    await waitFor(() => expect(screen.getByText("Banana")).toBeInTheDocument());
    await user.click(screen.getByText("Banana"));

    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
    const servingButton = screen.getByRole("button", { name: "serving" });
    expect(servingButton).toHaveAttribute("aria-pressed", "true");
    expect(servingButton).not.toBeDisabled();
  });

  it("submits with the correct payload and calls onAdded + onClose", async () => {
    const food = makeFood({ servingSize: null });
    mockSearchFoods.mockResolvedValue([food]);
    const createdEntry = {
      id: 99,
      loggedDate: "2026-07-06",
      foodId: 1,
      amount: 150,
      unit: "g" as const,
      calories: 133.5,
      protein: 1.65,
      carbs: 34.5,
      fat: 0.45,
      sugar: 18,
      sodium: 1.5,
    };
    mockCreateLog.mockResolvedValue(createdEntry);
    const onAdded = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<AddFoodModal date="2026-07-06" onClose={onClose} onAdded={onAdded} />);
    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    await act(300);
    await waitFor(() => expect(screen.getByText("Banana")).toBeInTheDocument());
    await user.click(screen.getByText("Banana"));

    const amountInput = screen.getByDisplayValue("100");
    fireEvent.change(amountInput, { target: { value: "150" } });
    fireEvent.submit(amountInput.closest("form")!);

    await waitFor(() =>
      expect(mockCreateLog).toHaveBeenCalledWith({ foodId: 1, loggedDate: "2026-07-06", amount: 150, unit: "g" }),
    );
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(createdEntry, food));
    expect(onClose).toHaveBeenCalled();
  });

  it("rejects amount <= 0 at the JS validation level without calling createLog", async () => {
    mockSearchFoods.mockResolvedValue([makeFood({ servingSize: null })]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    await act(300);
    await waitFor(() => expect(screen.getByText("Banana")).toBeInTheDocument());
    await user.click(screen.getByText("Banana"));

    const amountInput = screen.getByDisplayValue("100");
    fireEvent.change(amountInput, { target: { value: "0" } });
    fireEvent.submit(amountInput.closest("form")!);

    expect(mockCreateLog).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount greater than 0.");
  });

  it("shows a submit error and stays open if createLog fails", async () => {
    mockSearchFoods.mockResolvedValue([makeFood({ servingSize: null })]);
    mockCreateLog.mockRejectedValue(new ApiError("Duplicate log entry", 409));
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<AddFoodModal date="2026-07-06" onClose={onClose} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    await act(300);
    await waitFor(() => expect(screen.getByText("Banana")).toBeInTheDocument());
    await user.click(screen.getByText("Banana"));
    fireEvent.submit(screen.getByDisplayValue("100").closest("form")!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Duplicate log entry"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Back returns to search results without submitting", async () => {
    mockSearchFoods.mockResolvedValue([makeFood({ servingSize: null })]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search for a food…"), { target: { value: "ban" } });
    await act(300);
    await waitFor(() => expect(screen.getByText("Banana")).toBeInTheDocument());
    await user.click(screen.getByText("Banana"));

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(mockCreateLog).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Search for a food…")).toBeInTheDocument();
  });
});

describe("AddFoodModal — keyboard, focus, and lifecycle", () => {
  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<AddFoodModal date="2026-07-06" onClose={onClose} onAdded={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(<AddFoodModal date="2026-07-06" onClose={onClose} onAdded={vi.fn()} />);
    const backdrop = container.querySelector('div[class*="fixed inset-0"]')!;
    fireEvent.mouseDown(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking inside the panel does not close the modal", () => {
    const onClose = vi.fn();
    render(<AddFoodModal date="2026-07-06" onClose={onClose} onAdded={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and restores it on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("traps Tab within the panel (wraps from last to first focusable element)", () => {
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const last = focusable[focusable.length - 1]!;
    const first = focusable[0]!;

    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("traps Shift+Tab within the panel (wraps from first to last focusable element)", () => {
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const last = focusable[focusable.length - 1]!;
    const first = focusable[0]!;

    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("has dialog semantics (role=dialog, aria-modal, labelledby)", () => {
    render(<AddFoodModal date="2026-07-06" onClose={vi.fn()} onAdded={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "add-food-modal-title");
  });
});

// Helpers to advance fake timers while flushing React updates via `act`.
async function act(ms: number | (() => void | Promise<void>)) {
  const { act: rtlAct } = await import("@testing-library/react");
  if (typeof ms === "function") {
    await rtlAct(async () => {
      await ms();
    });
    return;
  }
  await rtlAct(async () => {
    vi.advanceTimersByTime(ms);
    // Flush microtasks queued by resolved promises inside the timer callback.
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function act299ms() {
  await act(299);
}
async function act1ms() {
  await act(1);
}
