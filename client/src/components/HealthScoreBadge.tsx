import { Info, Minus, Plus, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import type { HealthScoreResult, LogTotals } from "shared";
import { ApiError, getHealthScore } from "../lib/api";
import { FACTORS } from "../lib/healthScoreFactors";
import { Card } from "./ui/Card";

interface HealthScoreBadgeProps {
  date: string;
  // Bumped by the parent after a settings save so the badge re-fetches the
  // same date's score without waiting for a date change (settings edits —
  // e.g. toggling the master switch, or a factor — can change the result
  // for the date already on screen).
  refreshKey?: number;
  // The current day's log totals. Included purely as a fetch trigger (its
  // value isn't read below) — `useDailyLog`'s `computeLogTotals` produces a
  // new object reference every time a log entry is added/edited/removed, so
  // adding it to the fetch effect's dependency array is enough to refetch
  // the score whenever the day's logged foods change, without the parent
  // needing to bump a dedicated key for every mutation.
  totals: LogTotals;
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
// `GET /api/health-score` whenever `date`, `refreshKey`, or `totals` changes.
// Guards against out-of-order responses with a monotonically incrementing
// request id (mirrors `useDailyLog`) rather than comparing against the
// requested date: a same-date re-fetch (e.g. two `refreshKey` bumps in quick
// succession, or a rapid date A -> B -> A navigation) still needs its older
// in-flight response discarded even though the date matches. On
// `status: "ok"`, the badge is a toggleable button that opens a per-factor
// breakdown popover (click, hover, or Enter/Space; Escape or an outside
// click dismisses it).
export function HealthScoreBadge({ date, refreshKey, totals }: HealthScoreBadgeProps) {
  const [state, setState] = useState<State>({ status: "loading", result: null, error: null });
  const requestIdRef = useRef(0);
  // Tracks whether the previously-resolved fetch showed a visible badge, so
  // a transition to `status: "hidden"` (e.g. right after the user turns off
  // the master toggle and saves) can be explicitly announced — otherwise the
  // badge just silently disappears with no confirmation for screen-reader
  // users.
  const previousVisibleRef = useRef(false);
  const [hiddenAnnouncement, setHiddenAnnouncement] = useState<string | null>(null);

  // Breakdown popover open state, tracked as *how* it got opened rather than
  // a plain boolean: a real mouse click always lands on top of the badge,
  // so a naive "clickOpen || hoverOpen" pair would have hover silently
  // re-open (or block the close of) a popover the user just explicitly
  // clicked shut, since the pointer never actually left the element. A click
  // always forces the state fully open or fully closed regardless of
  // whether the pointer is still hovering; hover only opens it from
  // "closed", and only its own mouse-leave closes a hover-opened popover.
  type PopoverSource = "closed" | "hover" | "click";
  const [popoverSource, setPopoverSource] = useState<PopoverSource>("closed");
  const popoverOpen = popoverSource !== "closed";
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  function closePopover() {
    setPopoverSource("closed");
  }

  function toggleFromClick() {
    setPopoverSource((current) => (current === "click" ? "closed" : "click"));
  }

  function openFromHover() {
    setPopoverSource((current) => (current === "closed" ? "hover" : current));
  }

  function closeFromHoverLeave() {
    setPopoverSource((current) => (current === "hover" ? "closed" : current));
  }

  // Escape-to-close and click-outside-to-close, mirroring the spirit of
  // `useModal`'s equivalent handling — only attached while the popover is
  // actually open.
  useEffect(() => {
    if (!popoverOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closePopover();
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closePopover();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [popoverOpen]);

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
  }, [date, refreshKey, totals]);

  // Announce the hidden -> visible -> hidden transition. Skipped while a
  // fetch is in flight or errored (`state.status !== "success"`) so an
  // in-progress reload never clobbers a just-set announcement before its
  // result is known.
  useEffect(() => {
    if (state.status !== "success") return;
    const isVisible = !!state.result && state.result.status !== "hidden";
    // The ref bookkeeping stays synchronous (unlike the `setHiddenAnnouncement`
    // call below) so a second transition arriving within the same animation
    // frame as the first is still tracked correctly — deferring this too
    // would let a same-frame cleanup cancel the first transition's bookkeeping
    // before it ever ran.
    const wasVisible = previousVisibleRef.current;
    previousVisibleRef.current = isVisible;
    if (isVisible === wasVisible) return; // no transition — nothing to announce

    // Deferred via `requestAnimationFrame` rather than a synchronous setState
    // call in the effect body (mirrors `useModal`'s post-mount effects).
    const frame = requestAnimationFrame(() => {
      setHiddenAnnouncement(isVisible ? null : "Health score hidden");
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);

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
    // Usually renders nothing, same as before — except right after a
    // previously-visible badge just became hidden, when a brief sr-only
    // announcement confirms the disappearance for screen-reader users.
    return hiddenAnnouncement ? (
      <span aria-live="polite" className="sr-only">
        {hiddenAnnouncement}
      </span>
    ) : null;
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
    <div ref={containerRef} className="relative inline-flex">
      {/* A real `<button>` (not the plain `<div>` this used to be) so the
          breakdown popover is reachable and toggleable via mouse, touch, and
          keyboard alike. The old `role="status"` announced content changes
          via its accessible children's text; a bare `aria-label` on a button
          doesn't reliably get the same treatment (live-region announcements
          fire on text/child-list mutations inside the accessible subtree, and
          both child spans below are `aria-hidden`). Instead, a real,
          non-hidden `sr-only` span carries the changing text and its own
          `aria-live="polite"` — the same pattern `DaySummary` already uses
          for its calorie-total announcement. */}
      <button
        type="button"
        aria-expanded={popoverOpen}
        aria-controls={popoverId}
        aria-haspopup="true"
        aria-label={`Health score ${rounded} out of 100, ${band.label}`}
        onClick={toggleFromClick}
        onMouseEnter={openFromHover}
        onMouseLeave={closeFromHoverLeave}
        className="flex items-center gap-2 rounded-full bg-black/[0.04] py-1 pl-1 pr-3 transition-colors duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <span aria-live="polite" className="sr-only">
          Health score {rounded} out of 100, {band.label}
        </span>
        <span
          aria-hidden="true"
          className={`flex h-6 min-w-[1.75rem] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${band.fillClass}`}
        >
          {rounded}
        </span>
        <span aria-hidden="true" className="text-xs font-semibold text-ink">
          {band.label}
        </span>
      </button>

      {popoverOpen && (
        <Card
          id={popoverId}
          role="group"
          aria-label="Health score breakdown"
          radius="sm"
          shadow="modal"
          className="absolute left-0 top-full z-10 mt-2 w-80 max-w-[calc(100vw-2.5rem)]"
          innerClassName="flex flex-col divide-y divide-black/5 p-4"
        >
          {FACTORS.map((factor) => {
            const factorResult = result.factors[factor.key];
            return (
              <div key={factor.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0 text-xs font-medium text-ink">{factor.label}</span>
                {factorResult === null ? (
                  <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-muted">
                    <span aria-hidden="true">—</span>
                    not counted today
                  </span>
                ) : factorResult.score >= 50 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="sr-only">Good</span>
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-good)]/10"
                    >
                      <Plus size={12} weight="bold" className="text-[var(--color-good)]" />
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="sr-only">Needs work</span>
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-danger)]/10"
                    >
                      <Minus size={12} weight="bold" className="text-[var(--color-danger)]" />
                    </span>
                  </span>
                )}
              </div>
            );
          })}

          {result.message && (
            <p className="mt-2 border-t border-black/5 pt-3 font-display text-sm font-medium text-ink">
              {result.message}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
