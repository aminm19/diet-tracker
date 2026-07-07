// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goals } from "shared";
import { GoalsModal } from "./GoalsModal";
import { ApiError, updateGoals } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    updateGoals: vi.fn(),
  };
});

const mockUpdateGoals = vi.mocked(updateGoals);

const existingGoals: Goals = { calories: 2000, protein: 150, carbs: 200, fat: 70 };

beforeEach(() => {
  mockUpdateGoals.mockReset();
});

describe("GoalsModal — prefill", () => {
  it("pre-fills fields with existing goal values when editing", () => {
    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByDisplayValue("2000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("150")).toBeInTheDocument();
    expect(screen.getByDisplayValue("200")).toBeInTheDocument();
    expect(screen.getByDisplayValue("70")).toBeInTheDocument();
    expect(screen.getByText("Edit goals")).toBeInTheDocument();
  });

  it("renders empty fields when goals is null (first-time setup)", () => {
    render(<GoalsModal goals={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText("Set goals")).toBeInTheDocument();
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs).toHaveLength(4);
    for (const input of inputs) {
      expect(input.value).toBe("");
    }
  });
});

describe("GoalsModal — responsive layout", () => {
  it("stacks fields in a single column below sm, two columns at sm and up", () => {
    const { container } = render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
    const grid = container.querySelector(".grid")!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("sm:grid-cols-2");
  });
});

describe("GoalsModal — re-seeding from a late-arriving `goals` prop", () => {
  it("re-seeds empty fields once `goals` resolves from null to a real value while still open", async () => {
    const { rerender } = render(<GoalsModal goals={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("");

    rerender(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => expect(screen.getByDisplayValue("2000")).toBeInTheDocument());
    expect(screen.getByDisplayValue("150")).toBeInTheDocument();
    expect(screen.getByDisplayValue("200")).toBeInTheDocument();
    expect(screen.getByDisplayValue("70")).toBeInTheDocument();
  });

  it("does not clobber a field the user already edited when `goals` resolves late", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GoalsModal goals={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    const caloriesInput = screen.getAllByRole("spinbutton")[0]!;
    await user.type(caloriesInput, "1234");
    expect((caloriesInput as HTMLInputElement).value).toBe("1234");

    rerender(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);

    // Give the (guarded) re-seed effect a chance to run if it were going to.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect((caloriesInput as HTMLInputElement).value).toBe("1234");
  });

  // Exercises the *specific* race the builder says an earlier version got
  // wrong: the re-seed effect's `requestAnimationFrame` callback is already
  // scheduled (because `goals` just resolved from null and the user hadn't
  // typed anything yet) when the user starts typing DURING that pending
  // frame — i.e. after the frame is scheduled but before it fires. The
  // deferred callback must re-check `touchedRef` at execution time and back
  // off, not just at the moment the effect first ran.
  it("does not clobber typing that happens during the deferred re-seed frame's pending window", async () => {
    const user = userEvent.setup();
    // Fully replaces `requestAnimationFrame` (rather than just spying on the
    // real one) so the captured callback only ever runs when *we* invoke it
    // below — otherwise the real browser-timing rAF could fire on its own
    // during `user.type`'s per-keystroke delays, seeding the field for real
    // before typing starts and making this test timing-dependent/flaky.
    let seedFrameCallback: FrameRequestCallback | undefined;
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      seedFrameCallback = cb;
      return 1;
    });

    const { rerender } = render(<GoalsModal goals={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    // `goals` resolves to a real value; the user hasn't touched anything yet,
    // so the re-seed effect schedules its frame (captured, not yet run).
    rerender(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(seedFrameCallback).toBeDefined();

    // User starts typing DURING the pending frame's window, before it fires.
    const caloriesInput = screen.getAllByRole("spinbutton")[0]!;
    await user.type(caloriesInput, "999");
    expect((caloriesInput as HTMLInputElement).value).toBe("999");

    // Now let the deferred re-seed frame actually run (it must re-check
    // `touchedRef` here, not rely on a stale check from when it was scheduled).
    act(() => {
      seedFrameCallback!(0);
    });

    // The user's in-progress typing must survive, not be silently overwritten.
    expect((caloriesInput as HTMLInputElement).value).toBe("999");

    rafSpy.mockRestore();
  });

  it("does re-seed when `goals` resolves late and the user has not typed anything", async () => {
    const { rerender } = render(<GoalsModal goals={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("");

    rerender(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("2000"));
  });
});

describe("GoalsModal — submit flow", () => {
  it("submits the right payload and calls onSaved + closes on success", async () => {
    const saved: Goals = { calories: 1800, protein: 140, carbs: 180, fat: 60 };
    mockUpdateGoals.mockResolvedValue(saved);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<GoalsModal goals={existingGoals} onClose={onClose} onSaved={onSaved} />);

    const caloriesInput = screen.getByDisplayValue("2000");
    await user.clear(caloriesInput);
    await user.type(caloriesInput, "1800");

    const proteinInput = screen.getByDisplayValue("150");
    await user.clear(proteinInput);
    await user.type(proteinInput, "140");

    const carbsInput = screen.getByDisplayValue("200");
    await user.clear(carbsInput);
    await user.type(carbsInput, "180");

    const fatInput = screen.getByDisplayValue("70");
    await user.clear(fatInput);
    await user.type(fatInput, "60");

    await user.click(screen.getByRole("button", { name: "Save goals" }));

    await waitFor(() =>
      expect(mockUpdateGoals).toHaveBeenCalledWith({ calories: 1800, protein: 140, carbs: 180, fat: 60 }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(onClose).toHaveBeenCalled();
  });

  it("rejects an empty field with a custom validation message and does not call updateGoals", async () => {
    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);

    const caloriesInput = screen.getByDisplayValue("2000");
    fireEvent.change(caloriesInput, { target: { value: "" } });
    fireEvent.submit(caloriesInput.closest("form")!);

    expect(mockUpdateGoals).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a non-negative number for calories.");
  });

  it("rejects a negative value with a custom validation message and does not call updateGoals", async () => {
    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);

    const proteinInput = screen.getByDisplayValue("150");
    fireEvent.change(proteinInput, { target: { value: "-5" } });
    fireEvent.submit(proteinInput.closest("form")!);

    expect(mockUpdateGoals).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a non-negative number for protein.");
  });

  it("rejects a non-numeric value with a custom validation message", async () => {
    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);

    const carbsInput = screen.getByDisplayValue("200");
    fireEvent.change(carbsInput, { target: { value: "abc" } });
    fireEvent.submit(carbsInput.closest("form")!);

    expect(mockUpdateGoals).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a non-negative number for carbs.");
  });

  it("has noValidate on the form so native HTML5 validation never shadows the custom message", () => {
    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
    const form = screen.getByDisplayValue("2000").closest("form")!;
    expect(form).toHaveAttribute("novalidate");
  });

  it("accepts zero as a valid (non-negative) goal value", async () => {
    const saved: Goals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    mockUpdateGoals.mockResolvedValue(saved);
    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);

    for (const value of ["2000", "150", "200", "70"]) {
      fireEvent.change(screen.getByDisplayValue(value), { target: { value: "0" } });
    }
    fireEvent.submit(screen.getAllByRole("spinbutton")[0]!.closest("form")!);

    await waitFor(() =>
      expect(mockUpdateGoals).toHaveBeenCalledWith({ calories: 0, protein: 0, carbs: 0, fat: 0 }),
    );
  });

  it("shows loading state ('Saving…') and disables the submit button while submitting", async () => {
    let resolveSave!: (goals: Goals) => void;
    mockUpdateGoals.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)));
    const user = userEvent.setup();

    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Save goals" }));

    const submitButton = screen.getByRole("button", { name: "Saving…" });
    expect(submitButton).toBeDisabled();

    await waitFor(() =>
      resolveSave({ calories: 2000, protein: 150, carbs: 200, fat: 70 }),
    );
  });

  it("shows an API-failure error state (role=alert) and keeps the modal open", async () => {
    mockUpdateGoals.mockRejectedValue(new ApiError("Couldn't save goals right now", 500));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<GoalsModal goals={existingGoals} onClose={onClose} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Save goals" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save goals right now"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the failure is not an ApiError", async () => {
    mockUpdateGoals.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();

    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Save goals" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save goals. Try again."));
  });

  it("ignores a second submit fired while the first is still in flight (double-submit guard)", async () => {
    let resolveSave!: (goals: Goals) => void;
    mockUpdateGoals.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)));

    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
    const form = screen.getByDisplayValue("2000").closest("form")!;

    // Two submits fired back-to-back, before React flushes the `submitting`
    // state update that disables the button — the synchronous ref guard
    // should still only let the first one through.
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(mockUpdateGoals).toHaveBeenCalledTimes(1);

    resolveSave({ calories: 2000, protein: 150, carbs: 200, fat: 70 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save goals" })).toBeInTheDocument());
  });
});

describe("GoalsModal — keyboard, focus, and lifecycle", () => {
  it("calls onClose when Escape is pressed without saving", () => {
    const onClose = vi.fn();
    render(<GoalsModal goals={existingGoals} onClose={onClose} onSaved={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockUpdateGoals).not.toHaveBeenCalled();
  });

  it("calls onClose when clicking the backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(<GoalsModal goals={existingGoals} onClose={onClose} onSaved={vi.fn()} />);
    const backdrop = container.querySelector('div[class*="fixed inset-0"]')!;
    fireEvent.mouseDown(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking inside the panel does not close the modal", () => {
    const onClose = vi.fn();
    render(<GoalsModal goals={existingGoals} onClose={onClose} onSaved={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and restores it on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("traps Tab within the panel (wraps from last to first focusable element)", () => {
    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
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
    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
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
    render(<GoalsModal goals={existingGoals} onClose={vi.fn()} onSaved={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "goals-modal-title");
  });
});
