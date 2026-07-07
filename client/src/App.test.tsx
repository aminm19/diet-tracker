// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goals, HealthScoreSettings } from "shared";
import App from "./App";
import {
  getGoals,
  getHealthScore,
  getHealthScoreSettings,
  getLogs,
  updateGoals,
  updateHealthScoreSettings,
} from "./lib/api";

vi.mock("./lib/api", async () => {
  const actual = await vi.importActual<typeof import("./lib/api")>("./lib/api");
  return {
    ...actual,
    getGoals: vi.fn(),
    updateGoals: vi.fn(),
    getLogs: vi.fn(),
    getFoodById: vi.fn(),
    getHealthScore: vi.fn(),
    getHealthScoreSettings: vi.fn(),
    updateHealthScoreSettings: vi.fn(),
  };
});

const mockGetGoals = vi.mocked(getGoals);
const mockUpdateGoals = vi.mocked(updateGoals);
const mockGetLogs = vi.mocked(getLogs);
const mockGetHealthScore = vi.mocked(getHealthScore);
const mockGetHealthScoreSettings = vi.mocked(getHealthScoreSettings);
const mockUpdateHealthScoreSettings = vi.mocked(updateHealthScoreSettings);

const emptyLogs = { entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } };
const existingGoals: Goals = { calories: 2000, protein: 150, carbs: 200, fat: 70 };
const existingHealthScoreSettings: HealthScoreSettings = {
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

beforeEach(() => {
  mockGetGoals.mockReset();
  mockUpdateGoals.mockReset();
  mockGetLogs.mockReset();
  mockGetLogs.mockResolvedValue(emptyLogs);
  mockGetGoals.mockResolvedValue(null);
  mockGetHealthScore.mockReset();
  mockGetHealthScore.mockResolvedValue({ status: "hidden" });
  mockGetHealthScoreSettings.mockReset();
  mockGetHealthScoreSettings.mockResolvedValue(existingHealthScoreSettings);
  mockUpdateHealthScoreSettings.mockReset();
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

describe("App — health score wiring", () => {
  it("renders the health score badge for the current date on mount", async () => {
    mockGetHealthScore.mockResolvedValue({
      status: "ok",
      score: 82,
      factors: { processing: null, macroFit: null, sugarSodium: null, variety: null },
    });
    render(<App />);

    await waitFor(() => expect(mockGetHealthScore).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("82");
  });

  it("renders nothing extra for the badge when status is hidden, but still shows the settings gear", async () => {
    mockGetHealthScore.mockResolvedValue({ status: "hidden" });
    render(<App />);

    await waitFor(() => expect(mockGetHealthScore).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Health score settings" })).toBeInTheDocument();
  });

  it("opens the health score settings modal when the gear icon is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Health score settings" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Health score settings")).toBeInTheDocument();
  });

  it("closes the settings modal on Escape without saving", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Health score settings" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockUpdateHealthScoreSettings).not.toHaveBeenCalled();
  });

  it("re-fetches the health score (via refreshKey) after a successful settings save, without waiting for a date change", async () => {
    mockGetHealthScore.mockResolvedValue({
      status: "ok",
      score: 40,
      factors: { processing: null, macroFit: null, sugarSodium: null, variety: null },
    });
    mockUpdateHealthScoreSettings.mockResolvedValue({ ...existingHealthScoreSettings, enabled: false });
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(mockGetHealthScore).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Health score settings" }));
    await screen.findAllByDisplayValue("25");

    await user.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mockUpdateHealthScoreSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // The badge must refetch even though `date` itself never changed.
    await waitFor(() => expect(mockGetHealthScore).toHaveBeenCalledTimes(2));
  });
});
