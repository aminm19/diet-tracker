// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goals } from "shared";
import App from "./App";
import { getGoals, getLogs, updateGoals } from "./lib/api";

vi.mock("./lib/api", async () => {
  const actual = await vi.importActual<typeof import("./lib/api")>("./lib/api");
  return {
    ...actual,
    getGoals: vi.fn(),
    updateGoals: vi.fn(),
    getLogs: vi.fn(),
    getFoodById: vi.fn(),
  };
});

const mockGetGoals = vi.mocked(getGoals);
const mockUpdateGoals = vi.mocked(updateGoals);
const mockGetLogs = vi.mocked(getLogs);

const emptyLogs = { entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } };
const existingGoals: Goals = { calories: 2000, protein: 150, carbs: 200, fat: 70 };

beforeEach(() => {
  mockGetGoals.mockReset();
  mockUpdateGoals.mockReset();
  mockGetLogs.mockReset();
  mockGetLogs.mockResolvedValue(emptyLogs);
});

describe("App — goals wiring on mount", () => {
  it("calls getGoals on mount and uses the result to set goals (goals already set)", async () => {
    mockGetGoals.mockResolvedValue(existingGoals);
    render(<App />);

    await waitFor(() => expect(mockGetGoals).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Edit goals/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Set goals to track progress →")).not.toBeInTheDocument());
  });

  it("calls getGoals on mount and falls back to null when goals are unset", async () => {
    mockGetGoals.mockResolvedValue(null);
    render(<App />);

    await waitFor(() => expect(mockGetGoals).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Set goals/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Set goals to track progress →")).toBeInTheDocument());
  });

  it("keeps goals as null (soft-fail) when getGoals rejects, without a page-level error", async () => {
    mockGetGoals.mockRejectedValue(new Error("network down"));
    render(<App />);

    await waitFor(() => expect(mockGetGoals).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Set goals/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("App — goals modal open/close", () => {
  it("opens GoalsModal when the goals button is clicked, and closes it on Escape without saving", async () => {
    mockGetGoals.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(mockGetGoals).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /Set goals/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockUpdateGoals).not.toHaveBeenCalled();
  });

  it("updates the day view's goals after a successful save without issuing a second getGoals fetch", async () => {
    mockGetGoals.mockResolvedValue(null);
    const saved: Goals = { calories: 1800, protein: 140, carbs: 180, fat: 60 };
    mockUpdateGoals.mockResolvedValue(saved);
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(mockGetGoals).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /Set goals/ }));

    const inputs = screen.getAllByRole("spinbutton");
    const values = ["1800", "140", "180", "60"];
    for (let i = 0; i < inputs.length; i++) {
      await user.type(inputs[i]!, values[i]!);
    }

    await user.click(screen.getByRole("button", { name: "Save goals" }));

    await waitFor(() => expect(mockUpdateGoals).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Local optimistic update — no extra getGoals call beyond the initial mount fetch.
    expect(mockGetGoals).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Edit goals/ })).toBeInTheDocument();
    expect(screen.queryByText("Set goals to track progress →")).not.toBeInTheDocument();

    // Real percentages now render end-to-end through App -> DaySummary -> MacroProgress.
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar).toHaveAttribute("aria-valuenow", "0");
    }
  });
});
