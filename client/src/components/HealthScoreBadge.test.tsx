// @vitest-environment jsdom
// Tests for `HealthScoreBadge`: the three `status` values, the three score
// bands, loading/error states, and the stale-response guard across rapid
// date changes.
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthScoreResult } from "shared";
import { HealthScoreBadge } from "./HealthScoreBadge";
import { ApiError, getHealthScore } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    getHealthScore: vi.fn(),
  };
});

const mockGetHealthScore = vi.mocked(getHealthScore);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Drains pending microtasks *and* a macrotask tick, so any `.then`
// continuation chained off an already-resolved promise (including ones
// several `await`s deep, like the component's fetch -> ref-check -> setState
// chain) has definitely had a chance to run before we assert on it.
async function flushAll() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function okResult(score: number): HealthScoreResult {
  return {
    status: "ok",
    score,
    factors: { processing: null, macroFit: null, sugarSodium: null, variety: null },
  };
}

beforeEach(() => {
  mockGetHealthScore.mockReset();
});

describe("HealthScoreBadge — status handling", () => {
  it("renders nothing for status: hidden", async () => {
    mockGetHealthScore.mockResolvedValue({ status: "hidden" });
    const { container } = render(<HealthScoreBadge date="2026-07-06" />);

    await waitFor(() => expect(mockGetHealthScore).toHaveBeenCalledTimes(1));
    // Allow the state update following resolution to flush.
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a calm insufficient-data state for status: insufficient_data", async () => {
    mockGetHealthScore.mockResolvedValue({ status: "insufficient_data" });
    render(<HealthScoreBadge date="2026-07-06" />);

    expect(await screen.findByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a loading state while the fetch is in flight", async () => {
    const d = deferred<HealthScoreResult>();
    mockGetHealthScore.mockReturnValue(d.promise);
    render(<HealthScoreBadge date="2026-07-06" />);

    expect(screen.getByLabelText("Loading health score")).toBeInTheDocument();
    d.resolve({ status: "hidden" });
    await waitFor(() => expect(screen.queryByLabelText("Loading health score")).not.toBeInTheDocument());
  });

  it("shows an error state (role=alert) when getHealthScore rejects with an ApiError", async () => {
    mockGetHealthScore.mockRejectedValue(new ApiError("Server exploded", 500));
    render(<HealthScoreBadge date="2026-07-06" />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Server exploded"));
  });

  it("falls back to a generic error message when the rejection is not an ApiError", async () => {
    mockGetHealthScore.mockRejectedValue(new Error("network down"));
    render(<HealthScoreBadge date="2026-07-06" />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load health score."),
    );
  });
});

describe("HealthScoreBadge — score bands", () => {
  it("renders the 'Needs work' danger band for a score below 50 (30)", async () => {
    mockGetHealthScore.mockResolvedValue(okResult(30));
    render(<HealthScoreBadge date="2026-07-06" />);

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-label", "Health score 30 out of 100, Needs work");
    expect(status.querySelector(".bg-\\[var\\(--color-danger\\)\\]")).toBeInTheDocument();
  });

  it("renders the 'Fair' warning band for a score in [50, 75) (60)", async () => {
    mockGetHealthScore.mockResolvedValue(okResult(60));
    render(<HealthScoreBadge date="2026-07-06" />);

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-label", "Health score 60 out of 100, Fair");
    expect(status.querySelector(".bg-\\[var\\(--color-warning\\)\\]")).toBeInTheDocument();
  });

  it("renders the 'Good' band for a score >= 75 (90)", async () => {
    mockGetHealthScore.mockResolvedValue(okResult(90));
    render(<HealthScoreBadge date="2026-07-06" />);

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-label", "Health score 90 out of 100, Good");
    expect(status.querySelector(".bg-\\[var\\(--color-good\\)\\]")).toBeInTheDocument();
  });

  it("bands off the rounded score, not the raw score, so the number and label never contradict (74.6 -> 75, Good)", async () => {
    mockGetHealthScore.mockResolvedValue(okResult(74.6));
    render(<HealthScoreBadge date="2026-07-06" />);

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-label", "Health score 75 out of 100, Good");
  });

  it("exercises the exact band boundaries: 74 is Fair, 75 is Good, 49 is Needs work, 50 is Fair", async () => {
    for (const [score, label] of [
      [49, "Needs work"],
      [50, "Fair"],
      [74, "Fair"],
      [75, "Good"],
    ] as const) {
      mockGetHealthScore.mockResolvedValue(okResult(score));
      const { unmount } = render(<HealthScoreBadge date="2026-07-06" />);
      const status = await screen.findByRole("status");
      expect(status).toHaveAttribute("aria-label", expect.stringContaining(label));
      unmount();
    }
  });
});

describe("HealthScoreBadge — stale-response guard", () => {
  it("does not let a slow response for an old date overwrite the badge after the date has changed", async () => {
    const dA = deferred<HealthScoreResult>();
    const dB = deferred<HealthScoreResult>();

    mockGetHealthScore.mockImplementation((date: string) => {
      if (date === "2026-07-01") return dA.promise;
      if (date === "2026-07-02") return dB.promise;
      return Promise.resolve(okResult(0));
    });

    const { rerender } = render(<HealthScoreBadge date="2026-07-01" />);
    rerender(<HealthScoreBadge date="2026-07-02" />);

    // Resolve the newer date (B) first, then the stale older date (A).
    dB.resolve(okResult(90));
    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-label", expect.stringContaining("90"));

    dA.resolve(okResult(10));
    // Give the (discarded) stale resolution a chance to apply if it were going to.
    await flushAll();

    expect(screen.getByRole("status")).toHaveAttribute("aria-label", expect.stringContaining("90"));
  });

  it("does not let an out-of-order response for the SAME date overwrite a later response for that date (A -> B -> A)", async () => {
    const first = deferred<HealthScoreResult>();
    const second = deferred<HealthScoreResult>();
    const third = deferred<HealthScoreResult>();
    let call = 0;

    mockGetHealthScore.mockImplementation((date: string) => {
      call += 1;
      if (date === "2026-07-01" && call === 1) return first.promise;
      if (date === "2026-07-02") return second.promise;
      if (date === "2026-07-01" && call === 3) return third.promise;
      return Promise.resolve(okResult(0));
    });

    const { rerender } = render(<HealthScoreBadge date="2026-07-01" />);
    rerender(<HealthScoreBadge date="2026-07-02" />);
    rerender(<HealthScoreBadge date="2026-07-01" />);

    // Third (latest, most recent) request for 2026-07-01 resolves first.
    third.resolve(okResult(80));
    let status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-label", expect.stringContaining("80"));

    // The stale FIRST request for the same date resolves late — it must not
    // clobber the newer result even though the date matches.
    first.resolve(okResult(20));
    await flushAll();

    status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", expect.stringContaining("80"));

    second.resolve(okResult(50));
  });
});
