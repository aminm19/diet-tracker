// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthScoreSettings } from "shared";
import { HealthScoreSettingsModal } from "./HealthScoreSettingsModal";
import { ApiError, getHealthScoreSettings, updateHealthScoreSettings } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    getHealthScoreSettings: vi.fn(),
    updateHealthScoreSettings: vi.fn(),
  };
});

const mockGetSettings = vi.mocked(getHealthScoreSettings);
const mockUpdateSettings = vi.mocked(updateHealthScoreSettings);

const existingSettings: HealthScoreSettings = {
  enabled: true,
  processingEnabled: true,
  processingWeight: 0.25,
  macroFitEnabled: true,
  macroFitWeight: 0.25,
  sugarSodiumEnabled: true,
  sugarSodiumWeight: 0.25,
  varietyEnabled: true,
  varietyWeight: 0.25,
};

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
  mockGetSettings.mockReset();
  mockUpdateSettings.mockReset();
  mockGetSettings.mockResolvedValue(existingSettings);
});

describe("HealthScoreSettingsModal — load + prefill", () => {
  it("fetches settings on mount and prefills the form", async () => {
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(1));
    const pctInputs = await screen.findAllByDisplayValue("25");
    expect(pctInputs).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Turn off health score" })).toBeInTheDocument();
  });

  it("re-fetches fresh settings on every mount (not stale from a previous open)", async () => {
    const { unmount } = render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(1));
    unmount();

    const updated: HealthScoreSettings = { ...existingSettings, processingWeight: 0.4 };
    mockGetSettings.mockResolvedValue(updated);
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue("40")).toBeInTheDocument();
  });

  it("shows a loading state while settings are fetching", () => {
    mockGetSettings.mockReturnValue(new Promise(() => {}));
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Loading settings")).toBeInTheDocument();
  });

  it("shows an error state with retry when the initial fetch fails", async () => {
    mockGetSettings.mockRejectedValue(new ApiError("Couldn't load settings", 500));
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText("Couldn't load settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    mockGetSettings.mockResolvedValue(existingSettings);
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByDisplayValue("25")).toHaveLength(4);
  });
});

describe("HealthScoreSettingsModal — initial-focus timing", () => {
  it("moves focus to the master toggle button once settings finish loading, not just the Close button at mount", async () => {
    const d = deferred<HealthScoreSettings>();
    mockGetSettings.mockReturnValue(d.promise);

    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);

    // While still loading, only the Close button is focusable/present.
    expect(screen.getByLabelText("Loading settings")).toBeInTheDocument();

    d.resolve(existingSettings);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Turn off health score" })).toHaveFocus(),
    );
  });
});

describe("HealthScoreSettingsModal — master toggle disables factor rows", () => {
  it("visually disables (greys out + disables inputs of) the four factor rows when master is off", async () => {
    const user = userEvent.setup();
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findAllByDisplayValue("25");
    const pctInputs = screen.getAllByDisplayValue("25") as HTMLInputElement[];
    for (const input of pctInputs) expect(input).not.toBeDisabled();

    const masterToggle = screen.getByRole("button", { name: "Turn off health score" });
    await user.click(masterToggle);

    // Master toggle's accessible name flips once disabled.
    expect(screen.getByRole("button", { name: "Turn on health score" })).toBeInTheDocument();

    // Percentage inputs become disabled.
    const pctInputsAfter = screen.getAllByDisplayValue("25") as HTMLInputElement[];
    for (const input of pctInputsAfter) expect(input).toBeDisabled();

    // The per-factor enable/disable toggle buttons are also disabled.
    const factorToggles = screen.getAllByRole("button", { name: /^(Disable|Enable) / });
    for (const toggle of factorToggles) expect(toggle).toBeDisabled();
  });

  it("re-enables factor rows when master is toggled back on", async () => {
    const user = userEvent.setup();
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");

    const masterToggle = screen.getByRole("button", { name: "Turn off health score" });
    await user.click(masterToggle);
    await user.click(screen.getByRole("button", { name: "Turn on health score" }));

    const pctInputs = screen.getAllByDisplayValue("25") as HTMLInputElement[];
    for (const input of pctInputs) expect(input).not.toBeDisabled();
  });
});

describe("HealthScoreSettingsModal — independent factor toggles", () => {
  it("disables just one factor's weight input via its own enable toggle, leaving others enabled", async () => {
    const user = userEvent.setup();
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");

    const disableProcessing = screen.getByRole("button", { name: "Disable Whole-food vs. processed" });
    await user.click(disableProcessing);

    expect(screen.getByRole("button", { name: "Enable Whole-food vs. processed" })).toBeInTheDocument();

    const pctInputs = screen.getAllByDisplayValue("25") as HTMLInputElement[];
    const disabledCount = pctInputs.filter((i) => i.disabled).length;
    expect(disabledCount).toBe(1);
  });
});

