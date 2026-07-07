import { ArrowClockwise, ForkKnife, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "shared";
import type { EnrichedEntry } from "../hooks/useDailyLog";
import { EntryCard } from "./EntryCard";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface EntryListProps {
  status: "loading" | "success" | "error";
  entries: EnrichedEntry[];
  error: string | null;
  onRetry: () => void;
  onUpdated: (entry: LogEntry) => void;
  onDeleted: (id: number) => void;
  // Called once a delete leaves the list empty, so the parent can move focus
  // to a stable page-level anchor (e.g. the "Add food" button) instead of
  // leaving it nowhere once the last row unmounts.
  onEmptyAfterDelete?: () => void;
}

function EntrySkeletonRow({ index }: { index: number }) {
  return (
    <div
      className="animate-pulse rounded-2xl bg-black/[0.03] p-1.5 ring-1 ring-black/5"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="rounded-[calc(1rem-0.25rem)] bg-white p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded-full bg-black/[0.08]" />
            <div className="h-3 w-1/4 rounded-full bg-black/[0.05]" />
            <div className="h-3 w-1/2 rounded-full bg-black/[0.05]" />
          </div>
          <div className="h-9 w-20 rounded-full bg-black/[0.05]" />
        </div>
      </div>
    </div>
  );
}

export function EntryList({
  status,
  entries,
  error,
  onRetry,
  onUpdated,
  onDeleted,
  onEmptyAfterDelete,
}: EntryListProps) {
  // Edit-button DOM nodes for every currently-rendered row, keyed by entry
  // id — populated by each `EntryCard` via `registerEditButton`. Used to
  // restore focus to a sibling row after a delete removes the row that had
  // it (see `handleDeleted` below).
  const editButtonsRef = useRef(new Map<number, HTMLButtonElement>());
  // Entry id (or "empty") to focus once `entries` reflects a just-completed
  // delete — set synchronously in `handleDeleted` (using the pre-removal
  // `entries`/index), then applied in the effect below once the parent's
  // state update has actually removed the entry and re-rendered.
  const [pendingFocusTarget, setPendingFocusTarget] = useState<number | "empty" | null>(null);

  function registerEditButton(id: number, el: HTMLButtonElement | null) {
    if (el) editButtonsRef.current.set(id, el);
    else editButtonsRef.current.delete(id);
  }

  function handleDeleted(id: number) {
    const index = entries.findIndex((entry) => entry.id === id);
    let target: number | "empty" | null = null;
    if (index !== -1) {
      if (entries.length === 1) {
        target = "empty";
      } else if (index + 1 < entries.length) {
        target = entries[index + 1]!.id;
      } else {
        target = entries[index - 1]!.id;
      }
    }
    setPendingFocusTarget(target);
    onDeleted(id);
  }

  useEffect(() => {
    if (pendingFocusTarget === null) return;
    // Deferred via `requestAnimationFrame` (mirrors `useModal`'s initial-focus
    // effect and `EntryCard`'s mount animation) so the focus move happens
    // after this render has committed, once `entries` already reflects the
    // completed delete.
    const frame = requestAnimationFrame(() => {
      if (pendingFocusTarget === "empty") {
        onEmptyAfterDelete?.();
      } else {
        editButtonsRef.current.get(pendingFocusTarget)?.focus();
      }
      setPendingFocusTarget(null);
    });
    return () => cancelAnimationFrame(frame);
    // Only re-run when `entries` actually changes (i.e. once the delete has
    // been applied and the DOM reflects it) — `pendingFocusTarget` itself is
    // read directly from the latest render's closure, not listed as a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading entries">
        <EntrySkeletonRow index={0} />
        <EntrySkeletonRow index={1} />
        <EntrySkeletonRow index={2} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <Card innerClassName="flex flex-col items-center gap-4 p-10 text-center">
        <WarningCircle size={32} weight="light" className="text-muted" aria-hidden="true" />
        <div>
          <p className="font-display text-lg font-semibold text-ink">Couldn't load this day's log</p>
          <p className="mt-1 text-sm text-muted">{error ?? "Something went wrong."}</p>
        </div>
        <Button variant="retry" onClick={onRetry}>
          <ArrowClockwise
            size={16}
            weight="light"
            aria-hidden="true"
            className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-rotate-45"
          />
          Retry
        </Button>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card innerClassName="flex flex-col items-center gap-3 p-10 text-center">
        <ForkKnife size={32} weight="light" className="text-muted" aria-hidden="true" />
        <div>
          <p className="font-display text-lg font-semibold text-ink">Nothing logged yet</p>
          <p className="mt-1 text-sm text-muted">Add the first food for this day to see it here.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          index={index}
          onUpdated={onUpdated}
          onDeleted={handleDeleted}
          registerEditButton={(el) => registerEditButton(entry.id, el)}
        />
      ))}
    </div>
  );
}
