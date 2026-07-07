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

describe("HealthScoreBadge — hidden-transition announcement", () => {
  it("does not announce anything the first time the badge resolves to hidden", async () => {
    mockGetHealthScore.mockResolvedValue({ status: "hidden" });
    const { container } = render(<HealthScoreBadge date="2026-07-06" />);

    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument());
    expect(container.querySelector('[aria-live="polite"]')).not.toBeInTheDocument();
  });

  it("announces 'Health score hidden' when a previously-visible badge becomes hidden", async () => {
    mockGetHealthScore.mockResolvedValueOnce(okResult(80));
    const { rerender } = render(<HealthScoreBadge date="2026-07-06" refreshKey={0} />);
    await screen.findByRole("status");

    mockGetHealthScore.mockResolvedValueOnce({ status: "hidden" });
    rerender(<HealthScoreBadge date="2026-07-06" refreshKey={1} />);

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText("Health score hidden")).toBeInTheDocument(),
    );
    const liveRegion = screen.getByText("Health score hidden");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveClass("sr-only");
  });

  // Exercises the specific timing bug the builder says it previously hit:
  // a hidden -> visible -> hidden double-transition landing before either
  // rAF-deferred announcement frame has actually fired. The first
  // transition's frame must be canceled (by the effect's own cleanup, since
  // `state` changed again before it ran) so only the second, correct,
  // final announcement ever applies.
  it("still ends up announcing correctly after a hidden -> visible -> hidden sequence where both transitions land before any deferred frame fires", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      nextId += 1;
      frames.set(nextId, cb);
      return nextId;
    });
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      frames.delete(handle);
    });

    mockGetHealthScore.mockResolvedValueOnce({ status: "hidden" });
    const { rerender } = render(<HealthScoreBadge date="2026-07-06" refreshKey={0} />);

    // Baseline hidden on first-ever resolve: no transition, no frame scheduled.
    return (async () => {
      await flushAll();
      expect(frames.size).toBe(0);

      // hidden -> visible: schedules a frame (clears any hidden announcement).
      mockGetHealthScore.mockResolvedValueOnce(okResult(80));
      rerender(<HealthScoreBadge date="2026-07-06" refreshKey={1} />);
      await flushAll();
      expect(frames.size).toBe(1);

      // visible -> hidden, before the first frame above ever fired: the
      // effect's cleanup must cancel that stale frame and schedule a new one.
      mockGetHealthScore.mockResolvedValueOnce({ status: "hidden" });
      rerender(<HealthScoreBadge date="2026-07-06" refreshKey={2} />);
      await flushAll();
      expect(frames.size).toBe(1); // stale frame canceled, exactly one live frame remains

      // Now let whatever frame(s) actually remain fire, in schedule order.
      act(() => {
        for (const cb of frames.values()) cb(0);
      });

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByText("Health score hidden")).toBeInTheDocument();

      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    })();
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
