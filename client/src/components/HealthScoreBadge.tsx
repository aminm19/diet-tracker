import { Info, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { HealthScoreResult } from "shared";
import { ApiError, getHealthScore } from "../lib/api";

interface HealthScoreBadgeProps {
  date: string;
  // Bumped by the parent after a settings save so the badge re-fetches the
  // same date's score without waiting for a date change (settings edits —
  // e.g. toggling the master switch, or a factor — can change the result
  // for the date already on screen).
  refreshKey?: number;
}

interface ScoreBand {
  label: string;
  fillClass: string;
}

// Red -> green mapping for the composite, banded rather than continuously
// interpolated (simpler to keep each band's fill color pre-verified for AA
// contrast against its white numeral text — see index.css). The numeric
// score and an explicit text label always accompany the color, so nothing
// here depends on color alone.
function scoreBand(score: number): ScoreBand {
  if (score >= 75) return { label: "Good", fillClass: "bg-[var(--color-good)]" };
  if (score >= 50) return { label: "Fair", fillClass: "bg-[var(--color-warning)]" };
  return { label: "Needs work", fillClass: "bg-[var(--color-danger)]" };
}

type Status = "loading" | "success" | "error";

interface State {
  status: Status;
  result: HealthScoreResult | null;
  error: string | null;
}

// Compact composite health-score indicator for the daily log view. Fetches
// `GET /api/health-score` whenever `date` (or `refreshKey`) changes. Guards
// against out-of-order responses with a monotonically incrementing request
// id (mirrors `useDailyLog`) rather than comparing against the requested
// date: a same-date re-fetch (e.g. two `refreshKey` bumps in quick
// succession, or a rapid date A -> B -> A navigation) still needs its older
// in-flight response discarded even though the date matches.
export function HealthScoreBadge({ date, refreshKey }: HealthScoreBadgeProps) {
  const [state, setState] = useState<State>({ status: "loading", result: null, error: null });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    // Async work runs inside a nested async IIFE (mirrors `useDailyLog`) so
    // state updates synchronize with the fetch's *result*, not the effect's
    // own synchronous execution.
    void (async () => {
      setState({ status: "loading", result: null, error: null });

      try {
        const result = await getHealthScore(date);
        if (requestId !== requestIdRef.current) return; // superseded by a newer fetch
        setState({ status: "success", result, error: null });
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        const message = err instanceof ApiError ? err.message : "Couldn't load health score.";
        setState({ status: "error", result: null, error: message });
      }
    })();
  }, [date, refreshKey]);

  if (state.status === "loading") {
    return (
      <div
        className="h-7 w-36 animate-pulse rounded-full bg-black/[0.05]"
        aria-busy="true"
        aria-label="Loading health score"
      />
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-red-600">
        <WarningCircle size={14} weight="light" aria-hidden="true" />
        {state.error ?? "Couldn't load health score."}
      </p>
    );
  }

  const result = state.result;
  if (!result || result.status === "hidden") {
    return null;
  }

  if (result.status === "insufficient_data") {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-medium text-muted">
        <Info size={14} weight="light" aria-hidden="true" />
        Not enough data yet
      </div>
    );
  }

  const rounded = Math.round(result.score);
  // Band off the rounded value, not the raw score — otherwise a score like
  // 74.6 could display as "75" while being colored/labeled "Fair", which
  // reads as contradictory even though each half is individually correct.
  const band = scoreBand(rounded);

  return (
    <div
      role="status"
      aria-label={`Health score ${rounded} out of 100, ${band.label}`}
      className="flex items-center gap-2 rounded-full bg-black/[0.04] py-1 pl-1 pr-3"
    >
      <span
        aria-hidden="true"
        className={`flex h-6 min-w-[1.75rem] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${band.fillClass}`}
      >
        {rounded}
      </span>
      <span aria-hidden="true" className="text-xs font-semibold text-ink">
        {band.label}
      </span>
    </div>
  );
}