describe("HealthScoreSettingsModal — weight validation", () => {
  it("rejects a negative percentage without calling updateHealthScoreSettings", async () => {
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");

    const inputs = screen.getAllByDisplayValue("25");
    fireEvent.change(inputs[0]!, { target: { value: "-5" } });
    fireEvent.submit(inputs[0]!.closest("form")!);

    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a weight between 0 and 100");
  });

  it("rejects a percentage above 100 without calling updateHealthScoreSettings", async () => {
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");

    const inputs = screen.getAllByDisplayValue("25");
    fireEvent.change(inputs[0]!, { target: { value: "101" } });
    fireEvent.submit(inputs[0]!.closest("form")!);

    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a weight between 0 and 100");
  });

  it("rejects an empty weight field", async () => {
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");

    const inputs = screen.getAllByDisplayValue("25");
    fireEvent.change(inputs[0]!, { target: { value: "" } });
    fireEvent.submit(inputs[0]!.closest("form")!);

    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a weight between 0 and 100");
  });

  it("rejects a non-numeric weight", async () => {
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");

    const inputs = screen.getAllByDisplayValue("25");
    fireEvent.change(inputs[0]!, { target: { value: "abc" } });
    fireEvent.submit(inputs[0]!.closest("form")!);

    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a weight between 0 and 100");
  });

  it("accepts boundary values 0 and 100", async () => {
    mockUpdateSettings.mockResolvedValue(existingSettings);
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");

    const inputs = screen.getAllByDisplayValue("25");
    fireEvent.change(inputs[0]!, { target: { value: "0" } });
    fireEvent.change(inputs[1]!, { target: { value: "100" } });
    fireEvent.submit(inputs[0]!.closest("form")!);

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledTimes(1));
    const payload = mockUpdateSettings.mock.calls[0]![0];
    expect(payload.processingWeight).toBe(0);
    expect(payload.macroFitWeight).toBe(1);
  });
});

describe("HealthScoreSettingsModal — submit payload shape", () => {
  it("converts percentages back to 0-1 fractions exactly (30 -> 0.3, not 30)", async () => {
    mockUpdateSettings.mockResolvedValue(existingSettings);
    const onSaved = vi.fn();
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findAllByDisplayValue("25");

    const inputs = screen.getAllByDisplayValue("25");
    fireEvent.change(inputs[0]!, { target: { value: "30" } });
    fireEvent.change(inputs[1]!, { target: { value: "10" } });
    fireEvent.change(inputs[2]!, { target: { value: "45" } });
    fireEvent.change(inputs[3]!, { target: { value: "15" } });
    fireEvent.submit(inputs[0]!.closest("form")!);

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledTimes(1));
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      enabled: true,
      processingEnabled: true,
      processingWeight: 0.3,
      macroFitEnabled: true,
      macroFitWeight: 0.1,
      sugarSodiumEnabled: true,
      sugarSodiumWeight: 0.45,
      varietyEnabled: true,
      varietyWeight: 0.15,
    });
  });

  it("calls onSaved with the server response and closes on success", async () => {
    const saved: HealthScoreSettings = { ...existingSettings, processingWeight: 0.5 };
    mockUpdateSettings.mockResolvedValue(saved);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<HealthScoreSettingsModal onClose={onClose} onSaved={onSaved} />);
    await screen.findAllByDisplayValue("25");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Saving... and disables submit while in flight", async () => {
    const d = deferred<HealthScoreSettings>();
    mockUpdateSettings.mockReturnValue(d.promise);
    const user = userEvent.setup();

    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    const submitButton = screen.getByRole("button", { name: "Saving…" });
    expect(submitButton).toBeDisabled();
    d.resolve(existingSettings);
  });

  it("shows an API-failure error state and keeps the modal open", async () => {
    mockUpdateSettings.mockRejectedValue(new ApiError("Couldn't save right now", 500));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<HealthScoreSettingsModal onClose={onClose} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save right now"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the save failure is not an ApiError", async () => {
    mockUpdateSettings.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();

    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save health score settings. Try again."),
    );
  });
});

describe("HealthScoreSettingsModal — keyboard, focus, lifecycle", () => {
  it("calls onClose on Escape without saving", async () => {
    const onClose = vi.fn();
    render(<HealthScoreSettingsModal onClose={onClose} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it("has dialog semantics (role=dialog, aria-modal, labelledby)", async () => {
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "health-score-settings-title");
  });

  it("locks body scroll while open and restores it on unmount", async () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("traps Tab within the panel (wraps from last to first focusable element)", async () => {
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findAllByDisplayValue("25");

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

  it("clicking the backdrop closes the modal", async () => {
    const onClose = vi.fn();
    const { container } = render(<HealthScoreSettingsModal onClose={onClose} onSaved={vi.fn()} />);
    const backdrop = container.querySelector('div[class*="fixed inset-0"]')!;
    fireEvent.mouseDown(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has noValidate on the form", async () => {
    render(<HealthScoreSettingsModal onClose={vi.fn()} onSaved={vi.fn()} />);
    const form = (await screen.findAllByDisplayValue("25"))[0]!.closest("form")!;
    expect(form).toHaveAttribute("novalidate");
  });
});
